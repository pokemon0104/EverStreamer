/* 「出す画面:横型/縦型」の切り替え(感謝・お祝い・演出・コメント連動のタブの先頭に出す) */
(function () {
  'use strict';
  const { h } = UI;
  const get = (kind, screen) => { const s = (OV.state.screens || {})[kind]; return !s || s[screen] !== false; };
  /** 各タブの先頭に置く、横型・縦型のチェック */
  ADM.screenRow = (kind, what) => {
    const t = (screen, label) => UI.toggle({ label, get: () => get(kind, screen), set: (on) => ADM.send('screens:set', { kind, screen, on }) });
    const warn = h('p', { class: 'hint warn' }, 'どちらの画面にも出しません。');
    UI.bind(warn, () => { warn.style.display = !get(kind, 'h') && !get(kind, 'v') ? '' : 'none'; });
    return h('div', { class: 'scr-row' },
      h('div', { class: 'f-l' }, `${what}を出す画面`),
      h('div', { class: 'row' }, t('h', '横型(16:9)'), t('v', '縦型(9:16)')),
      warn);
  };
})();
