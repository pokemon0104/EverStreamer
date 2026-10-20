/* YouTube タブ:APIキー・横/縦の配信URL・取得の開始停止・取得した数値の確認 */
(function () {
  'use strict';
  const { h } = UI;
  const CFG = () => OV.state.youtube || {};
  const ST = () => OV.state.ytStats || {};
  const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('ja-JP'));
  const LIVE = { live: '配信中', upcoming: '配信予定', none: '配信終了・通常動画' };

  function intervals() {
    const e = ST().effective || {};
    const c = CFG();
    return { pollSec: e.pollSec || c.pollSec || 10, chatSec: e.chatSec || c.chatSec || 20 };
  }
  function quotaPerHour() {
    const c = CFG();
    const { pollSec, chatSec } = intervals();
    let units = 3600 / pollSec + 12;
    if (c.chatCount) {
      const sides = ['h', 'v'].filter((s) => (c[s] || {}).videoId).length;
      units += sides * (3600 / chatSec) * 5;
    }
    return Math.round(units);
  }

  /** 今日のクォータ(残りの目安)。上限に近づくと色と文字で知らせる(チャットタブでも使う) */
  ADM.ytQuotaMeter = function () {
    const bar = h('i');
    const txt = h('div', { class: 'hint' });
    const box = h('div', { class: 'yt-quota' }, h('div', { class: 'yt-qbar' }, bar), txt);
    UI.bind(box, () => {
      const q = ST().quota || {};
      const used = Number(q.units) || 0;
      const lim = Number(q.limit) || 10000;
      const pct = Math.min(100, (used / lim) * 100);
      const lv = used >= lim * 0.95 ? 'high' : used >= lim * 0.8 ? 'warn' : 'ok';
      box.dataset.level = lv;
      bar.style.width = `${pct.toFixed(1)}%`;
      const rest = Math.max(0, lim - used).toLocaleString('ja-JP');
      const auto = (CFG().mode || 'auto') === 'auto';
      txt.textContent = lv === 'high' ? `今日のクォータ:残り約 ${rest}(上限まであとわずか)。取得の間隔を大きく延ばしています。止まった場合は、太平洋時間の0時(日本時間の16時か17時)に元に戻ります。`
        : lv === 'warn' ? `今日のクォータ:残り約 ${rest}(80%を超えました)。${auto ? '自動モードで間隔を延ばしています。' : '間隔を延ばしています(手動モードでも 85% で2倍、95% で4倍)。'}`
          : `今日のクォータ:残り約 ${rest} / ${lim.toLocaleString('ja-JP')}`;
    });
    return box;
  };

  function sideBox(side, label) {
    const input = h('input', { type: 'text', placeholder: 'https://www.youtube.com/live/… または watch?v=…', style: { flex: 1 } });
    const apply = UI.button('反映', () => ADM.send('youtube:update', { patch: { [side]: { url: input.value } } }), 'small');
    input.addEventListener('change', () => apply.click());
    const status = h('div', { class: 'hint' });
    UI.bind(input, () => { if (document.activeElement !== input) input.value = (CFG()[side] || {}).url || ''; });
    UI.bind(status, () => {
      const c = CFG()[side] || {};
      const s = ST()[side] || {};
      if (!c.url) { status.textContent = '未設定(使わない場合は空欄のまま)'; return; }
      if (!c.videoId) { status.textContent = 'URLから動画IDを読み取れません。配信ページのURLを貼ってください。'; return; }
      status.textContent = s.title ? `${LIVE[s.live] || ''}|${s.title}(${s.channelTitle})` : `動画ID ${c.videoId}(取得前)`;
    });
    return h('div', { style: { marginBottom: '10px' } },
      h('div', { class: 'f-l', style: { marginBottom: '4px' } }, label),
      h('div', { class: 'row' }, input, apply), status);
  }

  ADM.registerTab({
    id: 'youtube',
    label: 'YouTube',
    order: 35,
    sig: () => String(!!CFG().hasKey),
    build(root) {
      // --- APIキー
      const keyIn = h('input', { type: 'password', placeholder: 'AIza で始まるキーを貼り付け', style: { flex: 1 }, autocomplete: 'off' });
      const keyState = h('div', { class: 'hint' });
      UI.bind(keyState, () => { keyState.textContent = CFG().hasKey ? `保存済み(${CFG().keyHint})。キーはこのPCの data フォルダにだけ保存され、画面には表示されません。` : 'まだ保存されていません。下の「APIキーの取り方」を見てください。'; });
      // APIキーの取り方(手順)
      const steps = [
        ['Google Cloud Console を開く', 'https://console.cloud.google.com/ を開き、Google アカウントでログインします。初めてのときは利用規約に同意します。'],
        ['プロジェクトを作る', '画面上部の「プロジェクトを選択」→「新しいプロジェクト」を押し、好きな名前(例:stream-overlay)で作成します。'],
        ['YouTube Data API v3 を有効にする', '左のメニューの「APIとサービス」→「ライブラリ」で「YouTube Data API v3」を検索し、「有効にする」を押します。'],
        ['APIキーを作る', '「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」を押すと、AIza で始まるキーができます。'],
        ['キーを制限する(おすすめ)', 'キーの「編集」→「APIの制限」で「キーを制限」を選び、「YouTube Data API v3」だけにチェックして保存します。万一キーが漏れても、ほかのサービスには使われません。'],
        ['ここに貼り付けて保存', 'キーをコピーして上の欄に貼り付け、「保存」を押します。キーはこのPCの中にだけ保存されます。'],
      ];
      UI.setDefaultOpen('yt-guide', !CFG().hasKey);
      const guide = UI.section('yt-guide', 'APIキーの取り方',
        h('ol', { class: 'yt-steps' }, ...steps.map(([t, d]) => h('li', null, h('b', null, t), h('div', { class: 'hint' }, d)))),
        h('p', { class: 'hint' }, '料金はかかりません(1日 10,000 ユニットの無料枠)。クレジットカードの登録も不要です。キーは他人に見せないでください。配信画面やログにも表示されません。'));
      root.append(
        h('h3', { class: 'h' }, 'APIキー'),
        h('div', { class: 'row' }, keyIn, UI.button('保存', () => { ADM.send('youtube:setKey', { apiKey: keyIn.value }); keyIn.value = ''; }, 'primary')),
        keyState,
        CFG().hasKey ? h('div', { class: 'row end' }, UI.button('キーを削除', () => { if (confirm('保存したAPIキーを削除しますか?')) ADM.send('youtube:clearKey'); }, 'small danger')) : '',
        guide);

      // --- 配信URL
      root.append(h('h3', { class: 'h' }, '配信のURL(配信ごとに貼り替え)'), sideBox('h', '横配信'), sideBox('v', '縦配信'));

      // --- 取得
      const runBtn = h('button', { type: 'button', class: 'btn' });
      runBtn.addEventListener('click', () => ADM.send(CFG().running ? 'youtube:stop' : 'youtube:start'));
      UI.bind(runBtn, () => {
        runBtn.textContent = CFG().running ? '■ 取得を停止' : '▶ 取得を開始';
        runBtn.className = `btn ${CFG().running ? '' : 'primary'}`;
      });
      const quota = h('div', { class: 'hint' });
      UI.bind(quota, () => {
        const q = ST().quota || {};
        const { pollSec, chatSec } = intervals();
        quota.textContent = `いま:高評価・視聴者数は${pollSec}秒ごと${CFG().chatCount ? `、チャット数は${chatSec}秒ごと` : ''}。API利用量の目安 1時間あたり約${quotaPerHour()}(1日の上限 10,000、本日の使用 約${q.units || 0})`;
      });
      root.append(ADM.ytQuotaMeter());
      root.append(
        h('h3', { class: 'h' }, '取得'),
        h('div', { class: 'row' }, runBtn, UI.button('今すぐ更新', () => ADM.send('youtube:refresh'), 'small')),
        UI.seg({ label: '更新モード', options: [['auto', '自動(リアルタイム優先)'], ['manual', '手動']], get: () => CFG().mode || 'auto', set: (v) => ADM.send('youtube:update', { patch: { mode: v } }) }),
        UI.when(() => (CFG().mode || 'auto') === 'auto', h('div', null,
          UI.select({ label: '想定する配信時間', options: [['2', '2時間'], ['3', '3時間'], ['4', '4時間'], ['6', '6時間'], ['8', '8時間']], get: () => String(CFG().hours || 4), set: (v) => ADM.send('youtube:update', { patch: { hours: Number(v) } }) }),
          h('p', { class: 'hint' }, 'APIの1日の無料枠(10,000)を使い切らない範囲で、一番短い間隔に自動で調整します。使った量に応じて、配信中も自動で調整し直します。'))),
        UI.when(() => CFG().mode === 'manual', h('div', null,
          UI.select({ label: '更新の間隔', options: [['3', '3秒'], ['5', '5秒'], ['10', '10秒'], ['30', '30秒'], ['60', '1分']], get: () => String(CFG().pollSec || 10), set: (v) => ADM.send('youtube:update', { patch: { pollSec: Number(v) } }) }),
          UI.when(() => CFG().chatCount, UI.select({ label: 'チャットの確認間隔', options: [['10', '10秒'], ['20', '20秒'], ['30', '30秒'], ['60', '1分']], get: () => String(CFG().chatSec || 20), set: (v) => ADM.send('youtube:update', { patch: { chatSec: Number(v) } }) })))),
        UI.toggle({ label: '経過時間を YouTube の配信開始時刻に自動で合わせる', get: () => CFG().autoTimer !== false, set: (v) => ADM.send('youtube:update', { patch: { autoTimer: v } }) }),
        h('p', { class: 'hint' }, '配信が始まると、手動で「配信開始」を押さなくても経過時間が合います(追加の API 消費なし)。オンの間は、手動の時刻の補正よりも YouTube の時刻が優先されます。'),
        UI.select({ label: '登録者数の確認間隔', options: [['15', '15秒'], ['30', '30秒'], ['60', '1分'], ['300', '5分']], get: () => String(CFG().subsSec || 30), set: (v) => ADM.send('youtube:update', { patch: { subsSec: Number(v) } }) }),
        UI.toggle({ label: 'ライブチャットの件数を数える', get: () => CFG().chatCount, set: (v) => ADM.send('youtube:update', { patch: { chatCount: v } }) }),
        quota);

      // --- 取得結果
      const err = h('div', { class: 'note-box' });
      UI.bind(err, () => {
        const msg = [ST().error, ST().chatError].filter(Boolean).join(' / ');
        err.style.display = msg ? '' : 'none';
        err.textContent = msg;
      });
      const table = h('table', { class: 'yt-table' });
      const rows = (OV.ytMetrics || []).map(([k, l]) => {
        const tds = ['h', 'v', 'total'].map(() => h('td'));
        table.append(h('tr', null, h('th', null, l), ...tds));
        return [k, tds];
      });
      table.prepend(h('tr', null, h('th'), h('th', null, '横'), h('th', null, '縦'), h('th', null, '合計')));
      const upd = h('div', { class: 'hint' });
      UI.bind(table, () => {
        const st = ST();
        for (const [k, tds] of rows) {
          tds[0].textContent = fmt((st.h || {})[k]);
          tds[1].textContent = fmt((st.v || {})[k]);
          tds[2].textContent = fmt((st.total || {})[k]);
        }
        upd.textContent = st.updatedAt ? `最終更新 ${new Date(st.updatedAt).toLocaleTimeString('ja-JP')}` : 'まだ取得していません';
      });
      root.append(
        h('h3', { class: 'h' }, '取得した数値'), err, table, upd,
        h('p', { class: 'hint' }, 'チャンネル登録者数は YouTube の仕様で上3桁に丸められた値です(5分ごとに更新)。同じチャンネルの横・縦は二重に数えません。'),
        h('div', { class: 'row', style: { marginTop: '8px' } },
          UI.button('数値パネルを今すぐ連動にする', () => ADM.send('youtube:linkPanels'), 'small'),
          UI.button('数値をゼロに戻す', () => { if (confirm('いま付いている数値を基準にして、ここからの増加分だけを表示します。よろしいですか?(登録者数はそのまま)')) ADM.send('youtube:resetStats'); }, 'small')),
        h('p', { class: 'hint' }, 'URLを登録すると、その動画にすでに付いている高評価・視聴回数などをそのまま表示します(取得を開始する前でも1回取得します)。「数値をゼロに戻す」を押したときだけ、その時点からの増加分を表示します。チャンネル登録者数はゼロになりません。'),
        h('p', { class: 'hint' }, '「取得を開始」を押すと、ラベルが「いいね」「コメント」「登録者」などの数値パネルは自動で YouTube 連動になります(一度連動にすれば、次の配信でもそのままです)。ボタンは、取得中に数値パネルを足したときなど、すぐ連動させたい場合に使います。パネルの「数値の取得」で「手入力」を選んだものは、自動では連動しません。'));
    },
  });
})();
