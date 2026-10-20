'use strict';
// YouTube 連携:横配信・縦配信の数値を取得して合算する
// APIキーは data/youtube-key.json に保存し、画面には送らない(末尾だけ表示)
const fs = require('fs');
const path = require('path');
const { isPlainObject } = require('../../core/util');
const { allPanels } = require('../../core/canvas');

const API = (process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3').replace(/\/$/, '');
const METRICS = ['viewCount', 'likeCount', 'commentCount', 'concurrentViewers', 'chatCount', 'subscriberCount'];
// 1回あたりのクォータ消費(目安)
const COST = { videos: 1, channels: 1, chat: 5 };
const DAILY_LIMIT = 10000;

let ctxApp = null; // { store, hub, paths }
let keyFile = '';
let apiKey = '';
let pollTimer = null;
let lastChannelFetch = 0;
const chatTimers = { h: null, v: null };
// チャット確認の「連鎖」は、配信ごとに常に1本だけ。止めたり URL を変えたりすると世代が進み、古い連鎖は何もせず終わる
const chatGen = { h: 0, v: 0 };
const chatAlive = { h: false, v: false };
const chatBlocked = { h: '', v: '' }; // チャットが終了・無効・上限超過になった ID(取得を始め直すまで再開しない)
let loopGen = 0; // 取得ループも常に1本だけ
let polling = false; // 取得の最中に、もう1回取得を始めない
let quotaWin = { start: 0, units: 0 }; // 直近1時間の使用量(暴走防止用)
const chatRuntime = { h: {}, v: {} }; // { liveChatId, pageToken }

const defaultConfig = () => ({
  running: false,
  mode: 'auto', // auto = 無料枠を使い切らない範囲で一番リアルタイムに / manual = 間隔を自分で指定
  hours: 4, // 自動モードで想定する配信時間(時間)
  pollSec: 10, // 手動モード:いいね・視聴者数などの更新間隔
  chatCount: true,
  chatSec: 20, // 手動モード:チャット数の確認間隔
  autoTimer: true, // YouTube の実際の配信開始時刻で、経過時間を自動で合わせる
  subsSec: 30, // チャンネル登録者数を確認する間隔(1回 1 ユニット)
  hasKey: false,
  keyHint: '',
  h: { url: '', videoId: '' },
  v: { url: '', videoId: '' },
});
const emptySide = () => ({ title: '', channelTitle: '', channelId: '', live: '', viewCount: null, likeCount: null, commentCount: null, concurrentViewers: null, chatCount: null, subscriberCount: null, chatLastAt: '', videoId: '', base: { viewCount: 0, likeCount: 0, commentCount: 0 } });
const defaultStats = () => ({ schema: 2, effective: { pollSec: 0, chatSec: 0 }, updatedAt: 0, error: '', chatError: '', h: emptySide(), v: emptySide(), total: {}, quota: { date: '', units: 0 } });

function parseVideoId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    let id = '';
    if (/(^|\.)youtu\.be$/.test(u.hostname)) id = u.pathname.slice(1, 12);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v').slice(0, 11);
    else {
      const m = u.pathname.match(/\/(live|shorts|embed|v)\/([\w-]{11})/);
      if (m) id = m[2];
    }
    return /^[\w-]{11}$/.test(id) ? id : '';
  } catch {
    return '';
  }
}

// クォータは太平洋時間の0時にリセットされる
function quotaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}
function addQuota(units) {
  const st = ctxApp.store.state.ytStats;
  const d = quotaDate();
  if (st.quota.date !== d) st.quota = { date: d, units: 0 };
  st.quota.units += units;
  st.quota.level = quotaLevel(st.quota.units);
  st.quota.limit = DAILY_LIMIT;
  const now = Date.now();
  if (now - quotaWin.start > 3600000) quotaWin = { start: now, units: 0 };
  quotaWin.units += units;
  checkGuard();
}

