'use strict';
// Twitch:ログイン不要の匿名読み取り(IRC over WebSocket)。チャンネル名を入れるだけでチャットを受け取る
// ・読み取り専用なので、書き込み・フォローの検知はできない(フォローは手動ボタンか外部サービスから)
// ・サブスク・ギフト・レイド・ビッツ(Cheer)は、チャットに流れる通知(USERNOTICE / bits)から自動で拾う
const WebSocket = require('ws');

const URL = process.env.TWITCH_IRC_URL || 'wss://irc-ws.chat.twitch.tv:443'; // 環境変数はテスト用
const unescapeTag = (v) => String(v || '').replace(/\\(.)/g, (_, c) => ({ s: ' ', ':': ';', '\\': '\\', r: '\r', n: '\n' }[c] || c));

/** IRC の1行を { tags, prefix, command, params, trailing } に分ける */
function parseLine(line) {
  let rest = line;
  const out = { tags: {}, prefix: '', command: '', params: [], trailing: '' };
  if (rest.startsWith('@')) {
    const sp = rest.indexOf(' ');
    for (const kv of rest.slice(1, sp).split(';')) {
      const i = kv.indexOf('=');
      out.tags[i < 0 ? kv : kv.slice(0, i)] = i < 0 ? '' : unescapeTag(kv.slice(i + 1));
    }
    rest = rest.slice(sp + 1);
  }
  if (rest.startsWith(':')) {
    const sp = rest.indexOf(' ');
    out.prefix = rest.slice(1, sp);
    rest = rest.slice(sp + 1);
  }
  const ti = rest.indexOf(' :');
  if (ti >= 0) { out.trailing = rest.slice(ti + 2); rest = rest.slice(0, ti); }
  const parts = rest.split(' ').filter(Boolean);
  out.command = parts.shift() || '';
  out.params = parts;
  return out;
}

/** 本文とエモートの位置から、文字とエモート画像の並び(parts)を作る */
function partsOf(text, emotes) {
  if (!emotes) return null;
  const chars = Array.from(text); // Twitch の位置は「文字」単位
  const ranges = [];
  for (const group of emotes.split('/')) {
    const [id, pos] = group.split(':');
    if (!id || !pos || !/^[\w-]+$/.test(id)) continue;
    for (const r of pos.split(',')) {
      const [a, b] = r.split('-').map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) ranges.push({ a, b, id });
    }
  }
  if (!ranges.length) return null;
  ranges.sort((x, y) => x.a - y.a);
  const parts = [];
  let i = 0;
  for (const r of ranges) {
    if (r.a < i) continue;
    if (r.a > i) parts.push({ t: 'text', v: chars.slice(i, r.a).join('') });
    parts.push({ t: 'emote', url: `https://static-cdn.jtvnw.net/emoticons/v2/${r.id}/default/dark/2.0`, alt: chars.slice(r.a, r.b + 1).join('') });
    i = r.b + 1;
  }
  if (i < chars.length) parts.push({ t: 'text', v: chars.slice(i).join('') });
  return parts;
}

const BADGES = { broadcaster: 'owner', moderator: 'moderator', vip: 'vip', subscriber: 'member', founder: 'member', partner: 'verified', staff: 'verified' };
function badgesOf(tag) {
  const set = new Set();
  for (const b of String(tag || '').split(',')) {
    const k = BADGES[b.split('/')[0]];
    if (k) set.add(k);
  }
  return [...set];
}
const planName = (p) => ({ Prime: 'Prime', 1000: 'Tier 1', 2000: 'Tier 2', 3000: 'Tier 3' }[p] || '');

