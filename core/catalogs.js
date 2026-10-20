'use strict';
// カタログ = 設定ファイル以外の参照データ(スタイル定義・フォント一覧・ロゴ一覧など)。
// 保存はせず、変更があれば全クライアントに配信する。
function createCatalogs() {
  const map = {};
  let listener = () => {};
  return {
    all: () => map,
    get: (k) => map[k],
    set(k, v) {
      map[k] = v;
      listener(k, v);
    },
    onChange(fn) { listener = fn; },
  };
}
module.exports = { createCatalogs };
