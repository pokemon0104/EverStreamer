/* 数値パネルの内容編集 */
(function () {
  'use strict';
  const { h } = UI;
  const fontOptions = () => (OV.catalogs.fonts || []).map((f) => [f.family, f.label || f.family]);

  function numBox(label, get, set) {
    const input = h('input', { type: 'number', class: 'num', style: { width: '90px' } });
    input.addEventListener('input', () => { const v = parseFloat(input.value); if (!Number.isNaN(v)) set(v); });
    const step = (d) => () => set((Number(get()) || 0) + d);
    const row = UI.field(label, input, UI.button('−1', step(-1), 'small'), UI.button('+1', step(1), 'small'), UI.button('+10', step(10), 'small'));
    return UI.bind(row, () => { if (document.activeElement !== input) input.value = get() ?? 0; });
  }

  ADM.registerInspector('number', {
    title: '数値の内容',
    build(root, id) {
      const P = () => ADM.panel(id) || {};
      const D = () => P().data || {};
      const L = () => OV.effectiveLook(P());
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      const setD = (k) => (v) => ADM.patchPanel(id, { data: { [k]: v } });
      const lk = (k) => ({ get: () => L()[k], set: (v) => ADM.patchPanel(id, { look: { [k]: v } }) });
      const goal = () => D().mode === 'goal';
      const barOn = () => goal() && D().display !== 'text';

      root.append(
        // ---- 数字の大きさ(目立つ場所に置く。「文字サイズと余白」と同じ値です) ----
        h('h3', { class: 'h' }, '数字の大きさ'),
        UI.num({ label: '数字', min: 12, max: 200, step: 1, unit: 'px', ...lk('numberSize') }),
        UI.num({ label: '補足(500人まで 等)', min: 8, max: 80, step: 1, unit: 'px', ...lk('bodySize') }),
        UI.num({ label: 'ラベル', min: 10, max: 120, step: 1, unit: 'px', ...lk('headingSize') }),
        UI.select({ label: '数字のフォント', options: () => [['', 'ラベルと同じ'], ...fontOptions()], ...lk('numberFont') }),
        h('p', { class: 'hint' }, 'パネルに収まらない場合は、自動で縮小されます。アバターなどに被せたくないときは、数字を小さくするか、レイアウトタブでサイドバーの高さを調整してください。'),

        h('h3', { class: 'h' }, '表示する内容'),
        UI.seg({ label: '表示方法', options: [['value', '数値'], ['goal', '目標まで あと何']], ...dk('mode') }),
        UI.seg({ label: '見た目', options: [['label', '文字ラベル'], ['emoji', '絵文字+数字'], ['none', '演出だけ']], get: () => D().view || 'label', set: setD('view') }),
        UI.when(() => (D().view || 'label') === 'label', UI.text({ label: 'ラベル', placeholder: '空欄で非表示', ...dk('label') })),
        UI.when(() => D().view === 'emoji', h('div', null,
          UI.text({ label: '絵文字', placeholder: '空欄で自動(いいね👍 コメント💬 登録者👤)', ...dk('icon') }),
          h('div', { class: 'row end' }, ...['👍', '💬', '👤', '👀', '👥', '❤️', '⭐', '🎉'].map((e) => UI.button(e, () => ADM.patchPanel(id, { data: { icon: e } }), 'small'))))),
        UI.when(() => D().view === 'none', h('p', { class: 'hint' }, '数字も文字も出さず、「演出」タブのいいね・コメント・お祝いのアニメーションだけを、このパネルの場所に表示します。縦型配信のように、YouTube が数字を出してくれている画面向けです。管理画面のプレビューでは、点線の枠で場所を示します。')),
        UI.seg({ label: '数値の取得', options: [['manual', '手入力'], ['youtube', 'YouTube']], get: () => D().source || 'manual', set: (v) => ADM.patchPanel(id, { data: { source: v, sourceLocked: v === 'manual' } }) }),
        UI.when(() => D().source === 'youtube', h('div', null,
          UI.select({ label: '指標', options: OV.ytMetrics || [], ...dk('metric') }),
          UI.seg({ label: '対象', options: [['total', '横+縦の合計'], ['h', '横だけ'], ['v', '縦だけ']], get: () => D().scope || 'total', set: setD('scope') }),
          h('p', { class: 'hint' }, 'URL や APIキーは左の「YouTube」タブで設定します。'))),
        UI.when(() => !goal() && D().source !== 'youtube', numBox('数値', () => D().value, setD('value'))),
        UI.when(goal, h('div', null,
          numBox('目標', () => D().goal, setD('goal')),
          UI.when(() => D().source !== 'youtube', numBox('現在', () => D().current, setD('current'))),
          UI.text({ label: '達成時の表示', ...dk('doneText') }))),
        UI.text({ label: '単位', placeholder: '人 / 件 など', ...dk('unit') }),
        UI.text({ label: '表示の型', placeholder: '空欄で自動', ...dk('template') }),
        h('p', { class: 'hint' }, '表示の型では {value} {remain} {goal} {current} {unit} が使えます。{value} と {remain} が大きな数字になります。例:{goal}{unit}まで あと{remain}{unit}'),
        UI.seg({ label: '揃え', options: [['left', '左'], ['center', '中央'], ['right', '右']], ...dk('align') }),

        // ---- バー(目標モードのみ) ----
        UI.when(goal, h('div', null,
          h('h3', { class: 'h' }, '進み具合のバー'),
          UI.seg({ label: '表示', options: [['text', '文字だけ'], ['both', '文字+バー'], ['bar', 'バーだけ'], ['cycle', '交互に切替']], get: () => D().display || 'both', set: setD('display') }),
          UI.when(() => D().display === 'cycle', UI.num({ label: '切替の間隔', min: 2, max: 30, step: 1, unit: '秒', ...dk('cycleSec') })),
          UI.when(barOn, h('div', null,
            numBox('バーの0%の値', () => D().barStart, setD('barStart')),
            h('p', { class: 'hint' }, '例:前回の目標が 400 人なら 400 にすると、400〜500 人の間の進み具合になります(0 のままだと 0〜目標 の割合)。'),
            UI.seg({ label: 'バーの形', options: [['smooth', 'なめらか'], ['blocks', 'ブロック']], get: () => D().barStyle || 'smooth', set: setD('barStyle') }),
            UI.when(() => D().barStyle === 'blocks', UI.num({ label: 'ブロック数', min: 5, max: 50, step: 1, unit: '個', ...dk('barBlocks') })),
            UI.num({ label: 'バーの太さ', min: 6, max: 80, step: 1, unit: 'px', ...dk('barHeight') }),
            UI.color({ label: 'バーの色', ...dk('barColor') }),
            h('div', { class: 'row end' }, UI.button('数字と同じ色にする', () => ADM.patchPanel(id, { data: { barColor: '' } }), 'small')),
            UI.color({ label: 'バーの背景色', ...dk('barBg') }),
            UI.select({ label: 'バーの下の文字', options: [['auto', '自動'], ['remain', 'あと◯人'], ['fraction', '現在 / 目標'], ['percent', 'パーセントのみ'], ['none', 'なし']], get: () => D().barText || 'auto', set: setD('barText') }))))),

        // ---- 動き ----
        h('h3', { class: 'h' }, '数字・バーの動き'),
        UI.toggle({ label: '数字をカウントアップさせる', get: () => D().countUp !== false, set: setD('countUp') }),
        UI.when(goal, UI.seg({ label: 'バーの動き', options: [['smooth', 'なめらかに伸びる'], ['none', '動かさない']], get: () => D().barAnim || 'smooth', set: setD('barAnim') })),
        UI.num({ label: '動きの時間', min: 100, max: 5000, step: 100, unit: 'ms', ...dk('barAnimMs') }),
        UI.toggle({ label: '増えたときに光らせる', get: () => D().flash !== false, set: setD('flash') }),
        h('div', { class: 'row end' }, UI.button('動きを確認(現在値を+1)', () => {
          const key = D().source === 'youtube' ? null : (goal() ? 'current' : 'value');
          if (!key) return ADM.toast('YouTube連動のときは、実際に数値が増えると動きます', 'warn');
          ADM.patchPanel(id, { data: { [key]: (Number(D()[key]) || 0) + 1 } });
        }, 'small')),
      );
    },
  });
})();
