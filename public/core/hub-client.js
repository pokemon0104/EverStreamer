/* WebSocket 接続(切断時は自動で再接続) */
(function () {
  'use strict';
  class Hub {
    constructor(role) {
      this.role = role;
      this.handlers = {};
      this.seq = 0;
      this.clientId = null;
      this.retry = 0;
      this.connected = false;
      this.connect();
    }
    connect() {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { this.scheduleReconnect(); return; }
      this.ws = ws;
      ws.onopen = () => {
        this.retry = 0;
        this.connected = true;
        this.send('core:hello', { role: this.role });
        this.emit('core:open', {});
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'core:init') this.clientId = m.payload.clientId;
        this.emit(m.type, m.payload || {}, m);
      };
      ws.onclose = () => {
        if (this.connected) this.emit('core:close', {});
        this.connected = false;
        this.scheduleReconnect();
      };
      ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
    }
    scheduleReconnect() {
      clearTimeout(this.timer);
      const delay = Math.min(5000, 300 * Math.pow(1.6, this.retry++));
      this.timer = setTimeout(() => this.connect(), delay);
    }
    on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return this; }
    emit(type, payload, msg) {
      for (const fn of this.handlers[type] || []) {
        try { fn(payload, msg || {}); } catch (e) { console.error(e); }
      }
      // 各機能(演出など)にも同じメッセージを渡す
      if (window.OV && OV.dispatch) OV.dispatch(type, payload, msg || {});
    }
    send(type, payload = {}) {
      const seq = ++this.seq;
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type, payload, seq }));
      return seq;
    }
  }
  window.OV.Hub = Hub;
})();