// 想定よりずっと多く使っているときは、上限に達する前に取得を止める(想定の2倍、または 1 時間 2,500 ユニットまで)
function checkGuard() {
  const { youtube: cfg, ytStats: st } = ctxApp.store.state;
  if (!cfg.running) return;
  const e = effectiveIntervals();
  const sides = ['h', 'v'].filter((x) => cfg[x].videoId).length;
  const est = 3600 / e.pollSec + 12 + (cfg.chatCount ? sides * (3600 / e.chatSec) * COST.chat : 0);
  const limit = Number(process.env.YT_GUARD_LIMIT) || Math.max(2500, est * 2); // 環境変数はテスト用
  if (quotaWin.units > limit) {
    st.error = `直近1時間のAPI使用量が想定(約${Math.round(est)})を大きく超えたため、取得を自動で止めました。「取得を開始」で再開できます`;
    stop(false);
    publish('ytStats');
  }
}

function publish(...keys) {
  const { store, hub } = ctxApp;
  store.scheduleSave();
  for (const key of keys) hub.broadcast('core:section', { key, value: store.state[key] });
}

// 数値の初期化。チャンネル登録者数はゼロにせず、そのまま残す。
//  rebase = false(URL変更・APIキー保存):動画に付いている数値を、そのまま全部取得し直す
//  rebase = true (「数値をゼロに戻す」ボタン):いま付いている数値を基準(0)にして、これからの増加分だけを表示する
function resetSide(st, side, sameVideo, rebase) {
  const old = st[side];
  const fresh = emptySide();
  fresh.subscriberCount = old.subscriberCount;
  fresh.channelId = old.channelId;
  fresh.channelTitle = old.channelTitle;
  if (sameVideo) { fresh.videoId = old.videoId; fresh.title = old.title; fresh.live = old.live; }
  fresh.chatCount = 0;
  if (rebase) {
    fresh.base = null; // 次の取得値を基準にする
    fresh.viewCount = 0;
    fresh.likeCount = 0;
    fresh.commentCount = 0;
    fresh.concurrentViewers = 0;
    fresh.chatLastAt = new Date().toISOString(); // これより前のチャットは数えない
  }
  st[side] = fresh;
}
function resetAllStats(st, rebase) {
  for (const side of ['h', 'v']) {
    resetSide(st, side, true, rebase);
    chatRuntime[side].pageToken = ''; // チャットも最初から数え直す
  }
  st.peakViewers = 0;
  computeTotal();
}

// ---- 更新間隔(自動モード:API の無料枠 1 日 10,000 ユニットを使い切らない範囲で最短にする) ----
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
function baseIntervals() {
  const { youtube: cfg, ytStats: st } = ctxApp.store.state;
  const used = st.quota.date === quotaDate() ? st.quota.units : 0;
  if (cfg.mode === 'manual') {
    // 手動モードでも、上限に近づいたら間隔を延ばす(85% で 2 倍、95% で 4 倍)
    const k = used >= DAILY_LIMIT * 0.95 ? 4 : used >= DAILY_LIMIT * 0.85 ? 2 : 1;
    return { pollSec: clampN((Number(cfg.pollSec) || 10) * k, 3, 600), chatSec: clampN((Number(cfg.chatSec) || 20) * k, 5, 600), slowed: k > 1 };
  }
  const budget = Math.max(0, DAILY_LIMIT * 0.92 - used) / clampN(Number(cfg.hours) || 4, 1, 24); // 1時間あたりに使える量
  const chatSides = cfg.chatCount ? ['h', 'v'].filter((x) => cfg[x].videoId).length : 0;
  let pollSec = 5; // いいね・視聴者数などは 1 回 1 ユニットなので、5 秒ごとでも 1 時間 720
  let rest = budget - 3600 / pollSec - 12;
  if (rest < 0) {
    pollSec = clampN(Math.ceil(3600 / Math.max(1, budget - 12)), 5, 120);
    rest = 0;
  }
  let chatSec = 0;
  if (chatSides) chatSec = rest > 0 ? clampN(Math.ceil((3600 * COST.chat * chatSides) / rest), 10, 120) : 120;
  return { pollSec, chatSec: chatSec || 30 };
}


