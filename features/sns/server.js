'use strict';
// SNSアカウント(X・YouTube・Instagram・TikTok などのアカウントを並べて表示)
module.exports = {
  order: 24,
  panelTypes: {
    sns: {
      label: 'SNSアカウント',
      defaults: () => ({
        name: 'SNSアカウント',
        data: {
          title: 'SNS',
          showTitle: true,
          // platform: x / youtube / twitch / instagram / tiktok / bluesky / threads / discord / niconico / facebook / web / other
          items: [
            { platform: 'x', id: '@your_id', label: '', icon: '', show: true },
            { platform: 'youtube', id: '@your_channel', label: '', icon: '', show: true },
          ],
          layout: 'list', // list = 縦に並べる / row = 横に並べる / rotate = 1つずつ切り替える
          rotateSec: 6,
          iconMode: 'color', // color = サービスの色 / mono = 文字色だけ / none = アイコンなし
          showService: false, // サービス名(X、YouTube など)も出す
          align: 'left',
        },
      }),
    },
  },
};
