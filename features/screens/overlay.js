/* 機能ごとに、この画面(横型/縦型)に出してよいか */
(function () {
  'use strict';
  /** kind: thanks / celebrate / reactions / ct */
  OV.screenOn = (kind, canvas) => {
    const s = (OV.raw.screens || {})[kind];
    return !s || s[canvas || OV.canvas] !== false;
  };
  // コメント連動のパネル(投票・アイデア募集・カウンター)は、出さない画面では非表示にする
  const CT_TYPES = ['poll', 'ideas', 'counter'];
  (OV.panelHiders = OV.panelHiders || []).push((p) => CT_TYPES.includes(p.type) && !OV.screenOn('ct'));
})();
