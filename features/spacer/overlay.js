/* 空きスペース:オーバーレイには何も出さない。管理画面では点線の枠で場所を示す */
(function () {
  'use strict';
  const { esc } = OV.util;
  OV.registerPanelType('space', {
    label: '空きスペース(場所取り)',
    noFit: true,
    render(el, p) {
      const d = p.data || {};
      el.innerHTML = OV.role === 'admin'
        ? `<div class="ov-ghost peek sp-ghost">${esc(d.label || p.name || '空きスペース')}<small>${OV.t('(OBS には何も表示されません)')}</small></div>`
        : '<div class="ov-ghost"></div>';
    },
  });
})();
