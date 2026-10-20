/* 演出タブ:いいね・コメントを受け取ったときのアニメーション */
(function () {
  'use strict';
  const { h } = UI;
  const R = () => OV.state.reactions || {};
  const LIKE_TYPES = [['heart', 'ハート浮遊'], ['star', '星きらきら'], ['coin', '光るチップ'], ['firework', '花火'], ['confetti', '紙吹雪'], ['plusone', '+1 ポップ'], ['glow', 'パネル発光のみ']];
  const COMMENT_TYPES = [['bubble', '吹き出しポップ'], ['scroll', '流れるテロップ'], ['dotwin', 'お知らせカード'], ['glow', 'パネル発光のみ']];
  const AREAS = [['panel', '数値パネルのそば'], ['area', '指定した範囲'], ['screen', '画面全体']];
  // かんたん指定(横画面・縦画面の大きさに合わせて計算)
  const CORNERS = (() => {
    const W = OV.W;
    const H = OV.H;
    const w = Math.round(Math.min(560, W * 0.45));
    const hh = 440;
    return [
      ['左下', { x: 20, y: H - hh - 20, w, h: hh }], ['右下', { x: W - w - 20, y: H - hh - 20, w, h: hh }],
      ['左上', { x: 20, y: 20, w, h: hh }], ['右上', { x: W - w - 20, y: 20, w, h: hh }],
      ['左の中ほど', { x: 20, y: Math.round(H / 2 - hh / 2), w: Math.round(w * 0.85), h: hh }],
      ['下の中央', { x: Math.round(W / 2 - Math.min(800, W - 40) / 2), y: H - 320, w: Math.min(800, W - 40), h: 300 }],
    ];
  })();
  const set = (kind) => (k) => (v) => ADM.send('reactions:update', { patch: { [kind]: { [k]: v } } });

  function section(kind, title, types) {
    const C = () => R()[kind] || {};
    const s = set(kind);
    const k = (key) => ({ get: () => C()[key], set: s(key) });
    const tests = kind === 'like'
      ? [UI.button('いいね +1', () => ADM.send('reactions:test', { kind, count: 1 }), 'small'), UI.button('+5', () => ADM.send('reactions:test', { kind, count: 5 }), 'small'), UI.button('+30', () => ADM.send('reactions:test', { kind, count: 30 }), 'small')]
      : [UI.button('コメント 1件', () => ADM.send('reactions:test', { kind, count: 1 }), 'small'), UI.button('5件', () => ADM.send('reactions:test', { kind, count: 5 }), 'small')];
    return h('div', null,
      h('h3', { class: 'h' }, title),
      UI.toggle({ label: '演出を表示する', ...k('enabled') }),
      UI.select({ label: '種類', options: types, ...k('type') }),
      UI.select({ label: '表示する場所', options: AREAS, ...k('area') }),
      UI.when(() => C().area === 'area', h('div', null,
        UI.num({ label: 'X', min: 0, max: OV.W, step: 10, unit: 'px', ...k('x') }),
        UI.num({ label: 'Y', min: 0, max: OV.H, step: 10, unit: 'px', ...k('y') }),
        UI.num({ label: '幅', min: 100, max: OV.W, step: 10, unit: 'px', ...k('w') }),
        UI.num({ label: '高さ', min: 100, max: OV.H, step: 10, unit: 'px', ...k('h') }),
        h('div', { class: 'row', style: { flexWrap: 'wrap' } }, h('span', { class: 'f-l' }, 'かんたん指定'),
          ...CORNERS.map(([name, r]) => UI.button(name, () => ADM.send('reactions:update', { patch: { [kind]: { area: 'area', ...r } } }), 'small'))),
        h('p', { class: 'hint' }, 'アバターの枠(レイアウトタブ)に被らない範囲にしてください。いいねが左下からふわっと出る、などは「左下」を押します。'))),
      UI.num({ label: '大きさ', min: 0.5, max: 2.5, step: 0.1, unit: '倍', ...k('size') }),
      UI.num({ label: kind === 'like' ? '一度に出す最大数' : '同時に出す最大数', min: 1, max: kind === 'like' ? 50 : 20, step: 1, unit: '個', ...k('max') }),
      kind === 'like' ? UI.when(() => C().type === 'heart', UI.color({ label: 'ハートの色', ...k('color') })) : null,
      kind === 'comment' ? UI.toggle({ label: '名前と本文を表示する', ...k('showText') }) : null,
      UI.toggle({ label: '効果音を鳴らす(OBS で音を拾う設定が必要)', ...k('sound') }),
      h('div', { class: 'row', style: { marginTop: '6px' } }, h('span', { class: 'f-l' }, 'テスト再生'), ...tests));
  }


  // ---- コメントの言葉に反応する絵文字 ----
  function wordSection() {
    const W = () => R().word || {};
    const setW = (k) => (v) => ADM.send('reactions:update', { patch: { word: { [k]: v } } });
    const k = (key) => ({ get: () => W()[key], set: setW(key) });
    const setRules = (arr) => ADM.send('reactions:update', { patch: { word: { rules: arr } } });
    const box = h('div', null,
      h('h3', { class: 'h' }, 'コメントの言葉に反応する絵文字'),
      h('p', { class: 'hint' }, '「草」「8888」「セーブ」など、登録した言葉がコメントに含まれていると、絵文字や文字が舞います。'),
      UI.toggle({ label: '言葉に反応させる', ...k('enabled') }),
      UI.seg({ label: '表示する場所', options: [['area', '指定した範囲'], ['screen', '画面全体']], get: () => W().area || 'area', set: setW('area') }),
      UI.when(() => W().area !== 'screen', h('div', null,
        UI.num({ label: 'X', min: 0, max: OV.W, step: 10, unit: 'px', ...k('x') }),
        UI.num({ label: 'Y', min: 0, max: OV.H, step: 10, unit: 'px', ...k('y') }),
        UI.num({ label: '幅', min: 100, max: OV.W, step: 10, unit: 'px', ...k('w') }),
        UI.num({ label: '高さ', min: 100, max: OV.H, step: 10, unit: 'px', ...k('h') }))),
      UI.num({ label: '大きさ', min: 0.5, max: 2.5, step: 0.1, unit: '倍', ...k('size') }),
      UI.num({ label: '同時に出す最大数', min: 1, max: 40, step: 1, unit: '個', ...k('max') }),
      UI.num({ label: '連続反応の間隔', min: 0, max: 10, step: 0.5, unit: '秒', ...k('cooldownSec') }));
    const list = h('div');
    const draw = () => {
      const rules = (W().rules || []);
      const key = JSON.stringify(rules.map((r) => r.id));
      if (list.dataset.key === key) return;
      list.dataset.key = key;
      list.innerHTML = '';
      rules.forEach((r, i) => {
        const cur = () => (W().rules || [])[i] || {};
        const edit = (fn) => { const a = JSON.parse(JSON.stringify(W().rules || [])); fn(a[i]); setRules(a); };
        const csv = (v) => v.split(/[,、]/).map((x) => x.trim()).filter(Boolean);
        list.append(h('div', { class: 'hw-card' },
          h('div', { class: 'top' }, h('span', { class: 'muted' }, `ルール ${i + 1}`), h('span', { class: 'sp' }),
            UI.button('試す', () => ADM.send('reactions:test', { kind: 'word', rule: r.id }), 'small'),
            UI.button('削除', () => setRules((W().rules || []).filter((_, j) => j !== i)), 'small danger')),
          UI.text({ label: '反応する言葉', placeholder: '草,ww', get: () => (cur().triggers || []).join(','), set: (v) => edit((x) => { x.triggers = csv(v); }) }),
          UI.text({ label: '舞う絵文字・文字', placeholder: '🌱,草,🌿', get: () => (cur().icons || []).join(','), set: (v) => edit((x) => { x.icons = csv(v); }) }),
          UI.color({ label: '文字の色', get: () => cur().color, set: (v) => edit((x) => { x.color = v; }) })));
      });
    };
    UI.bind(list, draw);
    box.append(list, h('div', { class: 'row' }, UI.button('+ ルールを追加', () => setRules([...(W().rules || []), { id: `w${Date.now().toString(36)}`, triggers: ['新しい言葉'], icons: ['⭐'], color: '#ffd84a' }]), 'primary small')),
      h('p', { class: 'hint' }, '絵文字の見え方は、OBS を表示する PC の環境によって少し変わります。「コメント連動」タブのテストコメントでも試せます。'));
    return box;
  }

  ADM.registerTab({
    id: 'reactions',
    label: '演出',
    order: 37,
    sig: () => '',
    build(root) {
      root.append(
        h('p', { class: 'hint' }, 'YouTube の取得中に、いいねやコメントが増えると自動で再生されます。演出に API は使わないので、利用上限の消費は増えません。テスト再生はプレビューと OBS の両方に表示されます。'),
        section('like', 'いいねを受け取ったとき', LIKE_TYPES),
        section('comment', 'コメントを受け取ったとき', COMMENT_TYPES),
        wordSection(),
        h('h3', { class: 'h' }, '効果音'),
        UI.num({ label: '音量', min: 0, max: 1, step: 0.05, get: () => R().volume, set: (v) => ADM.send('reactions:update', { patch: { volume: v } }) }),
        h('p', { class: 'hint' }, '効果音は OBS 用の画面でだけ鳴ります。OBS のブラウザソースの設定で「OBSで音声を制御する」をオンにしてください。'),
        h('div', { class: 'note-box' }, 'いいね数は合計しか取れないため、増えた数だけまとめて再生します。YouTube 側の反映と取得の間隔があるので、押された瞬間ではなく数秒〜数十秒後に再生されます。コメントはまとめて届いた分を、少しずつずらして再生します。'),
      );
    },
  });
})();
