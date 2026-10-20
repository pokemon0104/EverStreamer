'use strict';
// コメント連動:投票(アンケート)・アイデア募集・カウンター
// YouTube のチャットから届いたコメントを、パネルごとに集計する(API は使わない)
const crypto = require('crypto');
const { uid, clone, isPlainObject } = require('../../core/util');
const { allPanels } = require('../../core/canvas');

const POLL_PRESETS = {
  route: { name: 'ルート選択', title: 'どっちに進む?', items: [['左の道', '左,ひだり,left,l'], ['右の道', '右,みぎ,right,r'], ['まっすぐ', 'まっすぐ,straight,s']] },
  weapon: { name: '武器・装備', title: '次に使う武器は?', items: [['剣', '剣,けん,sword'], ['弓', '弓,ゆみ,bow'], ['魔法', '魔法,まほう,magic'], ['盾', '盾,たて,shield']] },
  abcd: { name: 'A〜D 選択', title: '選択肢をえらんでね', items: [['選択肢 A', 'a,1'], ['選択肢 B', 'b,2'], ['選択肢 C', 'c,3'], ['選択肢 D', 'd,4']] },
  yesno: { name: 'はい / いいえ', title: 'どっちにする?', items: [['はい', 'はい,yes,y'], ['いいえ', 'いいえ,no,n']] },
};
const mkCands = (items) => items.map(([name, al], i) => ({ id: `c${i + 1}`, name, aliases: al.split(',').map((x) => x.trim()).filter(Boolean) }));

let storeRef = null;
let hubRef = null;

// 全角・半角、大文字・小文字をそろえて比べる
const norm = (s) => String(s || '').normalize('NFKC').trim().toLowerCase();

function publish(key) {
  storeRef.scheduleSave();
  hubRef.broadcast('core:section', { key, value: storeRef.state[key] });
}
function st(panelId) {
  const all = storeRef.state.ctState;
  if (!all[panelId]) all[panelId] = { votes: {}, voters: {}, ideas: [] };
  return all[panelId];
}

function processMessage(msg) {
  const text = norm(msg.text);
  if (!text) return false;
  let changed = false;
  for (const p of allPanels(storeRef.state)) {
    const d = p.data || {};
    if (d.active === false) continue;
    if (p.type === 'poll') {
      const cands = Array.isArray(d.candidates) ? d.candidates : [];
      const hit = cands.find((c) => (c.aliases || []).some((a) => {
        const al = norm(a);
        return al && (d.match === 'exact' ? text === al : text.includes(al));
      }));
      if (!hit) continue;
      const s = st(p.id);
      if (d.oneVote !== false) {
        const uid2 = msg.userId || msg.name || 'anon';
        const before = s.voters[uid2];
        if (before === hit.id) continue; // 同じ候補への投票は、何度書いても1票
        if (before) s.votes[before] = Math.max(0, (s.votes[before] || 0) - 1); // 投票先を変えた場合は、前の票を取り消す
        s.voters[uid2] = hit.id;
      }
      s.votes[hit.id] = (s.votes[hit.id] || 0) + 1;
      changed = true;
    } else if (p.type === 'ideas') {
      const raw = String(msg.text || '').normalize('NFKC').trim();
      const prefix = String(d.prefix || '').normalize('NFKC').trim();
      let body = raw;
      if (prefix) {
        if (!raw.startsWith(prefix)) continue;
        body = raw.slice(prefix.length).trim();
      }
      const max = Number(d.maxLen) || 25;
      if (!body || body.length > max) continue;
      const s = st(p.id);
      const last = s.ideas[s.ideas.length - 1];
      if (last && last.user === msg.name && last.text === body) continue; // 連続の重複は無視
      s.ideas.push({ id: uid('id'), user: msg.name || '', text: body, at: Date.now() });
      if (s.ideas.length > 50) s.ideas.shift();
      changed = true;
    }
  }
  if (changed) publish('ctState');
  return changed;
}

function counterFind(ref, n) {
  const list = allPanels(storeRef.state).filter((p) => p.type === 'counter');
  const p = list.find((x) => x.id === ref) || list.find((x) => x.name === ref) || list[0];
  if (!p) return null;
  const arr = p.data.counters || [];
  const i = Math.max(0, Math.min(arr.length - 1, (Number(n) || 1) - 1));
  return arr[i] ? { p, c: arr[i] } : null;
}

