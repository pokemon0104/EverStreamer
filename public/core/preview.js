/* 管理画面のプレビュー:1920x1080(縦画面は 1080x1920)を縮小表示。ドラッグ移動・リサイズ・見え方の確認 */
(function () {
  'use strict';
  const { h } = UI;
  const { clamp } = OV.util;
  const V = OV.canvas === 'v';
  // 縦画面:PC では 16:9 のプレーヤーの中に縦長で表示される(約405px幅)/スマホは全画面(約390px幅)
  const VIEWS = V
    ? [['fit', '画面に合わせる'], ['actual', '実寸 100%'], ['pc', 'PC視聴 405px'], ['phone', 'スマホ視聴 390px']]
    : [['fit', '画面に合わせる'], ['actual', '実寸 100%'], ['pc', 'PC視聴 854px'], ['phone', 'スマホ視聴 390px']];
  const VIEW_W = V ? { pc: 405, phone: 390 } : { pc: 854, phone: 390 };
  const BGS = [['game', 'ダミー映像'], ['check', '透過チェック'], ['black', '黒']];
  const EDGES = { right: ['w', 'n', 's'], left: ['e', 'n', 's'], bottom: ['n', 'w', 'e'], top: ['s', 'w', 'e'], free: ['n', 's', 'w', 'e'] };

  // ---- ゲーム映像の場所(プレビューでドラッグ・レイアウトタブで数値) ----
  // ゲーム枠を使っているときはゲーム枠の「大きさ・位置」、使っていないときは背景の「ゲーム映像の場所」に書く
  ADM.gameArea = {
    rect: () => OV.gameWindowRect(OV.state),
    usesFrame: () => !!(OV.frameActive && OV.frameActive(OV.state)),
    manual() {
      if (ADM.gameArea.usesFrame()) return ((OV.state.gameFrame || {}).size || {}).mode === 'manual';
      return (((OV.state.background || {}).game) || {}).mode === 'manual';
    },
    set(patch) {
      const S = OV.state;
      const r = { ...ADM.gameArea.rect(), ...patch };
      const rect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.max(40, Math.round(r.w)), h: Math.max(40, Math.round(r.h)) };
      if (ADM.gameArea.usesFrame()) {
        S.gameFrame.size = { ...(S.gameFrame.size || {}), mode: 'manual', ...rect };
        ADM.send('gameFrame:update', { patch: { size: { mode: 'manual', ...rect } } }, 'gameFrame');
      } else {
        S.background.game = { ...(S.background.game || {}), mode: 'manual', ...rect };
        ADM.send('background:update', { patch: { game: { mode: 'manual', ...rect } } }, 'background');
      }
      ADM.changed();
    },
    auto() {
      const S = OV.state;
      if (S.gameFrame && S.gameFrame.size) S.gameFrame.size.mode = 'auto';
      if (S.background && S.background.game) S.background.game.mode = 'auto';
      ADM.send('gameFrame:update', { patch: { size: { mode: 'auto' } } }, 'gameFrame');
      ADM.send('background:update', { patch: { game: { mode: 'auto' } } }, 'background');
      ADM.changed();
    },
  };

  // ---- YouTube の画面に出る部品の目安(プレビューにだけ出す。OBS には出ない) ----
  const YT_ITEMS = V ? [
    ['top', 'ライブ表示・視聴者数・閉じる', { x: 0, y: 0, w: 1080, h: 170 }],
    ['actions', 'いいね・共有などのボタン', { x: 930, y: 860, w: 150, h: 720 }],
    ['chat', 'チャット(コメントが流れる)', { x: 0, y: 1040, w: 840, h: 500 }],
    ['channel', 'チャンネル名', { x: 30, y: 1560, w: 400, h: 110 }],
    ['subscribe', 'チャンネル登録ボタン', { x: 440, y: 1570, w: 260, h: 90 }],
    ['input', 'チャット入力欄', { x: 0, y: 1700, w: 1080, h: 220 }],
  ] : [
    ['top', 'タイトル・チャンネル名(マウスを乗せたとき)', { x: 0, y: 0, w: 1920, h: 130 }],
    ['controls', '再生バー・操作ボタン(マウスを乗せたとき)', { x: 0, y: 950, w: 1920, h: 130 }],
    ['watermark', 'チャンネルの透かし(設定している場合)', { x: 1750, y: 900, w: 150, h: 150 }],
    ['chat', 'チャット欄(スマホ横向き全画面で開いたとき)', { x: 1250, y: 0, w: 670, h: 1080 }],
  ];
  OV.ytGuideItems = YT_ITEMS;
  ADM.ytItem = (key) => {
    const def = YT_ITEMS.find((x) => x[0] === key);
    const o = ((((OV.state.layout || {}).ytGuide || {}).items) || {})[key] || {};
    return { show: o.show !== false, ...def[2], ...pick4(o) };
  };
  function pick4(o) { const r = {}; for (const k of ['x', 'y', 'w', 'h']) if (Number.isFinite(Number(o[k])) && o[k] !== null && o[k] !== '') r[k] = Number(o[k]); return r; }
  // 実際の配信画面のスクリーンショットを、プレビューに薄く重ねる(この PC のブラウザにだけ保存)
  const SHOT_KEY = `ytShot-${OV.canvas}`;
  ADM.ytShot = (() => { try { return JSON.parse(localStorage.getItem(SHOT_KEY) || 'null') || { src: '', opacity: 0.5 }; } catch { return { src: '', opacity: 0.5 }; } })();
  ADM.saveYtShot = () => { try { localStorage.setItem(SHOT_KEY, JSON.stringify(ADM.ytShot)); } catch { ADM.toast('画像が大きすぎて、このブラウザに保存できませんでした(表示は今だけ有効です)', 'warn'); } ADM.emit('ytshot'); };

  ADM.createPreview = function (root) {
    let view = 'fit';
    let scale = 1;

    const viewBtns = VIEWS.map(([v, l]) => h('button', { type: 'button', onclick: () => { view = v; update(); } }, l));
    const bg = h('div', { class: 'pv-bg', 'data-bg': 'game' });
    const game = h('div', { class: 'pv-game' }, h('span', null, 'ゲーム映像(OBS側で配置)'));
    bg.append(game);
    const bgSel = h('select', { onchange: (e) => { bg.dataset.bg = e.target.value; } }, BGS.map(([v, l]) => h('option', { value: v }, l)));
    const readout = h('div', { class: 'pv-read' });
    const ytChk = h('input', { type: 'checkbox' });
    ytChk.addEventListener('change', () => ADM.patchLayout({ ytGuide: { show: ytChk.checked } }));
    UI.bind(ytChk, () => { ytChk.checked = !!(((OV.state.layout || {}).ytGuide || {}).show); });
    const bar = h('div', { class: 'pv-bar' },
      h('div', { class: 'seg' }, viewBtns),
      h('label', { class: 'pv-bgsel' }, '背景', bgSel),
      h('label', { class: 'pv-bgsel', title: 'YouTube の画面に出るチャット欄・登録ボタンなどの目安を表示します(OBS には出ません)。位置はレイアウトタブで調整できます' }, ytChk, 'YouTubeの表示'),
      readout);
    const viewport = h('div', { class: 'pv-viewport' });
    const frame = h('div', { class: 'pv-frame' });
    const scaler = h('div', { class: 'pv-scaler' });
    const stageEl = h('div');
    const edit = h('div', { class: 'pv-edit' });
    scaler.append(bg, stageEl, edit);
    scaler.style.width = `${OV.W}px`;
    scaler.style.height = `${OV.H}px`;
    frame.append(scaler);
    viewport.append(frame);
    root.append(bar, viewport);

    const renderer = OV.createRenderer(stageEl, { editor: true });

    function computeScale() {
      if (view === 'actual') return 1;
      if (VIEW_W[view]) return VIEW_W[view] / OV.W;
      const w = viewport.clientWidth - 32;
      const hh = viewport.clientHeight - 32;
      return Math.max(0.05, Math.min(w / OV.W, hh / OV.H));
    }
    function update() {
      scale = computeScale();
      scaler.style.transform = `scale(${scale})`;
      frame.style.width = `${Math.round(OV.W * scale)}px`;
      frame.style.height = `${Math.round(OV.H * scale)}px`;
      edit.style.setProperty('--inv', String(1 / scale));
      viewBtns.forEach((b, i) => b.classList.toggle('on', VIEWS[i][0] === view));
      viewport.classList.toggle('centered', view !== 'actual');
      syncHandles();
      readability();
      if (OV.fixPixelFilters) OV.fixPixelFilters(scaler); // 縮小表示でも、ドット風の文字が消えないようにする
    }
    new ResizeObserver(() => { if (view === 'fit') update(); }).observe(viewport);

    // ---- ドラッグ共通 ----
    const snap = (v, ev) => (ev && ev.shiftKey ? Math.round(v / 10) * 10 : Math.round(v));
    function beginDrag(e, o, onMove) {
      e.preventDefault();
      e.stopPropagation();
      const sx = e.clientX;
      const sy = e.clientY;
      let moved = false;
      const mv = (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
        moved = true;
        document.body.classList.add('dragging');
        onMove(dx / scale, dy / scale, o, ev);
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        document.body.classList.remove('dragging');
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    }

    // パネルをクリックで選択。自由配置のパネルはそのままドラッグで移動
    stageEl.addEventListener('pointerdown', (e) => {
      const w = e.target.closest('.ov-panel');
      if (!w) return;
      const id = w.dataset.id;
      ADM.select(id);
      // グループの中のパネルをドラッグしたときは、グループごと動かす
      const gw = w.parentElement && w.parentElement.closest('.ov-panel.ov-pgroup');
      const moveId = gw ? gw.dataset.id : id;
      const p = ADM.panel(moveId);
      if (!p || p.placement !== 'free') return;
      beginDrag(e, { x: p.x, y: p.y }, (dx, dy, o, ev) => {
        ADM.patchPanel(moveId, { x: clamp(snap(o.x + dx, ev), -200, OV.W - 40), y: clamp(snap(o.y + dy, ev), -200, OV.H - 40) });
      });
    });

    function dragContainer(e, edge) {
      const c = OV.state.layout.container;
      const r = OV.containerRect(c);
      beginDrag(e, { ...r, dock: c.dock }, (dx, dy, o, ev) => {
        const p = {};
        const S = (v) => snap(v, ev);
        switch (edge) {
          case 'move':
            if (o.dock === 'right' || o.dock === 'left') p.y = clamp(S(o.y + dy), 0, OV.H - o.h);
            else if (o.dock === 'bottom' || o.dock === 'top') p.x = clamp(S(o.x + dx), 0, OV.W - o.w);
            else { p.x = S(o.x + dx); p.y = S(o.y + dy); }
            break;
          case 'w': p.w = clamp(S(o.w - dx), 160, OV.W); if (o.dock !== 'right') p.x = o.x + o.w - p.w; break;
          case 'e': p.w = clamp(S(o.w + dx), 160, OV.W); break;
          case 'n': p.h = clamp(S(o.h - dy), 80, OV.H); if (o.dock !== 'bottom') p.y = o.y + o.h - p.h; break;
          case 's': p.h = clamp(S(o.h + dy), 80, OV.H); break;
          default: break;
        }
        ADM.patchLayout({ container: p });
      });
    }
    function resizePanel(e, p, edge, r) {
      const o = { w: p.placement === 'free' || p.widthMode === 'fixed' ? p.w : Math.round(r.w), h: Math.round(r.h) };
      beginDrag(e, o, (dx, dy, oo, ev) => {
        const patch = {};
        if (edge.includes('e')) { patch.widthMode = 'fixed'; patch.w = Math.max(80, snap(oo.w + dx, ev)); }
        if (edge.includes('s')) { patch.heightMode = 'fixed'; patch.h = Math.max(40, snap(oo.h + dy, ev)); }
        ADM.patchPanel(p.id, patch);
      });
    }

    // ---- 編集用の枠(ハンドル) ----
    function rectOf(el) {
      const sr = scaler.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: (r.left - sr.left) / scale, y: (r.top - sr.top) / scale, w: r.width / scale, h: r.height / scale };
    }
    const boxEl = (r, cls) => h('div', { class: cls, style: { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` } });
    function dragGame(e, edge) {
      const r0 = ADM.gameArea.rect();
      beginDrag(e, r0, (dx, dy, o, ev) => {
        const S2 = (v) => snap(v, ev);
        if (edge === 'move') ADM.gameArea.set({ x: S2(o.x + dx), y: S2(o.y + dy) });
        else if (edge === 'e') ADM.gameArea.set({ w: Math.max(80, S2(o.w + dx)) });
        else if (edge === 's') ADM.gameArea.set({ h: Math.max(60, S2(o.h + dy)) });
        else if (edge === 'se') { const w = Math.max(80, S2(o.w + dx)); ADM.gameArea.set({ w, h: Math.round((w * o.h) / o.w) }); } // 縦横比を保つ
      });
    }
    function dragYt(e, key, edge) {
      const it = ADM.ytItem(key);
      beginDrag(e, it, (dx, dy, o, ev) => {
        const p = edge === 'move' ? { x: snap(o.x + dx, ev), y: snap(o.y + dy, ev) } : { w: Math.max(40, snap(o.w + dx, ev)), h: Math.max(30, snap(o.h + dy, ev)) };
        ADM.patchLayout({ ytGuide: { items: { [key]: p } } });
      });
    }
    function syncHandles() {
      edit.innerHTML = '';
      const S = OV.state;
      if (!S.layout) return;
      const c = S.layout.container || {};
      const yg = S.layout.ytGuide || {};
      // 実際の配信画面のスクリーンショット(重ねて見比べる)
      if (yg.show && ADM.ytShot && ADM.ytShot.src) {
        edit.append(h('img', { class: 'pv-ytshot', src: ADM.ytShot.src, style: { opacity: String(ADM.ytShot.opacity == null ? 0.5 : ADM.ytShot.opacity) } }));
      }
      // ゲーム映像の場所(ドラッグで移動、右下の角で大きさ変更)
      if (OV.gameWindowRect) {
        const g = ADM.gameArea.rect();
        const gb = boxEl(g, 'pv-gbox');
        const tab = h('div', { class: 'pv-gtab', title: 'ドラッグでゲーム映像の場所を移動(Shiftで10px単位)。右下の角で大きさを変えます(縦横比を保つ)' }, 'ゲーム映像');
        tab.addEventListener('pointerdown', (e) => dragGame(e, 'move'));
        gb.append(tab);
        for (const edge of ['e', 's', 'se']) {
          const hd = h('div', { class: `pv-h pv-h-${edge} pv-gh`, title: edge === 'se' ? 'ドラッグで大きさを変更(縦横比を保つ)' : 'ドラッグで大きさを変更' });
          hd.addEventListener('pointerdown', (e) => dragGame(e, edge));
          gb.append(hd);
        }
        edit.append(gb);
      }
      // YouTube の画面に出る部品の目安
      if (yg.show) {
        for (const [key, label] of YT_ITEMS) {
          const it = ADM.ytItem(key);
          if (!it.show) continue;
          const b = boxEl(it, `pv-yt pv-yt-${key}`);
          const lb = h('div', { class: 'pv-yt-label', title: 'ドラッグで移動(レイアウトタブで数値でも調整できます)' }, label);
          lb.addEventListener('pointerdown', (e) => dragYt(e, key, 'move'));
          const hd = h('div', { class: 'pv-h pv-h-se pv-yh', title: 'ドラッグで大きさを変更' });
          hd.addEventListener('pointerdown', (e) => dragYt(e, key, 'se'));
          b.append(lb, hd);
          edit.append(b);
        }
      }
      const av = OV.avatarRect(S.layout);
      if (av.show) {
        // 目安枠。サイドバーと重なっていれば赤、重なっていなければ緑
        const hit = c.enabled !== false && OV.rectsOverlap(av, OV.containerRect(c));
        const ab = boxEl(av, `pv-avatar${hit ? ' hit' : ''}`);
        ab.append(h('div', { class: 'pv-avatar-label' }, hit ? 'アバター(目安)— サイドバーと重なっています' : 'アバター(目安)'));
        edit.append(ab);
      }
      if (c.enabled !== false) {
        const cb = boxEl(OV.containerRect(c), 'pv-cbox');
        const tab = h('div', { class: 'pv-ctab', title: 'ドラッグでサイドバーを移動(Shiftで10px単位)' }, 'サイドバー');
        tab.addEventListener('pointerdown', (e) => dragContainer(e, 'move'));
        cb.append(tab);
        for (const edge of EDGES[c.dock] || EDGES.free) {
          const hd = h('div', { class: `pv-h pv-h-${edge}`, title: 'ドラッグでサイズ変更' });
          hd.addEventListener('pointerdown', (e) => dragContainer(e, edge));
          cb.append(hd);
        }
        edit.append(cb);
      }
      const p = ADM.selected();
      const el = p && renderer.nodeEl(p.id);
      if (p && el && el.isConnected && !el.classList.contains('is-gone')) {
        const r = rectOf(el);
        const sb = boxEl(r, 'pv-sel');
        sb.append(h('div', { class: 'pv-label' }, p.name));
        let edges = [];
        const inGroup = !!(el.parentElement && el.parentElement.closest('.ov-pgroup'));
        if (inGroup) edges = []; // 大きさはグループで決まる
        else if (p.placement === 'free') edges = ['e', 's', 'se'];
        else if (!p.fill) edges = [c.direction === 'row' ? 'e' : 's'];
        for (const edge of edges) {
          const hd = h('div', { class: `pv-h pv-h-${edge}`, title: 'ドラッグでサイズを固定' });
          hd.addEventListener('pointerdown', (e) => resizePanel(e, p, edge, r));
          sb.append(hd);
        }
        edit.append(sb);
      }
    }

    // ---- 見え方チェック ----
    let readTimer = 0;
    function readability() {
      clearTimeout(readTimer);
      readTimer = setTimeout(() => {
        const min = renderer.minFontSize();
        readout.innerHTML = '';
        if (!min) return;
        // 目安:PC は 1280px 幅のプレーヤー、スマホは横持ち全画面(約844px幅)で視聴した場合
        const pc = (min * (V ? 405 : 1280)) / OV.W;
        const ph = (min * (V ? 390 : 844)) / OV.W;
        const lv = ph < 8 ? 'bad' : ph < 10 ? 'warn' : 'ok';
        readout.className = `pv-read ${lv}`;
        readout.title = V ? '配信画面で一番小さい文字が、視聴者の画面で何pxに見えるかの目安です(PC:縦長で約405px幅/スマホ:縦持ち全画面 約390px幅)。スマホで 10px 未満だと読みにくくなります。' : '配信画面で一番小さい文字が、視聴者の画面で何pxに見えるかの目安です(PC:1280px幅のプレーヤー/スマホ:横持ち全画面)。スマホで 10px 未満だと読みにくくなります。';
        readout.append(
          h('span', null, `最小の文字 ${min.toFixed(0)}px`),
          h('span', null, `PC 約${pc.toFixed(1)}px`),
          h('span', { class: 'ph' }, `スマホ 約${ph.toFixed(1)}px${lv === 'ok' ? '' : lv === 'warn' ? '(やや小さい)' : '(小さすぎ)'}`),
        );
      }, 200);
    }

    function updateGameArea() {
      // 縦画面:背景タブ/レイアウトタブで決めた「ゲーム映像の場所」を、ダミー映像で示す
      const gfOn = OV.frameActive && OV.frameActive(OV.state);
      if ((V || gfOn || (ADM.gameArea && ADM.gameArea.manual())) && OV.gameWindowRect) {
        const g = OV.gameWindowRect(OV.state);
        Object.assign(game.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
        game.firstChild.textContent = `ゲーム映像(OBS側で配置) ${g.w}×${g.h}`;
        return;
      }
      const c = (OV.state.layout || {}).container || {};
      const r = OV.containerRect(c);
      let g = { x: 0, y: 0, w: OV.W, h: OV.H };
      if (c.enabled !== false) {
        if (c.dock === 'right') g = { x: 0, y: 0, w: r.x, h: OV.H };
        else if (c.dock === 'left') g = { x: r.w, y: 0, w: OV.W - r.w, h: OV.H };
        else if (c.dock === 'bottom') g = { x: 0, y: 0, w: OV.W, h: r.y };
        else if (c.dock === 'top') g = { x: 0, y: r.h, w: OV.W, h: OV.H - r.h };
      }
      Object.assign(game.style, { left: `${g.x}px`, top: `${g.y}px`, width: `${g.w}px`, height: `${g.h}px` });
    }

    renderer.onAfterFit(() => {
      syncHandles();
      readability();
      ADM.emit('fit');
    });
    ADM.on('select', () => requestAnimationFrame(syncHandles));
    ADM.on('ytshot', () => requestAnimationFrame(syncHandles));
    requestAnimationFrame(update);

    return {
      renderer,
      render() { renderer.render(); updateGameArea(); },
      get scale() { return scale; },
      setView(v) { view = v; update(); },
    };
  };
})();
