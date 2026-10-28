'use strict';
// WebSocket ハブ:メッセージは { type: "名前空間:動作", payload, seq } の共通形式
const { WebSocketServer } = require('ws');
const util = require('./util');
const { viewFor, keyFor } = require('./canvas');

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

function createHub({ server, store, catalogs, handlers, panelTypes, bus }) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: ({ origin, req }) => {
      if (!util.isLoopback(req.socket.remoteAddress)) return false;
      return !origin || origin === 'null' || LOCAL_ORIGIN.test(origin);
    },
  });
  const clients = new Map(); // ws -> { id, role }

  const sendTo = (ws, type, payload, extra) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type, payload, ...extra }));
  };
  const broadcast = (type, payload, extra) => {
    const text = JSON.stringify({ type, payload, ...extra });
    for (const ws of clients.keys()) if (ws.readyState === 1) ws.send(text);
  };

  catalogs.onChange((name, value) => broadcast('core:catalog', { name, value }));

  wss.on('connection', (ws) => {
    const client = { id: util.uid('c'), role: 'unknown' };
    clients.set(ws, client);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;
      handle(ws, client, msg);
    });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => {});
  });

  // 切断検知(OBS がスリープした場合など)
  const heartbeat = setInterval(() => {
    for (const ws of clients.keys()) {
      if (!ws.isAlive) { ws.terminate(); clients.delete(ws); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, 15000);
  wss.on('close', () => clearInterval(heartbeat));

  function handle(ws, client, msg) {
    const { type, seq } = msg;
    const payload = util.isPlainObject(msg.payload) ? msg.payload : {};

    if (type === 'core:hello') {
      client.role = String(payload.role || 'unknown');
      sendTo(ws, 'core:init', {
        clientId: client.id,
        version: store.version,
        state: store.state,
        catalogs: catalogs.all(),
      });
      return;
    }
    const fn = handlers[type];
    if (!fn) {
      sendTo(ws, 'core:error', { message: `未対応のメッセージです: ${type}` });
      return;
    }
    const touched = new Set();
    // 管理画面で縦画面を編集しているときは canvas: 'v' が付いてくる
    const canvas = payload.canvas === 'v' ? 'v' : 'h';
    delete payload.canvas;
    const ctx = {
      canvas,
      state: viewFor(store.state, canvas),
      raw: store.state,
      catalogs,
      panelTypes,
      util,
      client,
      commit: (...keys) => keys.forEach((k) => touched.add(keyFor(canvas, k))),
      commitRaw: (...keys) => keys.forEach((k) => touched.add(k)),
      normalize: (key, v) => store.normalize(keyFor(canvas, key), v),
      normalizeRaw: (key, v) => store.normalize(key, v), // 画面の読み替えをしない(vPanels などを直接)
      reply: (t, p) => sendTo(ws, t, p),
      toast: (message, kind = 'info') => sendTo(ws, 'core:toast', { message, kind }),
      broadcast,
      bus,
    };
    try {
      fn(payload, ctx);
    } catch (e) {
      console.error(`[hub] ${type} の処理でエラー:`, e);
      sendTo(ws, 'core:error', { message: e.message || String(e) });
    }
    if (touched.size) {
      store.scheduleSave();
      for (const key of touched) {
        broadcast('core:section', { key, value: store.state[key] }, { origin: client.id, seq });
      }
    }
  }

  return { broadcast, clients };
}

module.exports = { createHub };