// 経過時間を、YouTube の実際の配信開始時刻に合わせる(追加の API 消費なし。手動で「配信開始」を押さなくてよい)
function syncTimer(info) {
  const { store } = ctxApp;
  if (!store.state.youtube.autoTimer || !info.length) return;
  const start = Math.min(...info.map((x) => x.start));
  const ended = info.every((x) => x.end);
  const end = ended ? Math.max(...info.map((x) => x.end)) : 0;
  const t = store.state.timer;
  const want = { startedAt: start, stoppedAt: end || null };
  if (t.startedAt !== want.startedAt || (t.stoppedAt || null) !== want.stoppedAt) {
    store.state.timer = want;
    publish('timer');
  }
}

function computeTotal() {
  const st = ctxApp.store.state.ytStats;
  const cfg = ctxApp.store.state.youtube;
  const sides = ['h', 'v'].filter((s) => cfg[s].videoId).map((s) => st[s]);
  const total = {};
  for (const m of METRICS) {
    if (m === 'subscriberCount') {
      // 同じチャンネルの場合は二重に数えない
      const seen = new Map();
      for (const s of sides) if (s.channelId && s.subscriberCount != null) seen.set(s.channelId, s.subscriberCount);
      total[m] = seen.size ? [...seen.values()].reduce((a, b) => a + b, 0) : null;
      continue;
    }
    const vals = sides.map((s) => s[m]).filter((x) => x != null);
    total[m] = vals.length ? vals.reduce((a, b) => a + Number(b), 0) : null;
  }
  st.total = total;
  // 最大同時視聴者数(感謝メッセージの「今日の記録」用)
  st.peakViewers = Math.max(Number(st.peakViewers) || 0, Number(total.concurrentViewers) || 0);
}

/** エラー文に APIキーが混ざっていたら伏せる(ログ・画面に出さない) */
function redact(msg) {
  let m = String(msg || '');
  if (apiKey) m = m.split(apiKey).join('***');
  return m.replace(/AIza[0-9A-Za-z_-]{20,}/g, '***').replace(/([?&]key=)[^&\s]+/g, '$1***');
}

async function apiGet(endpoint, params) {
  const q = new URLSearchParams({ ...params, key: apiKey });
  let r;
  try { r = await fetch(`${API}/${endpoint}?${q}`); } catch (err) {
    // 通信できないとき(オフラインなど)。メッセージに URL(キー入り)が混ざらないようにする
    const e = new Error(`YouTube に接続できません(${redact((err.cause && err.cause.code) || err.message)})`);
    e.reason = 'network';
    throw e;
  }
  let j = {};
  try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok) {
    const reason = (((j.error || {}).errors || [])[0] || {}).reason || '';
    const msg = {
      quotaExceeded: '今日のクォータ(API利用上限)を使い切りました。太平洋時間の0時(日本時間の16時または17時)にリセットされます',
      keyInvalid: 'APIキーが正しくありません',
      badRequest: 'APIキーが正しくない可能性があります',
      accessNotConfigured: 'このAPIキーのプロジェクトで「YouTube Data API v3」が有効になっていません',
      forbidden: 'アクセスが拒否されました',
      liveChatEnded: 'ライブチャットは終了しています',
      liveChatDisabled: 'この配信はライブチャットが無効です',
      liveChatNotFound: 'ライブチャットが見つかりません',
    }[reason] || ((j.error && j.error.message) || `HTTP ${r.status}`);
    const e = new Error(redact(msg));
    e.reason = reason;
    throw e;
  }
  return j;
}

// ライブ配信中でない動画(終了済み・配信前)は、数値がほとんど動かないので、取得をゆっくりにする
function effectiveIntervals() {
  const e = baseIntervals();
  const { youtube: cfg, ytStats: st } = ctxApp.store.state;
  const lives = ['h', 'v'].filter((x) => cfg[x].videoId).map((x) => st[x].live).filter(Boolean);
  if (lives.length && !lives.includes('live')) e.pollSec = Math.max(e.pollSec, lives.includes('upcoming') ? 30 : 60);
  return e;
}

const num = (v) => (v == null || v === '' ? null : Number(v));

