'use strict';
// 空きスペース:何も表示しない場所取り(縦型配信で YouTube がコメントを表示する場所、アバターの場所など)。
// 管理画面のプレビューにだけ点線の枠と名前を出し、OBS のオーバーレイには何も出さない。
module.exports = {
  order: 52,
  panelTypes: {
    space: {
      label: '空きスペース(場所取り)',
      defaults: () => ({
        name: '空きスペース',
        placement: 'free',
        heightMode: 'fixed',
        w: 600,
        h: 300,
        data: { label: 'ここは空けておく' },
      }),
    },
  },
};
