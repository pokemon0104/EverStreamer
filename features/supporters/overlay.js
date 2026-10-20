/* 最新のサポーター(スーパーチャット・メンバー・手入力) */
(function () {
  'use strict';
  const { esc } = OV.util;
  const ICON = { superchat: '💎', member: '⭐', manual: '♥' };
  OV.registerPanelType('supporters', {
    label: '最新のサポーター',
    sizeLabels: { headingSize: '見出し', bodySize: '名前', numberSize: '(未使用)' },
    deps: (S) => [S.supporters],
    render(el, p) {
      const d = p.data || {};
      const kinds = d.kinds || [];
      const list = ((OV.state.supporters || {}).list || []).filter((x) => kinds.includes(x.kind)).slice().reverse();
      const n = d.mode === 'list' ? Math.max(1, Number(d.count) || 3) : 1;
      const rows = list.slice(0, n).map((x, i) => `<div class="sp-row${i === 0 ? ' first' : ''}"><span class="sp-ic">${ICON[x.kind] || '♥'}</span><span class="sp-name">${esc(x.name)}</span>${d.showAmount !== false && x.amount ? `<span class="sp-amt">${esc(x.amount)}</span>` : ''}</div>`).join('');
      el.innerHTML = `${d.title ? `<div class="ov-h sp-title">${esc(d.title)}</div>` : ''}<div class="sp-list">${rows || `<div class="sp-empty">${esc(d.emptyText || '')}</div>`}</div>`;
    },
    shouldShine: (p, S, n) => true,
  });
})();