async function pollOnce() {
  if (polling) return; // 取得の最中は、もう1回始めない
  polling = true;
  try { await pollInner(); } finally { polling = false; }
}
async function pollInner() {
  const { store } = ctxApp;
  const cfg = store.state.youtube;
  const st = store.state.ytStats;
  if (!apiKey) { st.error = 'APIキーが設定されていません'; publish('ytStats'); return; }
  const ids = [...new Set(['h', 'v'].map((s) => cfg[s].videoId).filter(Boolean))];
  if (!ids.length) { st.error = '配信のURLが入力されていません'; publish('ytStats'); return; }
  try {
    const j = await apiGet('videos', { part: 'snippet,statistics,liveStreamingDetails', id: ids.join(','), maxResults: '50' });
    addQuota(COST.videos);
    const byId = new Map((j.items || []).map((it) => [it.id, it]));
    const missing = [];
    let likeDelta = 0; // 前回の取得から増えたいいねの数(演出用)
    const timeInfo = []; // 配信の実際の開始・終了時刻(経過時間の自動同期用)
    for (const side of ['h', 'v']) {
      const id = cfg[side].videoId;
      if (!id) { st[side] = emptySide(); continue; }
      const it = byId.get(id);
      if (!it) { missing.push(side === 'h' ? '横' : '縦'); continue; }
      const prev = st[side].videoId === id ? st[side] : emptySide();
      const s = it.statistics || {};
      const live = it.liveStreamingDetails || {};
      const raw = { viewCount: num(s.viewCount), likeCount: num(s.likeCount), commentCount: num(s.commentCount) };
      // リセット直後の最初の取得値を基準(0)にする
      const base = prev.base || { viewCount: raw.viewCount || 0, likeCount: raw.likeCount || 0, commentCount: raw.commentCount || 0 };
      const rel = (k) => (raw[k] == null ? null : Math.max(0, raw[k] - (base[k] || 0)));
      st[side] = {
        ...prev,
        videoId: id,
        title: (it.snippet || {}).title || '',
        channelTitle: (it.snippet || {}).channelTitle || '',
        channelId: (it.snippet || {}).channelId || '',
        live: (it.snippet || {}).liveBroadcastContent || 'none',
        base,
        viewCount: rel('viewCount'),
        likeCount: rel('likeCount'),
        commentCount: rel('commentCount'),
        concurrentViewers: num(live.concurrentViewers),
      };
      // チャットはライブ配信中だけ数える(終了・配信前の動画では、チャット確認を行わない)
      const isLive = ((it.snippet || {}).liveBroadcastContent || '') === 'live';
      const rawChat = isLive ? live.activeLiveChatId || '' : '';
      const chatId = rawChat && rawChat !== chatBlocked[side] ? rawChat : '';
      if (live.actualStartTime) timeInfo.push({ start: Date.parse(live.actualStartTime), end: live.actualEndTime ? Date.parse(live.actualEndTime) : 0 });
      // 同じ動画で、前回の値がある場合だけ「増えた」と判断する(登録・リセット直後の1回目は演出しない)
      if (prev.videoId === id && prev.likeCount != null && st[side].likeCount != null && st[side].likeCount > prev.likeCount) {
        likeDelta += st[side].likeCount - prev.likeCount;
      }
      if (chatRuntime[side].liveChatId !== chatId) chatRuntime[side] = { liveChatId: chatId, pageToken: '' };
    }
    // チャンネル登録者数(設定した間隔ごと。1回 1 ユニット)
    const prevSubs = st.total ? st.total.subscriberCount : null;
    if (Date.now() - lastChannelFetch > clampN(Number(cfg.subsSec) || 30, 15, 600) * 1000) {
      const chIds = [...new Set(['h', 'v'].map((s) => st[s].channelId).filter(Boolean))];
      if (chIds.length) {
        const cj = await apiGet('channels', { part: 'statistics', id: chIds.join(',') });
        addQuota(COST.channels);
        lastChannelFetch = Date.now();
        const subs = new Map((cj.items || []).map((c) => [c.id, c.statistics && !c.statistics.hiddenSubscriberCount ? num(c.statistics.subscriberCount) : null]));
        for (const side of ['h', 'v']) if (subs.has(st[side].channelId)) st[side].subscriberCount = subs.get(st[side].channelId);
      }
    }
    st.error = missing.length ? `${missing.join('・')}配信の動画が見つかりません(URLを確認してください)` : '';
    st.updatedAt = Date.now();
    computeTotal();
    if (likeDelta > 0 && ctxApp.bus) ctxApp.bus.emit('yt:likes', { delta: likeDelta });
    syncTimer(timeInfo);
    const nowSubs = st.total ? st.total.subscriberCount : null;
    if (ctxApp.bus) {
      if (prevSubs != null && nowSubs != null && nowSubs > prevSubs) ctxApp.bus.emit('yt:subs', { delta: nowSubs - prevSubs, count: nowSubs });
      ctxApp.bus.emit('yt:stats', {}); // 目標達成の判定などに使う
    }
    scheduleChats();
  } catch (e) {
    st.error = redact(e.message);
    if (e.reason === 'quotaExceeded' || e.reason === 'keyInvalid' || e.reason === 'accessNotConfigured') stop(false);
  }
  publish('ytStats');
}

