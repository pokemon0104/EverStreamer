/* アラートタブ:種類ごとの文と演出、手動ボタン、自動検知の範囲、外部ツール用の呼び出しURL */
(function () {
  'use strict';
  const { h } = UI;
  const { deepMerge, clone } = OV.util;
  const A = () => OV.raw.alerts || {};
  const V = () => OV.state.alertView || {};
  const upd = (patch) => { deepMerge(OV.raw.alerts, clone(patch)); ADM.queuePatch('alerts', 'alerts:update', {}, patch, 'alerts'); ADM.changed(); };
  const updView = (patch) => { deepMerge(OV.state.alertView, clone(patch)); ADM.queuePatch(`alView:${OV.canvas}`, 'alerts:updateView', {}, patch, 'alertView'); ADM.changed(); };
  const KINDS = [
    ['superchat', 'スーパーチャット', 'YouTube:自動', '{name} {amount} {text}'],
    ['bits', 'ビッツ(Cheer)', 'Twitch:自動', '{name} {amount} {text}'],
    ['member', 'メンバー・サブスク', 'YouTube・Twitch:自動', '{name} {months}'],
    ['gift', 'ギフト', 'YouTube・Twitch:自動', '{name} {count}'],
    ['raid', 'レイド', 'Twitch:自動 / YouTube:手動', '{name} {viewers}'],
    ['follow', 'フォロー', 'Twitch:手動・外部ツール', '{name}'],
    ['subscribe', 'チャンネル登録', 'YouTube:手動・外部ツール', '{name}'],
  ];

  ADM.registerTab({
    id: 'alerts',
    label: 'アラート',
    order: 39,
    basic: true,
    sig: () => JSON.stringify([A().token, OV.canvas]),
    build(root) {
      root.append(
        h('p', { class: 'hint' }, 'スーパーチャットやメンバー登録、レイドなどを、画面の上にカードで知らせます。続けて届いたときは1件ずつ順番に表示します。キャラクターも一緒に喜びます。'),
        UI.toggle({ label: 'アラートを表示する', get: () => A().enabled !== false, set: (v) => upd({ enabled: v }) }));

      // ---- 手動ボタン ----
      const nameIn = h('input', { type: 'text', placeholder: '名前(空欄なら「テストさん」)', style: { flex: 1 } });
      root.append(h('h3', { class: 'h' }, '手動で出す・テスト'),
        h('div', { class: 'row' }, nameIn),
        h('div', { class: 'row wrap' }, ...KINDS.map(([k, label]) => UI.button(label, () => ADM.send('alerts:fire', { kind: k, name: nameIn.value, test: !nameIn.value.trim() }), 'small'))),
        h('div', { class: 'row' }, UI.button('いまのアラートを飛ばす', () => ADM.send('alerts:skip'), 'small'), UI.button('待っているアラートを消す', () => ADM.send('alerts:clear'), 'small')));

      // ---- 自動で検知できる範囲 ----
      root.append(UI.section('al-auto', '自動で検知できるもの・できないもの',
        h('table', { class: 'al-table' },
          h('tr', null, h('th', null, ''), h('th', null, 'YouTube'), h('th', null, 'Twitch')),
          ...[
            ['スーパーチャット / ビッツ', '自動', '自動'],
            ['メンバー / サブスク', '自動', '自動'],
            ['ギフト', '自動', '自動'],
            ['レイド', '手動', '自動'],
            ['フォロー', '—', '手動'],
            ['チャンネル登録', '手動(数の増加は「お祝い」で自動)', '—'],
          ].map((r) => h('tr', null, ...r.map((c, i) => h(i ? 'td' : 'th', { class: c === '自動' ? 'ok' : '' }, c))))),
        h('p', { class: 'hint' }, 'YouTube の新規チャンネル登録は、公式APIでは「誰が登録したか」が分からないため、名前つきの自動アラートは出せません(登録者数が増えたことは分かるので、下の設定で名前なしのアラートを出せます)。Twitch のフォローは、ログイン(OAuth)が必要な仕組みのため、このツールでは検知しません。どちらも手動ボタンか、下の呼び出しURLを使って外部のツールから送れます。'),
        UI.toggle({ label: 'YouTube の登録者数が増えたら「チャンネル登録」のアラートを出す(名前なし)', get: () => !!A().subsAuto, set: (v) => upd({ subsAuto: v }) }),
        h('p', { class: 'hint' }, '「お祝い」タブの登録者のお祝いと重なるので、どちらか片方をおすすめします。')));

      // ---- 種類ごとの設定 ----
      for (const [k, label, auto, vars] of KINDS) {
        const K = () => (A().kinds || {})[k] || {};
        const kk = (f) => ({ get: () => K()[f], set: (v) => upd({ kinds: { [k]: { [f]: v } } }) });
        const en = window.I18N && I18N.lang === 'en';
        root.append(UI.section(`al-k-${k}`, en ? `${OV.t(label)} (${OV.t(auto)})` : `${label}(${auto})`,
          UI.toggle({ label: 'このアラートを出す', get: () => K().on !== false, set: (v) => upd({ kinds: { [k]: { on: v } } }) }),
          UI.text({ label: 'アイコン', ...kk('icon') }),
          UI.text({ label: '大きな文字', ...kk('title') }),
          UI.text({ label: '小さな文字', ...kk('sub') }),
          h('p', { class: 'hint' }, `使える言葉:${vars}(実際の名前や金額に置き換わります)`),
          UI.toggle({ label: 'メッセージ(コメント)も表示する', ...kk('showText') }),
          UI.select({ label: '演出', options: [['none', 'なし'], ['confetti', '紙吹雪'], ['fireworks', '花火'], ['both', '紙吹雪+花火']], ...kk('effect') }),
          UI.toggle({ label: '効果音(OBS で音を拾う設定が必要)', get: () => K().sound !== false, set: (v) => upd({ kinds: { [k]: { sound: v } } }) }),
          UI.num({ label: '表示する時間', min: 2, max: 30, step: 1, unit: '秒', ...kk('sec') }),
          h('div', { class: 'row end' }, UI.button('テスト', () => ADM.send('alerts:fire', { kind: k, test: true }), 'small'))));
        UI.setDefaultOpen(`al-k-${k}`, false);
      }

      // ---- 位置 ----
      root.append(UI.section('al-pos', '表示する位置(この画面)',
        UI.num({ label: '上からの位置', min: 0, max: OV.H - 100, step: 2, unit: 'px', get: () => V().y, set: (v) => updView({ y: v }) }),
        UI.num({ label: '大きさ', min: 0.4, max: 2.5, step: 0.05, unit: '倍', get: () => V().scale, set: (v) => updView({ scale: v }) }),
        UI.num({ label: '次のアラートまでの間', min: 0, max: 10, step: 0.5, unit: '秒', get: () => A().gapSec, set: (v) => upd({ gapSec: v }) })));

      // ---- 呼び出しURL ----
      const base = `${location.origin}/api/alert?token=${A().token}`;
      root.append(UI.section('al-url', '外部のツールから送る(呼び出しURL)',
        h('p', { class: 'hint' }, 'Stream Deck・Streamer.bot・ほかのアラートサービスの「Webリクエスト(GET)」に登録すると、そのツールからアラートを出せます。このPCの中からだけ使えます。'),
        ...[['follow', 'フォロー', '&name=名前'], ['subscribe', 'チャンネル登録', '&name=名前'], ['raid', 'レイド', '&name=名前&viewers=10'], ['superchat', 'スーパーチャット', '&name=名前&amount=¥500&text=メッセージ']]
          .map(([k, l, q]) => h('div', { class: 'f' }, h('span', { class: 'f-l' }, l), h('input', { type: 'text', readonly: true, value: `${base}&kind=${k}${q}`, class: 'url-in' }))),
        h('p', { class: 'hint' }, 'kind に使えるもの:superchat / bits / member / gift / raid / follow / subscribe。name・amount・text・count・viewers・months を付けられます(日本語は URL エンコードして送ってください)。'),
        h('div', { class: 'row end' }, UI.button('呼び出しURLを作り直す', () => { if (confirm('今のURLは使えなくなります。作り直しますか?')) ADM.send('alerts:newToken'); }, 'small danger'))));
    },
  });
})();
