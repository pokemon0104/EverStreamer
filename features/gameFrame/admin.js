/* ゲーム枠タブ */
(function () {
  'use strict';
  const { h } = UI;
  const G = () => OV.state.gameFrame || {};
  const send = (patch) => ADM.send('gameFrame:update', { patch });
  const gk = (k) => ({ get: () => G()[k], set: (v) => send({ [k]: v }) });
  const frames = () => (OV.frameDefs ? OV.frameDefs() : OV.catalogs.gameFrames || []);
  const FC = () => OV.state.frameCustom || {};
  // 枠の調整を送る(画面はすぐ変える)
  const sendCustom = (id, patch) => {
    const all = OV.raw.frameCustom || (OV.raw.frameCustom = {});
    const cur = all[id] || (all[id] = {});
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete cur[k];
      else if (k === 'layers' || v === false || typeof v !== 'object') cur[k] = v;
      else cur[k] = { ...(cur[k] || {}), ...v };
    }
    ADM.send('gameFrame:custom', { id, patch }, 'frameCustom');
    ADM.changed();
  };
  // 色(rgba やグラデーションも書ける欄 + 色を選ぶボタン)
  function colorField(label, get, set) {
    const pick = h('input', { type: 'color' });
    const txt = h('input', { type: 'text', class: 'gf-ctext', spellcheck: 'false' });
    pick.addEventListener('input', () => { txt.value = pick.value; set(pick.value); });
    txt.addEventListener('change', () => set(txt.value.trim()));
    const row = UI.field(label, pick, txt);
    return UI.bind(row, () => {
      const v = String(get() || '');
      if (document.activeElement !== txt) txt.value = v;
      const m = v.match(/#[0-9a-f]{6}/i) || v.match(/#[0-9a-f]{3}\b/i);
      if (m && document.activeElement !== pick) pick.value = m[0].length === 4 ? `#${m[0][1]}${m[0][1]}${m[0][2]}${m[0][2]}${m[0][3]}${m[0][3]}` : m[0];
    });
  }
  const fontOptions = () => (OV.catalogs.fonts || []).map((f) => [f.family, f.label || f.family]);
  /** いま調整する枠(表示中の枠。画像の枠・枠なしのときは null) */
  const targetDef = () => {
    const fr = OV.resolveFrame ? OV.resolveFrame({ ...OV.state, gameFrame: { ...G(), enabled: true } }) : null;
    return fr && fr.kind === 'css' && fr.def.id !== 'none' ? fr.def : null;
  };

  // ---- 画像から「ゲーム映像の穴」を見つけて、透明にする ----
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('画像を読み込めませんでした')); };
      im.src = url;
    });
  }
  function detectHole(c) {
    const W = c.width, H = c.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const dark = (i) => d[i * 4 + 3] < 16 || (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3 < 56;
    // 中心付近から、暗い(または透明な)点を探す
    let seed = -1;
    const cx = W >> 1, cy = H >> 1;
    for (let r = 0; r < Math.min(W, H) / 4 && seed < 0; r += 6) {
      for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && dark(y * W + x)) { seed = y * W + x; break; }
      }
    }
    if (seed < 0) return null;
    const mask = new Uint8Array(W * H);
    const stack = [seed];
    mask[seed] = 1;
    let minX = W, minY = H, maxX = 0, maxY = 0, n = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      n++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x > 0 && !mask[p - 1] && dark(p - 1)) { mask[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && !mask[p + 1] && dark(p + 1)) { mask[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !mask[p - W] && dark(p - W)) { mask[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && !mask[p + W] && dark(p + W)) { mask[p + W] = 1; stack.push(p + W); }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (bw * bh < W * H * 0.04 || minX === 0 || minY === 0 || maxX === W - 1 || maxY === H - 1) return null;
    // 行ごとに、穴の左端〜右端の間(透かし模様など)も穴に含める
    for (let y = minY; y <= maxY; y++) {
      let a = -1, b = -1;
      for (let x = minX; x <= maxX; x++) if (mask[y * W + x]) { if (a < 0) a = x; b = x; }
      if (a >= 0) for (let x = a; x <= b; x++) mask[y * W + x] = 1;
    }
    // 縁の黒〜灰色のにじみが残らないよう、2px だけ外へ広げる(白い帯までは広げない)
    const out = new Uint8Array(mask);
    const soft = (p) => (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3 < 140;
    for (let it = 0; it < 2; it++) {
      const cur = new Uint8Array(out);
      for (let y = minY - 2; y <= maxY + 2; y++) for (let x = minX - 2; x <= maxX + 2; x++) {
        const p = y * W + x;
        if (!cur[p] && (cur[p - 1] || cur[p + 1] || cur[p - W] || cur[p + W]) && soft(p)) out[p] = 1;
      }
    }
    for (let p = 0; p < W * H; p++) if (out[p]) d[p * 4 + 3] = 0;
    ctx.putImageData(img, 0, 0);
    return { x: minX / W, y: minY / H, w: bw / W, h: bh / H };
  }
  async function importImage(file) {
    if (!/\.(png|webp|jpe?g)$/i.test(file.name)) { ADM.toast('PNG / JPG / WebP の枠画像を選んでください', 'warn'); return; }
    try {
      const im = await loadImage(file);
      const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const hole = detectHole(c);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const name = file.name.replace(/\.[^.]+$/, '');
      const r = await fetch('/api/frames', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(name + '.png'), 'Content-Type': 'application/octet-stream' }, body: blob });
      const j = await r.json();
      if (!r.ok) { ADM.toast(j.error || '取り込めませんでした', 'error'); return; }
      ADM.send('gameFrame:addImage', { file: j.file, name, iw: c.width, ih: c.height, hole: hole || { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
      ADM.toast(hole ? 'ゲーム映像の穴を見つけて、透明にしました' : '穴を自動で見つけられませんでした。下の数値で位置を合わせてください', hole ? undefined : 'warn');
    } catch (e) { ADM.toast(`取り込めませんでした: ${e.message}`, 'error'); }
  }

  // ---- 一覧の見本 ----
  function tile(id, name, fr, rectOf, extra) {
    const pv = h('div', { class: 'gf-pv' });
    const stage = h('div', { class: 'gf-stage' });
    const rect = rectOf;
    const gm = h('div', { class: 'gf-game', style: { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` } });
    const box = h('div', { class: 'gf-box', style: { position: 'absolute', inset: '0' } });
    stage.append(gm, box);
    pv.append(stage);
    if (fr) OV.renderGameFrameInto(box, fr, rect, { opacity: 1 });
    const b = h('button', { type: 'button', class: 'gf-btn', title: name, onclick: () => send({ frameId: id }) }, pv, h('span', { class: 'nm' }, name), extra || '');
    b.dataset.id = id;
    requestAnimationFrame(() => { const s = pv.clientWidth / 320; if (s) stage.style.transform = `scale(${s})`; });
    new ResizeObserver(() => { const s = pv.clientWidth / 320; if (s) stage.style.transform = `scale(${s})`; }).observe(pv);
    return b;
  }
  const cssRect = (def) => {
    const O = (def.layers || []).reduce((a, l) => a + (Number(l.w) || 0), 0) + 8;
    const m = Math.max(30, O + 12);
    let w = 320 - m * 2, hh = 240 - m * 2;
    const [a, b] = String(def.ratio || '').split(':').map(Number);
    if (a > 0 && b > 0) { w = Math.min(w, hh * a / b); hh = w * b / a; }
    return { x: Math.round((320 - w) / 2), y: Math.round((240 - hh) / 2), w: Math.round(w), h: Math.round(hh) };
  };
  const imgRect = (img) => {
    const A = img.iw / img.ih, tw = Math.min(300, 220 * A), k = tw / img.iw, th = tw / A;
    const ox = (320 - tw) / 2, oy = (240 - th) / 2;
    return { x: Math.round(ox + img.hole.x * img.iw * k), y: Math.round(oy + img.hole.y * img.ih * k), w: Math.round(img.hole.w * img.iw * k), h: Math.round(img.hole.h * img.ih * k) };
  };

  ADM.registerTab({
    id: 'gameFrame',
    label: 'ゲーム枠',
    order: 47,
    sig: () => JSON.stringify([(targetDef() || {}).id, ((targetDef() || {}).layers || []).length, !!(targetDef() || {}).glow, !!(targetDef() || {}).shadow, !!(targetDef() || {}).corners, frames().map((f) => f.customized ? f.id : ''), frames().length, (G().images || []).map((i) => i.id + i.file), OV.canvas]),
    build(root) {
      const info = h('div', { class: 'note-box' });
      UI.bind(info, () => {
        const fr = OV.resolveFrame ? OV.resolveFrame(OV.state) : null;
        info.style.display = G().enabled ? '' : 'none';
        if (!G().enabled) return;
        if (!fr) { info.textContent = '現在の枠: なし'; return; }
        const r = OV.gameWindowRect(OV.state);
        const nm = fr.kind === 'img' ? fr.img.name : fr.def.name;
        info.textContent = `現在の枠: ${nm} ／ OBS のゲーム映像は、左 ${r.x}px・上 ${r.y}px、幅 ${r.w}px × 高さ ${r.h}px に置くと、枠の中にぴったり収まります。${(G().size || {}).mode === 'manual' ? '(自分で指定した大きさ)' : ''}`;
      });
      root.append(
        UI.toggle({ label: 'ゲーム枠を表示する', ...gk('enabled') }),
        h('p', { class: 'hint' }, 'ゲーム映像のまわりに枠を重ねます。枠の中(ゲーム映像の場所)は透明なので、OBS ではこのオーバーレイをゲーム映像より上に置いてください。「ゲーム映像の場所」は、背景タブ/レイアウトタブの設定に従い、枠ごと収まるように自動で計算します。'),
        info,
        h('p', { class: 'hint' }, '「テンプレートの枠」は、クイック設定で選んだテンプレートとメインカラーに合わせて変わります。'));

      // ゲーム映像の大きさ・位置
      const Z = () => G().size || {};
      const autoRect = () => {
        const S2 = new Proxy(OV.state, { get: (t, k) => (k === 'gameFrame' ? { ...t.gameFrame, size: { ...(t.gameFrame || {}).size, mode: 'auto' } } : t[k]) });
        return OV.gameWindowRect(S2);
      };
      const sendSize = (patch) => send({ size: patch });
      const zk = (k) => ({
        get: () => Z()[k],
        set: (v) => {
          const n = Math.round(Number(v) || 0);
          const z = Z();
          if (z.keepRatio !== false && (k === 'w' || k === 'h') && z.w > 0 && z.h > 0) {
            const r = z.w / z.h;
            sendSize(k === 'w' ? { w: n, h: Math.round(n / r) } : { h: n, w: Math.round(n * r) });
          } else sendSize({ [k]: n });
        },
      });
      // 中心を保ったまま、大きさを変える
      const grow = (d) => {
        const z = Z(); const r = z.w / z.h;
        const w = Math.max(40, z.w + d), hh = Math.round(w / r);
        sendSize({ w, h: z.keepRatio !== false ? hh : z.h, x: Math.round(z.x - (w - z.w) / 2), y: z.keepRatio !== false ? Math.round(z.y - (hh - z.h) / 2) : z.y });
      };
      const move = (dx, dy) => sendSize({ x: Z().x + dx, y: Z().y + dy });
      const center = (axis) => {
        const a = autoRect(), z = Z();
        if (axis === 'x') sendSize({ x: Math.round(a.x + a.w / 2 - z.w / 2) });
        else sendSize({ y: Math.round(a.y + a.h / 2 - z.h / 2) });
      };
      root.append(
        h('h3', { class: 'h' }, 'ゲーム映像の大きさ・位置'),
        UI.seg({ label: '決め方', options: [['auto', '自動'], ['manual', '自分で指定']], get: () => Z().mode || 'auto', set: (v) => {
          if (v === 'manual') { const a = OV.gameWindowRect(OV.state); sendSize({ mode: 'manual', x: a.x, y: a.y, w: a.w, h: a.h }); } else sendSize({ mode: 'auto' });
        } }),
        UI.when(() => Z().mode !== 'manual', h('p', { class: 'hint' }, '背景タブ/レイアウトタブの設定から、枠ごと収まる大きさを自動で決めます。実際のゲーム映像と大きさが合わないときは「自分で指定」にしてください。')),
        UI.when(() => Z().mode === 'manual', h('div', null,
          h('p', { class: 'hint' }, 'OBS でゲーム映像のソースを右クリック →「変換」→「変換の編集」に出る「位置」と「サイズ」の値を、そのまま入力すると枠がぴったり合います(枠は、この範囲の外側に描かれます)。'),
          UI.num({ label: 'X(左から)', min: 0, max: OV.W, step: 1, unit: 'px', ...zk('x') }),
          UI.num({ label: 'Y(上から)', min: 0, max: OV.H, step: 1, unit: 'px', ...zk('y') }),
          UI.num({ label: '幅', min: 40, max: OV.W, step: 1, unit: 'px', ...zk('w') }),
          UI.num({ label: '高さ', min: 40, max: OV.H, step: 1, unit: 'px', ...zk('h') }),
          UI.toggle({ label: '縦横比を保つ(幅を変えると高さも変わる)', get: () => Z().keepRatio !== false, set: (v) => sendSize({ keepRatio: v }) }),
          UI.field('大きさ', UI.button('− 小さく', () => grow(-10)), UI.button('＋ 大きく', () => grow(10))),
          UI.field('位置', UI.button('←', () => move(-2, 0)), UI.button('→', () => move(2, 0)), UI.button('↑', () => move(0, -2)), UI.button('↓', () => move(0, 2))),
          UI.field('寄せる', UI.button('左右の中央', () => center('x')), UI.button('上下の中央', () => center('y'))),
          UI.field('', UI.button('自動の大きさに戻す', () => { const a = autoRect(); sendSize({ x: a.x, y: a.y, w: a.w, h: a.h }); })))));

      // 枠の一覧
      const grid = h('div', { class: 'gf-grid' });
      const btns = [];
      for (const def of frames()) btns.push(grid.appendChild(tile(def.id, def.name, def.id === 'none' ? null : { kind: 'css', def }, cssRect(def))));

      (G().images || []).forEach((img) => {
        const x = h('button', { type: 'button', class: 'x', title: '削除' }, '×');
        x.addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`「${img.name}」を削除しますか?`)) ADM.send('gameFrame:removeImage', { id: img.id }); });
        btns.push(grid.appendChild(tile(`img:${img.id}`, `🖼 ${img.name}`, { kind: 'img', img }, imgRect(img), x)));
      });
      const cur = h('div');
      UI.bind(cur, () => {
        const fr = OV.resolveFrame ? OV.resolveFrame(OV.state) : null;
        btns.forEach((b) => b.classList.toggle('on', b.dataset.id === G().frameId));
        cur.dataset.now = fr ? fr.id : '';
      });
      root.append(h('h3', { class: 'h' }, '枠の種類'), grid, cur);

      // サイドバーのスタイルを、枠の種類に合わせる(一括で連動)
      const linkInfo = h('p', { class: 'hint' });
      UI.bind(linkInfo, () => {
        const ps = (OV.state.panels || []).filter((p) => p.type !== 'group' && p.type !== 'space');
        const n = ps.filter((p) => p.styleId === 'frame:auto').length;
        linkInfo.textContent = n === ps.length && n ? `連動中:この画面のパネル ${n} 個すべてが、枠の種類と同じスタイルです。枠を切り替えると、パネルも一緒に切り替わります。`
          : n ? `この画面のパネル ${ps.length} 個のうち ${n} 個が連動中です。` : 'いまは連動していません。押すと、この画面のパネルすべてのスタイルが、枠の種類と同じデザインになります。';
      });
      root.append(h('h3', { class: 'h' }, 'サイドバーのスタイルと連動'),
        h('div', { class: 'row' },
          UI.button('枠の種類にスタイルを合わせる(一括で連動)', () => ADM.send('panels:setStyle', { all: true, styleId: 'frame:auto' }), 'primary'),
          UI.button('横・縦の両方の画面で連動', () => {
            ADM.hub.send('panels:setStyle', { all: true, styleId: 'frame:auto' });
            ADM.hub.send('panels:setStyle', { all: true, styleId: 'frame:auto', canvas: 'v' });
            ADM.toast('横画面・縦画面のパネルを、枠の種類と連動しました');
          }, 'small')),
        linkInfo,
        h('p', { class: 'hint' }, '連動をやめるときは、パネルの「スタイル」で好きなスタイルを選びます。パネルのスタイル一覧にも、枠の種類と同じものが「ゲーム枠と同じスタイル」として並んでいます。'));

      // 選んでいる枠の調整(スタイルの「枠と背景」と同じように、好みに変える)
      const T = targetDef();
      if (T) {
        const id = T.id;
        const D = () => frames().find((f) => f.id === id) || T;
        const ed = h('div');
        const layers = () => (D().layers || []).map((l) => ({ w: l.w, fill: l.fill }));
        const setLayers = (arr) => sendCustom(id, { layers: arr });
        layers().forEach((l, i) => {
          const L = () => layers()[i] || {};
          ed.append(h('div', { class: 'gf-layer-ed' },
            h('div', { class: 'row' }, h('b', null, `帯 ${i + 1}${i === 0 ? '(内側)' : i === layers().length - 1 ? '(外側)' : ''}`), h('span', { style: { flex: 1 } }),
              UI.button('↑内', () => { const a = layers(); if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; setLayers(a); } }, 'small'),
              UI.button('↓外', () => { const a = layers(); if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; setLayers(a); } }, 'small'),
              UI.button('×', () => { const a = layers(); a.splice(i, 1); setLayers(a); }, 'small danger')),
            UI.num({ label: '太さ', min: 0, max: 60, step: 1, unit: 'px', get: () => L().w, set: (v) => { const a = layers(); a[i].w = Number(v); setLayers(a); } }),
            colorField('色', () => L().fill, (v) => { const a = layers(); a[i].fill = v; setLayers(a); })));
        });
        const ratioOpts = [['__def', '枠の初期'], ['', '背景タブに合わせる'], ['16:9', '16:9'], ['21:9', '21:9'], ['4:3', '4:3'], ['3:2', '3:2'], ['1:1', '1:1'], ['9:16', '9:16']];
        const onOff = (k, label, def) => UI.toggle({ label, get: () => !!D()[k], set: (v) => sendCustom(id, { [k]: v ? def : false }) });
        root.append(UI.section('gf-edit', `枠の調整(${T.name})`,
          h('p', { class: 'hint' }, 'いま表示している枠の、色・太さ・光・影を変えられます。変えた内容は、この枠を使う横・縦の両方の画面と、「ゲーム枠と同じスタイル」のパネルにも反映されます。'),
          h('h3', { class: 'h' }, '枠の帯(内側から順)'), ed,
          h('div', { class: 'row' }, UI.button('+ 帯を外側に追加', () => setLayers([...layers(), { w: 4, fill: '#ffffff' }]), 'small primary'),
            UI.button('+ 帯を内側に追加', () => setLayers([{ w: 4, fill: '#ffffff' }, ...layers()]), 'small')),
          h('p', { class: 'hint' }, '色には #ffffff のほか、rgba(255,255,255,.5) や linear-gradient(90deg,#f00,#00f) のようなグラデーションも書けます。'),
          h('h3', { class: 'h' }, '形'),
          UI.num({ label: '角丸', min: 0, max: 60, step: 1, unit: 'px', get: () => D().radius || 0, set: (v) => sendCustom(id, { radius: Number(v) }) }),
          UI.select({ label: '縦横比', options: ratioOpts, get: () => ((FC()[id] || {}).ratio == null ? '__def' : FC()[id].ratio), set: (v) => sendCustom(id, { ratio: v === '__def' ? null : v }) }),
          h('h3', { class: 'h' }, '光・影・四隅'),
          onOff('glow', '光(グロー)', { color: 'rgba(255,255,255,.6)', blur: 14 }),
          UI.when(() => !!D().glow, h('div', null,
            colorField('光の色', () => (D().glow || {}).color, (v) => sendCustom(id, { glow: { color: v } })),
            UI.num({ label: '光の広がり', min: 0, max: 60, step: 1, unit: 'px', get: () => (D().glow || {}).blur, set: (v) => sendCustom(id, { glow: { blur: Number(v) } }) }))),
          onOff('shadow', '影', { y: 6, blur: 18, color: 'rgba(0,0,0,.5)' }),
          UI.when(() => !!D().shadow, h('div', null,
            UI.num({ label: '影のぼかし', min: 0, max: 60, step: 1, unit: 'px', get: () => (D().shadow || {}).blur, set: (v) => sendCustom(id, { shadow: { blur: Number(v) } }) }),
            UI.num({ label: '影の下ずれ', min: 0, max: 40, step: 1, unit: 'px', get: () => (D().shadow || {}).y, set: (v) => sendCustom(id, { shadow: { y: Number(v) } }) }),
            colorField('影の色', () => (D().shadow || {}).color, (v) => sendCustom(id, { shadow: { color: v } })))),
          onOff('corners', '四隅のカギ型', { len: 30, w: 4, color: '#ffffff', gap: 8 }),
          UI.when(() => !!D().corners, h('div', null,
            colorField('カギの色', () => (D().corners || {}).color, (v) => sendCustom(id, { corners: { color: v } })),
            UI.num({ label: 'カギの長さ', min: 6, max: 120, step: 1, unit: 'px', get: () => (D().corners || {}).len, set: (v) => sendCustom(id, { corners: { len: Number(v) } }) }),
            UI.num({ label: 'カギの太さ', min: 1, max: 16, step: 1, unit: 'px', get: () => (D().corners || {}).w, set: (v) => sendCustom(id, { corners: { w: Number(v) } }) }),
            UI.num({ label: '映像とのすき間', min: 0, max: 40, step: 1, unit: 'px', get: () => (D().corners || {}).gap, set: (v) => sendCustom(id, { corners: { gap: Number(v) } }) }))),
          h('h3', { class: 'h' }, 'パネルの背景と文字(「ゲーム枠と同じスタイル」のパネル)'),
          colorField('背景色', () => (D().panel || {}).bgColor, (v) => sendCustom(id, { panel: { bgColor: v } })),
          UI.num({ label: '背景の濃さ', min: 0, max: 1, step: 0.05, get: () => ((D().panel || {}).bgAlpha == null ? 0.9 : D().panel.bgAlpha), set: (v) => sendCustom(id, { panel: { bgAlpha: Number(v) } }) }),
          UI.text({ label: '背景のグラデーション', placeholder: 'linear-gradient(180deg, #123 0%, #456 100%)', get: () => (D().panel || {}).bgImage || '', set: (v) => sendCustom(id, { panel: { bgImage: v } }) }),
          colorField('文字の色', () => (D().panel || {}).textColor, (v) => sendCustom(id, { panel: { textColor: v } })),
          colorField('見出しの色', () => (D().panel || {}).headingColor, (v) => sendCustom(id, { panel: { headingColor: v } })),
          colorField('数字の色', () => (D().panel || {}).numberColor, (v) => sendCustom(id, { panel: { numberColor: v } })),
          UI.select({ label: 'フォント', options: fontOptions, get: () => (D().panel || {}).font || 'Noto Sans JP', set: (v) => sendCustom(id, { panel: { font: v } }) }),
          UI.select({ label: '見出しのフォント', options: () => [['', '本文と同じ'], ...fontOptions()], get: () => (D().panel || {}).headingFont || '', set: (v) => sendCustom(id, { panel: { headingFont: v } }) }),
          h('div', { class: 'row end' }, UI.button('この枠の調整を初期に戻す', () => { if (confirm(`「${T.name}」の調整を、初期の状態に戻しますか?`)) { delete (OV.raw.frameCustom || {})[id]; ADM.send('gameFrame:resetCustom', { id }); ADM.changed(); } }, 'small danger'))));
      } else {
        root.append(h('p', { class: 'hint' }, '枠の調整は、用意した枠(画像の枠・枠なし以外)を表示しているときにできます。'));
      }


      // 調整
      root.append(
        h('h3', { class: 'h' }, '調整'),
        UI.toggle({ label: '枠に合わせて縦横比を変える', ...gk('autoRatio') }),
        h('p', { class: 'hint' }, 'オンにすると、枠に縦横比(4:3 など)が決めてあるときは、その比率でゲーム映像の場所を決めます(背景タブの縦横比より優先)。'),
        UI.num({ label: '枠の不透明度', min: 0, max: 1, step: 0.05, ...gk('opacity') }),
        UI.num({ label: '周辺を暗くする', min: 0, max: 1, step: 0.05, ...gk('vignette') }),
        h('p', { class: 'hint' }, '枠の種類は config/game-frames.json で追加・編集できます。'));

      // 画像から取り込む
      const file = h('input', { type: 'file', accept: '.png,.jpg,.jpeg,.webp,image/*', style: { display: 'none' } });
      file.addEventListener('change', () => { if (file.files[0]) importImage(file.files[0]); file.value = ''; });
      const drop = h('div', { class: 'dropzone', onclick: () => file.click() }, 'いま使っている枠の画像をドロップ、またはクリックして選択(PNG / JPG / WebP)');
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) importImage(f); });
      root.append(h('h3', { class: 'h' }, '自分の枠画像を取り込む'),
        h('p', { class: 'hint' }, 'ゲーム映像の場所が黒くふさがっている枠画像でも、中央の黒い部分を自動で見つけて透明にします。'),
        drop, file);
      (G().images || []).forEach((img) => {
        const hk = (k, mul) => ({
          get: () => Math.round(((((G().images || []).find((i) => i.id === img.id) || img).hole || {})[k] || 0) * 1000) / 10,
          set: (v) => ADM.send('gameFrame:updateImage', { id: img.id, patch: { hole: { [k]: Number(v) / 100 } } }),
        });
        root.append(UI.when(() => G().frameId === `img:${img.id}`, h('div', { class: 'stack' },
          h('h3', { class: 'h' }, `「${img.name}」のゲーム映像の穴`),
          UI.num({ label: '左から', min: 0, max: 90, step: 0.1, unit: '%', ...hk('x') }),
          UI.num({ label: '上から', min: 0, max: 90, step: 0.1, unit: '%', ...hk('y') }),
          UI.num({ label: '幅', min: 5, max: 100, step: 0.1, unit: '%', ...hk('w') }),
          UI.num({ label: '高さ', min: 5, max: 100, step: 0.1, unit: '%', ...hk('h') }))));
      });
    },
  });
})();