// ---- ライブチャットの件数(新しく来たメッセージを数える) ----
async function chatOnce(side, gen) {
  const { store } = ctxApp;
  const cfg = store.state.youtube;
  const st = store.state.ytStats;
  const rt = chatRuntime[side];
  const current = () => gen === chatGen[side];
  const end = () => { if (current()) chatAlive[side] = false; };
  if (!current()) return;
  if (!cfg.running || !cfg.chatCount || !rt.liveChatId) { end(); return; }
  let nextMs = effectiveIntervals().chatSec * 1000;
  try {
    const params = { liveChatId: rt.liveChatId, part: 'snippet,authorDetails', maxResults: '2000' };
    if (rt.pageToken) params.pageToken = rt.pageToken;
    const j = await apiGet('liveChat/messages', params);
    if (!current()) return;
    addQuota(COST.chat);
    rt.pageToken = j.nextPageToken || '';
    nextMs = Math.max(nextMs, Number(j.pollingIntervalMillis) || 0);
    if ((j.items || []).length >= 2000) nextMs = 500; // まだ続きがある場合はすぐ取り続ける
    const s = st[side];
    let count = s.chatCount || 0;
    let last = s.chatLastAt || '';
    const fresh = []; // 新しく届いたコメント(古いものは old = true)
    const members = [];
    const recentLimit = new Date(Date.now() - 90 * 1000).toISOString();
    for (const it of j.items || []) {
      const sn = it.snippet || {};
      const t = sn.type || '';
      // メンバー登録・メンバーの記念(最新のサポーター用。コメント数には数えない)
      if (['newSponsorEvent', 'memberMilestoneChatEvent', 'membershipGiftingEvent'].includes(t)) {
        if (!(s.chatLastAt && sn.publishedAt && sn.publishedAt <= s.chatLastAt) && sn.publishedAt >= recentLimit) {
          const gift = t === 'membershipGiftingEvent' ? Number((sn.membershipGiftingDetails || {}).giftMembershipsCount) || 1 : 0;
          const months = t === 'memberMilestoneChatEvent' ? Number((sn.memberMilestoneChatDetails || {}).memberMonth) || 0 : 0;
          members.push({ name: (it.authorDetails || {}).displayName || '', kind: gift ? 'gift' : 'member', count: gift, months, side, id: it.id || '', at: sn.publishedAt || '' });
        }
        continue;
      }
      if (!['textMessageEvent', 'superChatEvent', 'superStickerEvent'].includes(t)) continue;
      // 再起動直後に過去分を二重に数えないよう、記録済みの時刻より新しいものだけ数える
      if (s.chatLastAt && sn.publishedAt && sn.publishedAt <= s.chatLastAt) continue;
      count += 1;
      if (!last || sn.publishedAt > last) last = sn.publishedAt;
      // 取得し始めたときに返ってくる古いチャットは old = true にする(演出・投票などの対象にしない)
      const sc = sn.superChatDetails || sn.superStickerDetails || {};
      const au = it.authorDetails || {};
      const badges = [au.isChatOwner && 'owner', au.isChatModerator && 'moderator', au.isChatSponsor && 'member', au.isVerified && 'verified'].filter(Boolean);
      fresh.push({
        badges,
        name: (it.authorDetails || {}).displayName || '',
        userId: (it.authorDetails || {}).channelId || '',
        text: sc.userComment || sn.displayMessage || ((sn.textMessageDetails || {}).messageText) || '',
        amount: sc.amountDisplayString || '',
        type: t,
        side, // h = 横型配信 / v = 縦型配信
        id: it.id || '',
        at: sn.publishedAt || '',
        old: !!(sn.publishedAt && sn.publishedAt < recentLimit),
      });
    }
    s.chatCount = count;
    s.chatLastAt = last;
    if (fresh.length && ctxApp.bus) ctxApp.bus.emit('yt:chat', { messages: fresh, spreadMs: nextMs });
    if (members.length && ctxApp.bus) ctxApp.bus.emit('yt:member', { members });
    st.chatError = '';
    computeTotal();
  } catch (e) {
    if (!current()) return;
    st.chatError = `チャット数:${redact(e.message)}`;
    if (['liveChatEnded', 'liveChatDisabled', 'liveChatNotFound', 'forbidden', 'quotaExceeded'].includes(e.reason)) {
      chatBlocked[side] = rt.liveChatId; // 同じチャットでは、取得を始め直すまで再開しない
      rt.liveChatId = '';
      publish('ytStats');
      end();
      return;
    }
  }
  publish('ytStats');
  if (current()) chatTimers[side] = setTimeout(() => chatOnce(side, gen), nextMs);
}
function scheduleChats() {
  const cfg = ctxApp.store.state.youtube;
  for (const side of ['h', 'v']) {
    if (chatAlive[side]) continue; // すでに動いている(待機中・通信中)なら、増やさない
    if (cfg.running && cfg.chatCount && chatRuntime[side].liveChatId) {
      chatAlive[side] = true;
      const gen = chatGen[side];
      chatTimers[side] = setTimeout(() => chatOnce(side, gen), 500);
    }
  }
}
function clearChats() {
  for (const side of ['h', 'v']) {
    chatGen[side] += 1; // 通信中の古い連鎖も、結果が返ってきたら何もせず終わる
    chatAlive[side] = false;
    clearTimeout(chatTimers[side]);
    chatTimers[side] = null;
  }
}

