/* チャットタブ:YouTube・Twitch の接続状態、Twitch のチャンネル、除外、ダミーコメント */
(function () {
  'use strict';
  const { h } = UI;
  const C = () => OV.raw.chat || {};
  const ST = () => OV.state.chatStatus || {};
  const upd = (patch) => {
    const cur = OV.raw.chat || (OV.raw.chat = {});
    for (const [k, v] of Object.entries(patch)) cur[k] = v && typeof v === 'object' ? { ...(cur[k] || {}), ...v } : v;
    ADM.hub.send('chat:update', { patch });
    ADM.changed();
  };
  const ago = (t) => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    return s < 60 ? `${s}秒前` : `${Math.round(s / 60)}分前`;
  };

  /** YouTube の状態(youtube 機能の取得状況から作る) */
  ADM.ytChatState = function () {
    const cfg = OV.state.youtube || {};
    const st = OV.state.ytStats || {};
    const q = st.quota || {};
    if (!cfg.hasKey) return { state: 'off', text: 'APIキーが未設定です' };
    if (!cfg.h || (!cfg.h.videoId && !(cfg.v || {}).videoId)) return { state: 'off', text: '配信のURLが未設定です' };
    if (!cfg.running) return { state: st.error ? 'error' : 'off', text: st.error || '停止中(YouTube タブの「取得を開始」で始まります)' };
    if (st.error || st.chatError) return { state: 'error', text: [st.error, st.chatError].filter(Boolean).join(' / ') };
    if (q.level === 'high' || q.level === 'warn') return { state: 'warn', text: `取得中。クォータが${q.level === 'high' ? '上限まであとわずか' : '80%を超えました'}(間隔を延ばしています)` };
    if (!cfg.chatCount) return { state: 'warn', text: '取得中。ただし「ライブチャットの件数を数える」がオフのため、コメントは届きません' };
    const live = ['h', 'v'].map((s) => (st[s] || {}).live).filter(Boolean);
    if (live.length && !live.includes('live')) return { state: 'warn', text: '取得中。配信がライブ中ではないため、コメントは届きません' };
    return { state: 'connected', text: '取得中' };
  };
  const LABEL = { connected: '接続中', connecting: '接続しています…', error: 'エラー', warn: '注意', off: '未接続' };
  function card(name, get, extra) {
    const dot = h('i', { class: 'ch-dot' });
    const st = h('b');
    const txt = h('div', { class: 'hint ch-detail' });
    const el = h('div', { class: 'ch-card' }, h('div', { class: 'ch-head' }, dot, h('span', { class: 'ch-name' }, name), st), txt, extra || '');
    UI.bind(el, () => {
      const s = get();
      el.dataset.state = s.state;
      st.textContent = LABEL[s.state] || s.state;
      txt.textContent = s.text || '';
    });
    return el;
  }

  ADM.registerTab({
    id: 'chat',
    label: 'チャット',
    order: 22,
    basic: true,
    sig: () => JSON.stringify([OV.canvas]),
    build(root) {
      // ---- 接続状態 ----
      root.append(
        h('p', { class: 'hint' }, 'YouTube と Twitch のコメントを取り込み、コメント欄・キャラクター・演出・投票・アラートに使います。両方を同時に使えます。'),
        h('h3', { class: 'h' }, '接続状態'),
        card('YouTube', ADM.ytChatState, h('div', { class: 'row' }, UI.button('YouTube タブを開く', () => ADM.showTab('youtube'), 'small'))),
      );
      const ytQ = ADM.ytQuotaMeter ? ADM.ytQuotaMeter() : null;
      if (ytQ) root.append(ytQ);

      // ---- Twitch ----
      const chIn = h('input', { type: 'text', placeholder: 'チャンネル名(例:your_channel)', style: { flex: 1 }, spellcheck: 'false' });
      UI.bind(chIn, () => { if (document.activeElement !== chIn) chIn.value = (C().twitch || {}).channel || ''; });
      const connect = () => upd({ twitch: { channel: chIn.value.trim() } });
      chIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') connect(); });
      const tw = () => {
        const s = ST().twitch || {};
        const cnt = s.count ? `(受信 ${s.count}件${s.lastAt ? `・最後 ${ago(s.lastAt)}` : ''})` : '';
        return { state: s.state || 'off', text: `${s.detail || (s.state === 'off' ? 'チャンネル名を入れて「接続」を押します' : '')}${cnt}` };
      };
      root.append(
        card('Twitch', tw),
        h('div', { class: 'row' }, chIn, UI.button('接続', connect, 'primary small'), UI.button('切断', () => { chIn.value = ''; upd({ twitch: { channel: '' } }); }, 'small'), UI.button('再接続', () => ADM.send('chat:reconnect', { platform: 'twitch' }), 'small')),
        UI.seg({ label: 'Twitch のコメントの扱い', options: [['h', '横型配信のコメント'], ['v', '縦型配信のコメント']], get: () => (C().twitch || {}).side || 'h', set: (v) => upd({ twitch: { side: v } }) }),
        h('p', { class: 'hint' }, 'ログインは不要です(読み取り専用の匿名接続)。チャット・ビッツ(Cheer)・サブスク・ギフト・レイドを受け取れます。フォローは Twitch の仕組み上、ログインなしでは検知できないため、「アラート」の手動ボタンか外部サービスから送ってください。'));

      // ---- テスト ----
      let plat = 'youtube';
      const side = () => (OV.canvas === 'v' ? 'v' : 'h');
      root.append(
        h('h3', { class: 'h' }, 'テスト(ダミーコメント)'),
        UI.seg({ label: '見た目', options: [['youtube', 'YouTube 風'], ['twitch', 'Twitch 風']], get: () => plat, set: (v) => { plat = v; UI.refreshAll(); } }),
        h('div', { class: 'row' },
          UI.button('コメント', () => ADM.send('chat:dummy', { kind: 'text', platform: plat, side: side() }), 'small'),
          UI.button('スーパーチャット', () => ADM.send('chat:dummy', { kind: 'superchat', platform: plat, side: side() }), 'small'),
          UI.button('モデレーター', () => ADM.send('chat:dummy', { kind: 'mod', platform: plat, side: side() }), 'small'),
          UI.button('5件まとめて', () => ADM.send('chat:dummy', { kind: 'mix', count: 5, platform: plat, side: side() }), 'small')),
        h('p', { class: 'hint' }, 'ダミーのコメントは本物と同じ道を通るので、コメント欄・キャラクター・演出・投票・除外の設定をまとめて確かめられます。いま編集している画面(横/縦)のコメントとして届きます。'));

      // ---- 除外 ----
      root.append(UI.section('ch-ex', '除外(表示・反応しない)',
        UI.textarea({ label: '除外する名前(1行に1人。カンマ区切りでも可)', rows: 3, placeholder: '例:spam_user', get: () => C().exclude, set: (v) => upd({ exclude: v }) }),
        UI.toggle({ label: 'よくある Bot を除外する', get: () => C().excludeBots !== false, set: (v) => upd({ excludeBots: v }) }),
        h('p', { class: 'hint' }, 'Nightbot・StreamElements・Streamlabs・Moobot・Fossabot など。名前が「bot」で終わるモデレーターも除外します。'),
        UI.toggle({ label: '「!」で始まるコマンドを除外する', get: () => !!C().hideCommands, set: (v) => upd({ hideCommands: v }) })));
    },
  });
  // 状態の「○秒前」を動かす
  setInterval(() => { if (ADM.activeTab === 'chat') UI.refreshAll(); }, 5000);
})();
