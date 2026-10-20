/* YouTube の数値を数値パネルに渡す */
(function () {
  'use strict';
  OV.numberSources = OV.numberSources || {};
  OV.ytMetrics = [
    ['concurrentViewers', '同時視聴者数'],
    ['viewCount', '視聴回数'],
    ['likeCount', '高評価(いいね)'],
    ['chatCount', 'ライブチャット数'],
    ['commentCount', 'コメント欄の件数'],
    ['subscriberCount', 'チャンネル登録者数'],
  ];
  OV.numberSources.youtube = {
    // 取得時刻(updatedAt)が変わっただけでは描き直さない(数値が変わったときだけ)
    deps: (S) => (S.ytStats ? [S.ytStats.total, S.ytStats.h, S.ytStats.v] : null),
    get(d, S) {
      const st = S.ytStats || {};
      const scope = d.scope || 'total';
      const obj = scope === 'total' ? st.total : st[scope];
      if (!obj) return null;
      const v = obj[d.metric || 'likeCount'];
      return v == null ? null : Number(v);
    },
  };
})();