function loop() {
  clearTimeout(pollTimer);
  const gen = ++loopGen; // 古いループは、世代が違うので自然に終わる(増殖しない)
  const tick = () => {
    if (gen !== loopGen) return;
    if (!ctxApp.store.state.youtube.running) return;
    ctxApp.store.state.ytStats.effective = effectiveIntervals();
    pollOnce().finally(() => {
      if (gen !== loopGen || !ctxApp.store.state.youtube.running) return;
      pollTimer = setTimeout(tick, effectiveIntervals().pollSec * 1000);
    });
  };
  tick();
}
function stop(manual = true) {
  loopGen += 1;
  clearTimeout(pollTimer);
  clearChats();
  ctxApp.store.state.youtube.running = false;
  publish('youtube');
  if (manual) publish('ytStats');
}

function readKey() {
  try { return JSON.parse(fs.readFileSync(keyFile, 'utf8')).apiKey || ''; } catch { return ''; }
}
// ラベルから指標を推測して、手入力のままの数値パネルを YouTube 連動にする。
// 「手入力」を自分で選んだパネル(sourceLocked)と、すでに連動しているパネルは触らない。
// 横画面・縦画面の両方のパネルが対象(state はサーバーの設定そのもの)
function linkNumberPanels(state) {
  const useChat = state.youtube.chatCount;
  let n = 0;
  for (const p of allPanels(state)) {
    if (p.type !== 'number') continue;
    const d = p.data || (p.data = {});
    if (d.source === 'youtube' || d.sourceLocked) continue;
    const label = `${p.name} ${d.label || ''}`;
    let metric = '';
    if (d.mode === 'goal' || /登録/.test(label)) metric = 'subscriberCount';
    else if (/いいね|高評価|like/i.test(label)) metric = 'likeCount';
    else if (/コメント|チャット/.test(label)) metric = useChat ? 'chatCount' : 'commentCount';
    else if (/同時|視聴者/.test(label)) metric = 'concurrentViewers';
    else if (/視聴|再生/.test(label)) metric = 'viewCount';
    if (!metric) continue;
    Object.assign(d, { source: 'youtube', metric, scope: 'total' });
    n += 1;
  }
  return n;
}

