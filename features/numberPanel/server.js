'use strict';
// 数値パネル(手入力、または YouTube などの値)
module.exports = {
  order: 40,
  panelTypes: {
    number: {
      label: '数値',
      defaults: () => ({
        name: '数値',
        data: {
          mode: 'value', // value = 数値をそのまま / goal = 目標までの残り
          label: 'いいね',
          view: 'label', // label = ラベル+数字 / emoji = 絵文字+数字 / none = 何も表示せず演出だけ
          icon: '', // 空 = 指標から自動(👍💬👤…)
          value: 0,
          goal: 500,
          current: 0,
          unit: '',
          template: '', // 空なら既定。{value}{remain}{goal}{current}{unit} が使える
          doneText: '目標達成!',
          align: 'center',
          source: 'manual', // manual = 手入力 / youtube = YouTube の値
          metric: 'likeCount', // YouTube の指標
          scope: 'total', // total = 横+縦の合計 / h = 横だけ / v = 縦だけ
          // ---- 目標モードの表示(バー) ----
          display: 'both', // text = 文字だけ / bar = バーだけ / both = 文字+バー / cycle = 文字とバーを交互に切り替え
          cycleSec: 6, // 交互に切り替える間隔(秒)
          barStart: 0, // バーの 0% にする値(例:前回の目標 400 → 400〜500 の間の進み具合を表示)
          barStyle: 'smooth', // smooth = なめらか / blocks = ブロック
          barBlocks: 20,
          barHeight: 22,
          barColor: '', // 空 = 数字の色
          barBg: '', // 空 = 暗い半透明
          barText: 'auto', // auto / remain(あと◯人) / fraction(現在 / 目標) / percent / none
          // ---- 動き ----
          barAnim: 'smooth', // smooth = 伸びる / none = 動かさず切り替え
          barAnimMs: 900,
          countUp: true, // 数字をカウントアップ/ダウンさせる
          flash: true, // 増えたときに光る
        },
      }),
    },
  },
};