module.exports = {
  order: 45,
  namespace: 'ct',
  sections: {
    ct: { default: () => ({ token: crypto.randomBytes(6).toString('hex') }), normalize: (v) => ({ token: (v && v.token) || crypto.randomBytes(6).toString('hex') }) },
    ctState: { default: () => ({}), normalize: (v) => (isPlainObject(v) ? v : {}) },
  },
  panelTypes: {
    poll: {
      label: '投票',
      defaults: () => ({
        name: '投票',
        fill: false,
        data: {
          title: POLL_PRESETS.route.title,
          candidates: mkCands(POLL_PRESETS.route.items),
          active: true, // 投票を受け付ける
          match: 'contains', // contains = コメントに含まれていれば / exact = 完全に一致したときだけ
          oneVote: true, // 1人1票(投票先を変えると、前の票は取り消し)
          showTop: 4,
          sortByVotes: true,
          showPercent: true,
          hint: '',
        },
      }),
    },
    ideas: {
      label: 'アイデア募集',
      defaults: () => ({
        name: 'アイデア募集',
        data: { title: '採用アイデア募集', prefix: '', maxLen: 25, showCount: 4, active: true, showUser: true, hint: '' },
      }),
    },
    counter: {
      label: 'カウンター',
      defaults: () => ({
        name: 'カウンター',
        data: {
          title: 'チャレンジカウンター',
          showTitle: true,
          layout: 'row', // row = 横に並べる / column = 縦に並べる
          counters: [{ name: '全滅数', value: 0 }, { name: 'ボス撃破', value: 0 }],
        },
      }),
    },
  },
  init({ app, store, hub, bus }) {
    storeRef = store;
    hubRef = hub;
    bus.on('chat:messages', ({ messages }) => {
      for (const m of messages || []) if (!m.old) processMessage(m); // 取得し始めたときの古いコメントは集計しない
    });
    // Stream Deck・スマホからカウンターを増減する(このPCの中だけ・合言葉つき)
    app.get('/api/counter', (req, res) => {
      if (String(req.query.token || '') !== store.state.ct.token) return res.status(403).json({ error: '合言葉(token)が違います' });
      const f = counterFind(String(req.query.panel || ''), req.query.n);
      if (!f) return res.status(404).json({ error: 'カウンターが見つかりません' });
      f.c.value = Math.max(0, (Number(f.c.value) || 0) + (Number(req.query.delta) || 1));
      publish('panels'); publish('vPanels');
      res.json({ ok: true, name: f.c.name, value: f.c.value });
    });
  },
  handlers: {
    // テストコメント(YouTube なしで、投票・アイデア・言葉の演出・コメント演出を一度に確認できる)
    test({ name, text, count }, ctx) {
      const n = Math.max(1, Math.min(30, Number(count) || 1));
      const messages = Array.from({ length: n }, (_, i) => ({ name: n > 1 ? `${name || 'テスト'}${i + 1}` : name || 'テスト', userId: `test-${name || 'テスト'}-${n > 1 ? i : ''}`, text: String(text || ''), type: 'textMessageEvent', old: false }));
      ctx.bus.emit('chat:raw', { platform: 'youtube', messages, spreadMs: 2000 });
    },
    resetVotes({ id }, ctx) {
      if (ctx.state.ctState[id]) { ctx.state.ctState[id].votes = {}; ctx.state.ctState[id].voters = {}; }
      ctx.commit('ctState');
    },
    clearIdeas({ id }, ctx) {
      if (ctx.state.ctState[id]) ctx.state.ctState[id].ideas = [];
      ctx.commit('ctState');
    },
    removeIdea({ id, ideaId }, ctx) {
      const s = ctx.state.ctState[id];
      if (s) s.ideas = s.ideas.filter((x) => x.id !== ideaId);
      ctx.commit('ctState');
    },
    loadPreset({ id, preset }, ctx) {
      const p = ctx.state.panels.find((x) => x.id === id);
      const pr = POLL_PRESETS[preset];
      if (!p || p.type !== 'poll' || !pr) return;
      p.data.candidates = mkCands(pr.items);
      p.data.title = pr.title;
      ctx.state.ctState[id] = { votes: {}, voters: {}, ideas: [] };
      ctx.commit('panels', 'ctState');
    },
    counter({ id, index, delta, set }, ctx) {
      const p = ctx.state.panels.find((x) => x.id === id);
      const c = p && (p.data.counters || [])[Number(index)];
      if (!c) return;
      c.value = set != null ? Math.max(0, Number(set) || 0) : Math.max(0, (Number(c.value) || 0) + (Number(delta) || 0));
      ctx.commit('panels');
    },
    newToken(_, ctx) {
      ctx.state.ct.token = crypto.randomBytes(6).toString('hex');
      ctx.commit('ct');
      ctx.toast('呼び出しURLを作り直しました。以前のURLは使えなくなります');
    },
  },
  _test: { norm, clone },
};
module.exports.POLL_PRESETS = POLL_PRESETS;