const hint = (k) => (k ? `…${k.slice(-4)}` : ''); // 画面には末尾4文字だけ

/** 今日のクォータの使い具合:ok / warn(80%以上) / high(95%以上) */
function quotaLevel(units) { return units >= DAILY_LIMIT * 0.95 ? 'high' : units >= DAILY_LIMIT * 0.8 ? 'warn' : 'ok'; }

module.exports = {
  order: 60,
  sections: {
    youtube: {
      default: defaultConfig,
      normalize: (v) => {
        const d = defaultConfig();
        const o = isPlainObject(v) ? v : {};
        return { ...d, ...o, h: { ...d.h, ...(o.h || {}) }, v: { ...d.v, ...(o.v || {}) } };
      },
    },
    ytStats: {
      default: defaultStats,
      normalize: (v) => {
        const d = defaultStats();
        const o = isPlainObject(v) ? v : {};
        const out = { ...d, ...o, h: { ...d.h, ...(o.h || {}) }, v: { ...d.v, ...(o.v || {}) }, quota: { ...d.quota, ...(o.quota || {}) } };
        if (o.schema !== 2) {
          // 旧バージョンは「登録時点の値」を基準にして差し引いていたため、基準値を捨てて動画の全数値を取り直す
          for (const side of ['h', 'v']) out[side].base = { viewCount: 0, likeCount: 0, commentCount: 0 };
          out.schema = 2;
        }
        return out;
      },
    },
  },
  init({ store, hub, paths, bus }) {
    ctxApp = { store, hub, paths, bus };
    keyFile = path.join(paths.data, 'youtube-key.json');
    apiKey = readKey();
    const cfg = store.state.youtube;
    cfg.hasKey = !!apiKey;
    cfg.keyHint = hint(apiKey);
    if (cfg.running) setTimeout(loop, 1000); // 前回取得中のまま終了していたら再開
  },
  handlers: {
    setKey({ apiKey: k }, ctx) {
      const key = String(k || '').trim();
      if (!/^[\w-]{20,60}$/.test(key)) return ctx.toast('APIキーの形式が正しくありません', 'warn');
      fs.writeFileSync(keyFile, JSON.stringify({ apiKey: key }), 'utf8');
      apiKey = key;
      Object.assign(ctx.state.youtube, { hasKey: true, keyHint: hint(key) });
      resetAllStats(ctx.state.ytStats, false);
      ctx.commit('youtube', 'ytStats');
      ctx.toast('APIキーを保存しました');
      if (ctx.state.youtube.h.videoId || ctx.state.youtube.v.videoId) setTimeout(pollOnce, 0); // 保存した直後にも取得して表示する
    },
    clearKey(_, ctx) {
      try { fs.unlinkSync(keyFile); } catch { /* ignore */ }
      apiKey = '';
      Object.assign(ctx.state.youtube, { hasKey: false, keyHint: '' });
      stop(false);
      ctx.commit('youtube');
    },
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const cfg = ctx.state.youtube;
      let urlChanged = false;
      for (const side of ['h', 'v']) {
        if (patch[side] && typeof patch[side].url === 'string') {
          cfg[side].url = patch[side].url;
          const id = parseVideoId(patch[side].url);
          if (cfg[side].videoId !== id) {
            cfg[side].videoId = id;
            resetSide(ctx.state.ytStats, side, false, false);
            if (cfg.autoTimer) { ctx.state.timer = { startedAt: null, stoppedAt: null }; ctx.commit('timer'); } // 新しい配信なので経過時間も 0 に戻し、開始を検知したら合わせ直す
            ctx.state.ytStats.peakViewers = 0; // 新しい配信として最大視聴者数も数え直す
            urlChanged = true;
            lastChannelFetch = 0; // 登録者数は新しい配信でもすぐ取り直す
            chatRuntime[side] = {};
            chatBlocked[side] = '';
            chatGen[side] += 1; // この配信の古いチャット確認は終わらせる
            chatAlive[side] = false;
            clearTimeout(chatTimers[side]);
            chatTimers[side] = null;
            computeTotal();
            ctx.commit('ytStats');
          }
        }
      }
      if (patch.autoTimer != null) cfg.autoTimer = !!patch.autoTimer;
      if (patch.subsSec != null) cfg.subsSec = clampN(Number(patch.subsSec) || 30, 15, 600);
      if (patch.mode === 'auto' || patch.mode === 'manual') cfg.mode = patch.mode;
      if (patch.hours != null) cfg.hours = clampN(Number(patch.hours) || 4, 1, 24);
      if (patch.pollSec != null) cfg.pollSec = clampN(Number(patch.pollSec) || 10, 3, 300);
      if (patch.chatSec != null) cfg.chatSec = clampN(Number(patch.chatSec) || 20, 5, 300);
      ctx.state.ytStats.effective = effectiveIntervals();
      if (patch.mode || patch.hours != null || patch.pollSec != null || patch.chatSec != null) ctx.commit('ytStats');
      if (patch.chatCount != null) {
        cfg.chatCount = !!patch.chatCount;
        if (!cfg.chatCount) clearChats(); else scheduleChats();
      }
      ctx.commit('youtube');
      // URL を登録した直後に、動画にすでに付いている数値を取得して表示する(取得開始前でも1回だけ取得)
      if (urlChanged && apiKey && !cfg.running) setTimeout(pollOnce, 0);
      if (urlChanged && cfg.running) loop();
    },
    start(_, ctx) {
      if (ctx.state.youtube.running) return; // すでに取得中
      chatBlocked.h = ''; chatBlocked.v = '';
      quotaWin = { start: Date.now(), units: 0 }; // 安全装置で止まった後も、再開すれば改めて使える
      if (!apiKey) return ctx.toast('先にAPIキーを保存してください', 'warn');
      if (!ctx.state.youtube.h.videoId && !ctx.state.youtube.v.videoId) return ctx.toast('横または縦の配信URLを入力してください', 'warn');
      ctx.state.youtube.running = true;
      lastChannelFetch = 0;
      // 手動で「連動にする」を押さなくても、取得を始めたら数値パネルを自動で連動させる
      const linked = linkNumberPanels(ctx.raw);
      if (linked) {
        ctx.commit('youtube');
        ctx.commitRaw('panels', 'vPanels');
        ctx.toast(`${linked}個の数値パネルを YouTube 連動にしました`);
      } else ctx.commit('youtube');
      loop();
    },
    stop() { stop(true); },
    refresh(_, ctx) {
      if (!apiKey) return ctx.toast('先にAPIキーを保存してください', 'warn');
      lastChannelFetch = 0;
      pollOnce();
    },
    resetStats(_, ctx) {
      resetAllStats(ctx.state.ytStats, true);
      ctx.commit('ytStats');
      ctx.toast('数値をゼロに戻しました。これからの増加分を表示します(登録者数はそのまま)');
    },
    // 数値パネルを、ラベルからそれらしい指標に連動させる(手動ボタン)
    linkPanels(_, ctx) {
      const n = linkNumberPanels(ctx.raw);
      ctx.commitRaw('panels', 'vPanels');
      ctx.toast(n ? `${n}個の数値パネルを YouTube 連動にしました` : '連動できる数値パネルが見つかりませんでした(すでに連動済みかもしれません)', n ? 'info' : 'warn');
    },
  },
  _test: { parseVideoId },
};