function create(api) {
  let ws = null;
  let channel = '';
  let wanted = false;
  let retry = 0;
  let retryTimer = null;
  let joinTimer = null;
  let pingTimer = null;
  let gen = 0;

  function cleanup() {
    clearTimeout(retryTimer); clearTimeout(joinTimer); clearInterval(pingTimer);
    if (ws) { try { ws.removeAllListeners(); ws.on('error', () => {}); ws.terminate(); } catch { /* ignore */ } }
    ws = null;
  }
  function scheduleRetry(why) {
    if (!wanted) return;
    retry += 1;
    const wait = Math.min(60000, 2000 * 2 ** Math.min(retry - 1, 5)); // 2秒 → 4秒 → … → 最大60秒
    api.status('error', `${why}。${Math.round(wait / 1000)}秒後に再接続します`);
    retryTimer = setTimeout(connect, wait);
  }
  function onLine(line, my) {
    if (my !== gen || !line) return;
    const m = parseLine(line);
    if (m.command === 'PING') { ws.send(`PONG :${m.trailing || 'tmi.twitch.tv'}`); return; }
    if (m.command === 'RECONNECT') { cleanup(); connect(); return; }
    if (m.command === 'ROOMSTATE') { clearTimeout(joinTimer); retry = 0; api.status('connected', `#${channel}`); return; }
    if (m.command === 'NOTICE' && /Login|authentication/i.test(m.trailing)) { api.status('error', m.trailing); return; }
    const t = m.tags;
    const name = t['display-name'] || (m.prefix.split('!')[0] || '');
    const base = {
      id: t.id || '', name, userId: t['user-id'] || '', badges: badgesOf(t.badges), color: /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : '',
      at: t['tmi-sent-ts'] ? new Date(Number(t['tmi-sent-ts'])).toISOString() : new Date().toISOString(),
    };
    if (m.command === 'PRIVMSG') {
      let text = m.trailing;
      if (text.startsWith('\u0001ACTION ') && text.endsWith('\u0001')) text = text.slice(8, -1); // /me
      const bits = Number(t.bits) || 0;
      api.emit([{ ...base, text, parts: partsOf(text, t.emotes), kind: bits ? 'bits' : 'text', amount: bits ? `${bits} bits` : '' }]);
      return;
    }
    if (m.command === 'USERNOTICE') {
      const id = t['msg-id'];
      const months = Number(t['msg-param-cumulative-months']) || 0;
      if (id === 'sub' || id === 'resub') api.event({ kind: 'member', name, months, plan: planName(t['msg-param-sub-plan']), text: m.trailing, platform: 'twitch' });
      else if (id === 'subgift' || id === 'anonsubgift') api.event({ kind: 'gift', name: name || 'Anonymous', to: t['msg-param-recipient-display-name'] || '', count: 1, platform: 'twitch' });
      else if (id === 'submysterygift') api.event({ kind: 'gift', name: name || 'Anonymous', count: Number(t['msg-param-mass-gift-count']) || 1, platform: 'twitch' });
      else if (id === 'raid') api.event({ kind: 'raid', name: t['msg-param-displayName'] || name, viewers: Number(t['msg-param-viewerCount']) || 0, platform: 'twitch' });
      // 通知についている本文(再サブスクのメッセージなど)は、チャットとしても表示する
      if (m.trailing) api.emit([{ ...base, text: m.trailing, parts: partsOf(m.trailing, t.emotes), kind: 'text', amount: '' }]);
    }
  }
  function connect() {
    cleanup();
    if (!wanted || !channel) return;
    const my = ++gen;
    api.status('connecting', `#${channel}`);
    try {
      ws = new WebSocket(URL, { handshakeTimeout: 10000 });
    } catch (e) { scheduleRetry(`接続できません(${e.message})`); return; }
    ws.on('open', () => {
      if (my !== gen) return;
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
      ws.send(`JOIN #${channel}`);
      // 参加できたら ROOMSTATE が届く。届かないときは、チャンネル名が違う可能性が高い
      joinTimer = setTimeout(() => { if (my === gen) api.status('error', `#${channel} に参加できません。チャンネル名を確認してください`); }, 10000);
      pingTimer = setInterval(() => { try { ws.send('PING :sok'); } catch { /* ignore */ } }, 240000);
    });
    ws.on('message', (data) => { for (const line of String(data).split('\r\n')) { try { onLine(line, my); } catch (e) { console.warn('[twitch]', e.message); } } });
    ws.on('error', (e) => { if (my === gen) api.status('error', `通信エラー(${e.code || e.message})`); });
    ws.on('close', () => { if (my === gen) { cleanup(); scheduleRetry('接続が切れました'); } });
  }
  return {
    start(cfg) {
      const ch = String(cfg.channel || '').trim().toLowerCase().replace(/^.*twitch\.tv\//, '').replace(/^#/, '').replace(/[^a-z0-9_]/g, '');
      if (wanted && ch === channel && ws) return;
      channel = ch;
      wanted = !!ch;
      retry = 0;
      if (!ch) { cleanup(); api.status('off', ''); return; }
      connect();
    },
    stop() { wanted = false; gen += 1; cleanup(); api.status('off', ''); },
  };
}

module.exports = { id: 'twitch', label: 'Twitch', create, _test: { parseLine, partsOf, badgesOf } };
