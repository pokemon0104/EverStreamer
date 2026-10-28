/* SNSアカウントパネルの設定:アカウントの追加・並べ替え・表示のしかた */
(function () {
  'use strict';
  const { h } = UI;
  const LIST = [['x', 'X(旧Twitter)'], ['youtube', 'YouTube'], ['twitch', 'Twitch'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['bluesky', 'Bluesky'], ['threads', 'Threads'], ['discord', 'Discord'], ['niconico', 'ニコニコ'], ['facebook', 'Facebook'], ['web', 'Webサイト'], ['other', 'その他']];
  const HINT = { x: '@your_id', youtube: '@your_channel', twitch: 'your_name', instagram: '@your_id', tiktok: '@your_id', bluesky: '@name.bsky.social', threads: '@your_id', discord: 'サーバー名・招待コード', niconico: 'ユーザー名', facebook: 'ページ名', web: 'example.com', other: 'アカウント名' };

  ADM.registerInspector('sns', {
    title: 'SNSアカウント',
    sig: (p) => String(((p.data || {}).items || []).length),
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const setD = (k) => (v) => ADM.patchPanel(id, { data: { [k]: v } });
      const dk = (k) => ({ get: () => D()[k], set: setD(k) });
      const items = () => (D().items || []).map((x) => ({ ...x }));
      const setItems = (list) => ADM.patchPanel(id, { data: { items: list } });
      const ik = (i, k) => ({
        get: () => (items()[i] || {})[k],
        set: (v) => { const l = items(); if (!l[i]) return; l[i][k] = v; setItems(l); },
      });
      const move = (i, d) => { const l = items(); const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; setItems(l); };

      const list = h('div', { class: 'sns-edit' });
      items().forEach((_, i) => {
        const plat = () => (items()[i] || {}).platform;
        const idInput = UI.text({ label: 'アカウント', ...ik(i, 'id') });
        UI.bind(idInput, () => { const inp = idInput.querySelector('input'); if (inp) inp.placeholder = `例:${HINT[plat()] || ''}`; });
        list.append(h('div', { class: 'sns-row' },
          h('div', { class: 'row' },
            h('b', { style: { flex: 1 } }, `${i + 1}.`),
            UI.toggle({ label: '表示', get: () => (items()[i] || {}).show !== false, set: ik(i, 'show').set }),
            UI.button('↑', () => move(i, -1), 'small'),
            UI.button('↓', () => move(i, 1), 'small'),
            UI.button('削除', () => { const l = items(); l.splice(i, 1); setItems(l); }, 'small danger')),
          UI.select({ label: 'サービス', options: LIST, ...ik(i, 'platform') }),
          idInput,
          UI.text({ label: '名前の上の文字', placeholder: '空欄でOK(例:サブ垢)', ...ik(i, 'label') }),
          UI.text({ label: '印を変える', placeholder: '空欄で標準(絵文字や1〜2文字)', maxlength: 4, ...ik(i, 'icon') })));
      });

      root.append(
        UI.toggle({ label: '見出しを表示', get: () => D().showTitle !== false, set: setD('showTitle') }),
        UI.text({ label: '見出し', placeholder: '例:SNS・フォローしてね', ...dk('title') }),
        h('h3', { class: 'h' }, 'アカウント'),
        list,
        h('div', { class: 'row' },
          UI.button('+ アカウントを追加', () => { const l = items(); const used = new Set(l.map((x) => x.platform)); const next = (LIST.find(([k]) => !used.has(k)) || LIST[0])[0]; l.push({ platform: next, id: '', label: '', icon: '', show: true }); setItems(l); }, 'small primary')),
        h('h3', { class: 'h' }, '表示のしかた'),
        UI.seg({ label: '並べ方', options: [['list', '縦に並べる'], ['row', '横に並べる'], ['rotate', '1つずつ切り替え']], ...dk('layout') }),
        UI.when(() => D().layout === 'rotate', UI.num({ label: '切り替えの間隔', min: 2, max: 60, step: 1, unit: '秒', ...dk('rotateSec') })),
        UI.seg({ label: '印', options: [['color', 'テンプレートの色'], ['mono', '文字の色だけ'], ['none', 'なし']], ...dk('iconMode') }),
        UI.toggle({ label: 'サービス名(X・YouTube など)も出す', ...dk('showService') }),
        UI.seg({ label: '揃え', options: [['left', '左'], ['center', '中央'], ['right', '右']], ...dk('align') }),
        h('p', { class: 'hint' }, '「1つずつ切り替え」は、狭い場所に置くときに便利です。印はサービスの略号をテンプレートの色にしたものです。「印を変える」に絵文字などを入れると差し替えられます。'),
      );
    },
  });
})();
