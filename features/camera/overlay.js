/* カメラ枠:中は透明。管理画面では点線で場所を示す */
(function () {
  'use strict';
  const { esc } = OV.util;
  OV.registerPanelType('camera', {
    label: 'カメラ枠',
    noFit: true,
    sizeLabels: { headingSize: '(未使用)', bodySize: '名前の帯', numberSize: '(未使用)' },
    deps: (S) => [S.profile],
    render(el, p) {
      const d = p.data || {};
      const name = d.label || (OV.state.profile || {}).name || '';
      const plate = d.showLabel !== false && name ? `<div class="cam-plate pos-${esc(d.labelPos || 'bl')}">${esc(name)}</div>` : '';
      el.innerHTML = `<div class="cam-hole">${OV.role === 'admin' ? `<span class="cam-hint">${esc(OV.t('カメラ(OBS でここに置く)'))}</span>` : ''}</div>${plate}`;
    },
  });
})();
