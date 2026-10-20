'use strict';
// 機能どうしでイベントを受け渡すための共通の連絡口(サーバー内だけ)
// 例:youtube が 'yt:likes'(いいねが増えた)を出し、reactions が受け取って演出を配信する
const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(50);

module.exports = { bus };
