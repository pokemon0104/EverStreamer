/* キャラクタータブ:画像・口パク(マイク)・動き・反応・位置 */
(function () {
  'use strict';
  const { h } = UI;
  const { deepMerge, clone } = OV.util;
  const SLOTS = [['idle', '口を閉じた顔(必須)'], ['talk', '口を開けた顔'], ['blink', '目を閉じた顔'], ['happy', '喜んだ顔']];
  const C = () => OV.raw.character || {};
  const V = () => OV.state.characterView || {};
  const upd = (patch) => {
    deepMerge(OV.raw.character || (OV.raw.character = {}), clone(patch));
    ADM.queuePatch('character', 'character:update', {}, patch, 'character');
    ADM.changed();
  };
  const updView = (patch) => {
    deepMerge(OV.state.characterView, clone(patch));
    ADM.queuePatch(`charView:${OV.canvas}`, 'character:updateView', {}, patch, 'characterView');
    ADM.changed();
  };
  const ck = (k) => ({ get: () => C()[k], set: (v) => upd({ [k]: v }) });
  const vk = (k) => ({ get: () => V()[k], set: (v) => updView({ [k]: v }) });

  async function upload(file) {
    if (!/\.(png|webp)$/i.test(file.name)) { ADM.toast('透過できる PNG か WebP の画像を選んでください', 'warn'); return ''; }
    try {
      const r = await fetch('/api/character', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' }, body: file });
      const j = await r.json();
      if (!r.ok) { ADM.toast(j.error || 'アップロードできませんでした', 'error'); return ''; }
      return j.file;
    } catch (e) { ADM.toast(`アップロードできませんでした(${e.message})`, 'error'); return ''; }
  }

  // ---- 管理画面のマイクで口パク ----
  const mic = { meter: null, level: 0, talking: false, lastLoud: 0, error: '' };
  ADM.charMic = mic;
  const want = () => C().enabled && C().mouth === 'admin';
  const store = (on) => { try { localStorage.setItem('sok.charMic', on ? '1' : '0'); } catch { /* ignore */ } };
  async function micStart() {
    if (mic.meter) return;
    try {
      mic.meter = await OV.micMeter((lv) => {
        mic.level = lv;
        const c = C();
        const now = performance.now();
        if (lv >= (Number(c.threshold) || 0.06)) mic.lastLoud = now;
        const on = want() && now - mic.lastLoud < (Number(c.hold) || 160);
        if (on !== mic.talking) { mic.talking = on; ADM.hub.send('character:talk', { on }); }
      });
      mic.error = '';
      store(true);
    } catch (e) {
      mic.error = e && e.name === 'NotAllowedError' ? 'マイクの使用が許可されませんでした。アドレスバーのマイクのアイコンから許可してください。' : `マイクを使えません(${(e && e.name) || e})`;
    }
    UI.refreshAll();
  }
  function micStop() { if (mic.meter) mic.meter.stop(); mic.meter = null; mic.level = 0; if (mic.talking) { mic.talking = false; ADM.hub.send('character:talk', { on: false }); } store(false); UI.refreshAll(); }
  // 前回マイクを使っていたら、管理画面を開いたときに自動で始める(許可済みのときだけ動く)
  let tried = false;
  ADM.on('refresh', () => {
    if (tried || !OV.raw.character) return;
    tried = true;
    let on = false;
    try { on = localStorage.getItem('sok.charMic') === '1'; } catch { /* ignore */ }
    if (on && want()) micStart();
  });

  function levelMeter() {
    const bar = h('i');
    const th = h('b');
    const box = h('div', { class: 'chr-meter' }, bar, th);
    const note = h('div', { class: 'hint' });
    const wrap = h('div', { style: { flex: 1 } }, box, note);
    const loop = () => {
      if (!box.isConnected) return;
      note.textContent = mic.meter && mic.meter.suspended ? 'マイクは準備できています。この画面のどこかをクリックすると、音を聞き始めます。' : (!mic.meter && C().mouth === 'admin' ? '「マイクを使う」を押すと、声の大きさが表示されます。' : '');
      bar.style.width = `${Math.min(100, mic.level * 100 * 2)}%`;
      th.style.left = `${Math.min(100, (Number(C().threshold) || 0.06) * 100 * 2)}%`;
      box.classList.toggle('on', mic.talking);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return wrap;
  }

  ADM.registerTab({
    id: 'character',
    label: 'キャラクター',
    order: 23,
    basic: true,
    sig: () => JSON.stringify([OV.canvas, OV.catalogs.charUploads, C().images, (C().rules || []).map((r) => r.id)]),
    build(root) {
      root.append(
        h('p', { class: 'hint' }, '画像を 2〜4 枚読み込むと、声に合わせて口が動き、まばたきや呼吸をして、コメントやアラートに反応します(PNGtuber 方式)。最初はサンプルの「もちまる」が入っています。'),
        UI.toggle({ label: 'キャラクターを表示する', ...ck('enabled') }),
        UI.toggle({ label: 'この画面(横/縦)に表示する', ...vk('show') }));

      // ---- 画像 ----
      const ups = OV.catalogs.charUploads || [];
      const slots = h('div', { class: 'chr-slots' });
      for (const [slot, label] of SLOTS) {
        const file = h('input', { type: 'file', accept: '.png,.webp,image/png,image/webp', style: { display: 'none' } });
        const pick = async (f) => { const name = await upload(f); if (name) upd({ images: { [slot]: name } }); };
        file.addEventListener('change', () => { if (file.files[0]) pick(file.files[0]); file.value = ''; });
        const img = h('img', { alt: '' });
        const thumb = h('div', { class: 'chr-thumb', title: 'クリックかドロップで画像を選ぶ', onclick: () => file.click() }, img, h('span', { class: 'chr-empty' }, '+ 画像'));
        thumb.addEventListener('dragover', (e) => { e.preventDefault(); thumb.classList.add('over'); });
        thumb.addEventListener('dragleave', () => thumb.classList.remove('over'));
        thumb.addEventListener('drop', (e) => { e.preventDefault(); thumb.classList.remove('over'); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
        UI.bind(thumb, () => { const u = OV.charImageUrl((C().images || {})[slot]); thumb.classList.toggle('has', !!u); if (u) img.src = u; else img.removeAttribute('src'); });
        const sel = UI.select({
          options: () => [['__sample', '(サンプル)'], ...(slot === 'idle' ? [] : [['', '(使わない)']]), ...ups.map((f) => [f, f])],
          get: () => { const v = (C().images || {})[slot] || ''; return v.startsWith('sample:') ? '__sample' : v; },
          set: (v) => upd({ images: { [slot]: v === '__sample' ? `sample:mochimaru-${slot}.svg` : v } }),
        });
        slots.append(h('div', { class: 'chr-slot' }, h('div', { class: 'f-l' }, label), thumb, file, sel,
          slot !== 'idle' ? UI.button('外す', () => upd({ images: { [slot]: '' } }), 'small') : ''));
      }
      root.append(h('h3', { class: 'h' }, '画像'), slots,
        h('p', { class: 'hint' }, '背景が透明な PNG か WebP を使います。同じ大きさ・同じ位置で描いた画像にすると、切り替えが自然になります。口を開けた顔・目を閉じた顔・喜んだ顔は、なくても動きます。'),
        h('div', { class: 'row' }, UI.button('サンプル(もちまる)に戻す', () => ADM.send('character:useSample'), 'small')));

      // ---- 口パク ----
      const micBtn = h('button', { type: 'button', class: 'btn' });
      micBtn.addEventListener('click', () => (mic.meter ? micStop() : micStart()));
      UI.bind(micBtn, () => { micBtn.textContent = mic.meter ? '■ マイクを止める' : '🎤 マイクを使う'; micBtn.className = `btn ${mic.meter ? '' : 'primary'}`; });
      const micErr = h('div', { class: 'note-box' });
      UI.bind(micErr, () => { micErr.style.display = mic.error ? '' : 'none'; micErr.textContent = mic.error; });
      const ptt = h('button', { type: 'button', class: 'btn' }, '押している間だけ口を動かす');
      const pt = (on) => ADM.hub.send('character:talk', { on, button: true });
      ptt.addEventListener('pointerdown', () => pt(true));
      ['pointerup', 'pointerleave'].forEach((ev) => ptt.addEventListener(ev, () => pt(false)));
      root.append(UI.section('chr-mouth', '口パク',
        UI.select({ label: '口を動かすもの', options: [['admin', '管理画面のマイク(おすすめ)'], ['overlay', 'OBS のマイク(設定が必要)'], ['chat', 'コメントが来たとき'], ['off', '動かさない']], ...ck('mouth') }),
        UI.when(() => C().mouth === 'admin', h('div', null,
          h('p', { class: 'hint' }, 'この管理画面でマイクの音を聞き、口の開け閉めだけを OBS に送ります。OBS の設定はいりません。配信中は、この管理画面を開いたままにしてください(別のタブにしても動きます)。'),
          h('div', { class: 'row' }, micBtn), micErr)),
        UI.when(() => C().mouth === 'overlay', h('div', null,
          h('p', { class: 'hint' }, 'OBS のブラウザソースでマイクを使うには、OBS を次の起動オプション付きで起動します(1回設定すれば、次からはそのまま使えます)。'),
          h('ol', { class: 'yt-steps' },
            h('li', null, h('b', null, 'OBS のショートカットを右クリック →「プロパティ」')),
            h('li', null, h('b', null, '「リンク先」の最後に、半角スペースを空けて次を書き足す'), h('code', { class: 'chr-code' }, '--enable-media-stream --use-fake-ui-for-media-stream')),
            h('li', null, h('b', null, 'OK を押して、そのショートカットから OBS を起動する'))),
          h('p', { class: 'hint' }, 'うまく動かないときは「管理画面のマイク」に切り替えてください。'))),
        UI.when(() => C().mouth === 'chat', h('p', { class: 'hint' }, 'マイクを使わず、コメントが来るたびに少しのあいだ口を動かします。')),
        UI.when(() => C().mouth === 'admin' || C().mouth === 'overlay', h('div', null,
          h('div', { class: 'f' }, h('span', { class: 'f-l' }, '声の大きさ'), h('div', { class: 'f-c' }, levelMeter())),
          UI.num({ label: '口を開ける音量', min: 0.005, max: 0.3, step: 0.005, ...ck('threshold') }),
          h('p', { class: 'hint' }, '黒い線より声のバーが右に伸びると、口が開きます。生活音で口が動くときは、右に動かします。'),
          UI.num({ label: '口を閉じるまで', min: 40, max: 600, step: 10, unit: 'ms', ...ck('hold') }))),
        h('div', { class: 'row' }, ptt)));

      // ---- 動き ----
      root.append(UI.section('chr-motion', '動き',
        UI.toggle({ label: 'まばたき(「目を閉じた顔」があるとき)', get: () => C().blink !== false, set: (v) => upd({ blink: v }) }),
        UI.toggle({ label: '呼吸(かすかに伸び縮み)', get: () => C().breathe !== false, set: (v) => upd({ breathe: v }) }),
        UI.toggle({ label: 'ゆらゆら揺れる', ...ck('sway') }),
        UI.toggle({ label: '話している間、はずむ', get: () => C().talkBounce !== false, set: (v) => upd({ talkBounce: v }) })));

      // ---- 反応 ----
      const rules = () => (C().rules || []).map((r) => ({ ...r }));
      const setRules = (arr) => upd({ rules: arr });
      const rulesBox = h('div', { class: 'chr-rules' });
      rules().forEach((r, i) => {
        const R = () => rules()[i] || {};
        const set = (k, v) => { const a = rules(); a[i][k] = v; setRules(a); };
        rulesBox.append(h('div', { class: 'chr-rule' },
          UI.text({ label: '言葉', placeholder: '草,ww', get: () => R().words, set: (v) => set('words', v) }),
          UI.text({ label: '吹き出し', placeholder: 'わはは!', get: () => R().reply, set: (v) => set('reply', v) }),
          h('div', { class: 'row' },
            UI.seg({ options: [['happy', '喜ぶ'], ['bounce', '跳ねる']], get: () => R().action, set: (v) => set('action', v) }),
            h('span', { style: { flex: 1 } }),
            UI.button('×', () => { const a = rules(); a.splice(i, 1); setRules(a); }, 'small danger'))));
      });
      root.append(UI.section('chr-react', '反応',
        UI.seg({ label: 'コメントが来たら', options: [['bounce', '跳ねる'], ['none', '何もしない']], get: () => C().onComment || 'bounce', set: (v) => upd({ onComment: v }) }),
        UI.toggle({ label: 'アラート(スーパーチャット・メンバー・レイドなど)で喜ぶ', get: () => C().onAlert !== false, set: (v) => upd({ onAlert: v }) }),
        UI.toggle({ label: '吹き出しを出す', get: () => C().bubble !== false, set: (v) => upd({ bubble: v }) }),
        UI.when(() => C().bubble !== false, h('div', null,
          UI.num({ label: '吹き出しの表示', min: 1, max: 15, step: 0.5, unit: '秒', ...ck('bubbleSec') }),
          UI.toggle({ label: 'キーワード以外のコメントも吹き出しに出す', ...ck('bubbleComment') }))),
        h('h3', { class: 'h' }, '反応する言葉'),
        h('p', { class: 'hint' }, 'コメントに言葉が含まれていると、喜ぶ顔になって吹き出しを出します。言葉はカンマで区切ります。'),
        rulesBox,
        h('div', { class: 'row' }, UI.button('+ 言葉を追加', () => setRules([...rules(), { id: `cr_${Date.now().toString(36)}`, words: '', reply: '', action: 'happy' }]), 'small primary')),
        h('div', { class: 'row' }, h('span', { class: 'f-l' }, 'テスト'),
          UI.button('コメント', () => ADM.send('character:test', { kind: 'comment' }), 'small'),
          UI.button('キーワード', () => ADM.send('character:test', { kind: 'keyword' }), 'small'),
          UI.button('アラート', () => ADM.send('character:test', { kind: 'alert' }), 'small'))));

      // ---- 位置と大きさ ----
      const W = () => OV.W;
      const H = () => OV.H;
      root.append(UI.section('chr-pos', '位置と大きさ(この画面)',
        h('p', { class: 'hint' }, 'プレビューのキャラクターをドラッグしても動かせます。横画面と縦画面で別々に決められます。'),
        UI.field('置き場所', UI.button('右下', () => updView({ x: W() - V().h * 0.55, y: H() - 20 }), 'small'), UI.button('左下', () => updView({ x: V().h * 0.55, y: H() - 20 }), 'small'), UI.button('下の中央', () => updView({ x: W() / 2, y: H() - 20 }), 'small')),
        UI.num({ label: '横の位置(足もと)', min: -200, max: 2200, step: 1, unit: 'px', ...vk('x') }),
        UI.num({ label: '縦の位置(足もと)', min: 0, max: 2200, step: 1, unit: 'px', ...vk('y') }),
        UI.num({ label: '大きさ(高さ)', min: 60, max: 1400, step: 2, unit: 'px', ...vk('h') }),
        UI.toggle({ label: '左右を反転', ...vk('flip') })));
    },
  });

  // ---- プレビューでドラッグして動かす ----
  document.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest && ev.target.closest('.ov-stage.is-editor .chr');
    if (!el) return;
    ev.preventDefault();
    ev.stopPropagation();
    const stage = el.closest('.ov-stage');
    const k = stage.getBoundingClientRect().width / OV.W || 1;
    const sx = ev.clientX;
    const sy = ev.clientY;
    const x0 = Number(V().x) || 0;
    const y0 = Number(V().y) || 0;
    el.classList.add('dragging');
    const move = (e) => updView({ x: Math.round(x0 + (e.clientX - sx) / k), y: Math.round(y0 + (e.clientY - sy) / k) });
    const up = () => { el.classList.remove('dragging'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, true);
})();
