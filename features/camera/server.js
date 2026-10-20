'use strict';
// カメラ枠:OBS の Web カメラを置く場所に、テンプレートの枠と名前の帯を重ねる(中は透明)
module.exports = {
  order: 54,
  panelTypes: {
    camera: {
      label: 'カメラ枠',
      defaults: () => ({
        name: 'カメラ枠',
        placement: 'free',
        heightMode: 'fixed',
        widthMode: 'fixed',
        x: 40, y: 780, w: 400, h: 225,
        anim: { type: 'fade', ms: 350 },
        look: { bgAlpha: 0, bgImage: '', innerShadow: '', padding: 0, bodySize: 22 },
        data: { label: '', showLabel: true, labelPos: 'bl', ratio: '16:9' },
      }),
    },
  },
};
