/* パネルのグループ:枠も背景もない入れ物。中のパネルの並べ方は描画エンジン(renderer.js)が行う */
(function () {
  'use strict';
  OV.registerPanelType('group', {
    label: 'グループ(横一列にまとめる)',
    noFit: true, // 文字の縮小は中のパネルごとに行う
    noLook: true, // 管理画面で、文字・枠・スタイルの設定を出さない
    render() { /* 中のパネルは renderer が並べる(ここでは何も消さない) */ },
  });
})();
