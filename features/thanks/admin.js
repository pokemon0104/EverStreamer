/* 感謝タブと、上部バーの「感謝を表示」ボタン */
(function () {
  'use strict';
  const { h } = UI;
  const T = () => OV.state.thanks || {};
  const SH = () => OV.state.thanksShow || {};
  const tk = (k) => ({ get: () => T()[k], set: (v) => ADM.send('thanks:update', { patch: { [k]: v } }) });

  // 上部バー:1クリックでエンディングセットを再生(表示中は「消す」になる)
  ADM.registerTopbar({
    order: 30,
    build(root) {
      const btn = h('button', { type: 'button', class: 'btn small thanks-btn' });
      let armed = 0;
      btn.addEventListener('click', () => {
        if (SH().active) { ADM.send('thanks:hide'); return; }
        if (T().confirmTwice && Date.now() - armed > 3000) {
          armed = Date.now();
          btn.textContent = 'もう一度押すと表示';
          btn.classList.add('armed');
          setTimeout(() => { armed = 0; refresh(); }, 3000);
          return;
        }
        armed = 0;
        ADM.send('thanks:playSet');
      });
      const refresh = () => {
        if (armed && Date.now() - armed < 3000) return;
        btn.classList.remove('armed');
        btn.textContent = SH().active ? '■ 感謝を消す' : '🙏 感謝を表示';
        btn.classList.toggle('on', !!SH().active);
      };
      UI.bind(btn, refresh);
      root.append(btn);
    },
  });

  function messageCard(m, i, total) {
    const id = m.id;
    const M = () => (T().messages || []).find((x) => x.id === id) || {};
    const ta = h('textarea', { rows: 2 });
    ta.value = m.text;
    ta.addEventListener('input', () => ADM.send('thanks:updateMessage', { id, patch: { text: ta.value } }));
    UI.bind(ta, () => { if (document.activeElement !== ta) ta.value = M().text || ''; });
    const looks = [['tpl', 'テンプレートに合わせる'], ...(OV.catalogs.looks || []).map((l) => [l.id, l.name])];
    return h('div', { class: 'hw-card' },
      h('div', { class: 'top' },
        h('span', { class: 'muted' }, `${i + 1}`),
        UI.toggle({ label: 'セットに入れる', get: () => M().inSet, set: (v) => ADM.send('thanks:updateMessage', { id, patch: { inSet: v } }) }),
        h('span', { class: 'sp' }),
        UI.button('↑', () => ADM.send('thanks:moveMessage', { id, dir: -1 }), 'small'),
        UI.button('↓', () => ADM.send('thanks:moveMessage', { id, dir: 1 }), 'small'),
        UI.button('削除', () => { if (confirm('このメッセージを削除しますか?')) ADM.send('thanks:removeMessage', { id }); }, 'small danger')),
      ta,
      UI.select({ label: '文字の見た目', options: looks, get: () => M().lookId, set: (v) => ADM.send('thanks:updateMessage', { id, patch: { lookId: v } }) }),
      h('div', { class: 'row end' }, UI.button('これだけ表示', () => ADM.send('thanks:show', { id }), 'small')));
  }

  ADM.registerTab({
    id: 'thanks',
    label: '感謝',
    order: 38,
    sig: () => JSON.stringify([(T().messages || []).map((m) => m.id), T().token]),
    build(root) {
      if (ADM.screenRow) root.append(ADM.screenRow('thanks', '感謝メッセージ'));
      const status = h('div', { class: 'hint' });
      UI.bind(status, () => {
        const s = SH();
        status.textContent = s.active ? `表示中(${(s.index || 0) + 1} / ${(s.items || []).length})` : '表示していません';
      });
      root.append(
        h('div', { class: 'row' },
          UI.button('▶ エンディングセットを再生', () => ADM.send('thanks:playSet'), 'primary'),
          UI.button('消す', () => ADM.send('thanks:hide'))),
        status,
        h('p', { class: 'hint' }, '「セットに入れる」がオンのメッセージを上から順に表示し、最後に「今日の記録」(配信時間・最大同時視聴者・高評価・チャット数)を出します。上部バーの「感謝を表示」ボタンでも同じ動きです。'));

      // メッセージ
      root.append(h('h3', { class: 'h' }, 'メッセージ(改行で2行にできます)'));
      const list = T().messages || [];
      list.forEach((m, i) => root.append(messageCard(m, i, list.length)));
      const addIn = h('input', { type: 'text', placeholder: '例:おつかれさまでした!', style: { flex: 1 } });
      root.append(h('div', { class: 'row' }, addIn, UI.button('+ 追加', () => { ADM.send('thanks:addMessage', { text: addIn.value || undefined }); addIn.value = ''; }, 'primary')));

      // 表示のしかた
      root.append(
        h('h3', { class: 'h' }, '表示のしかた'),
        UI.select({ label: '登場の動き', options: [['pop', 'ポップ'], ['zoom', 'ズーム'], ['type', '1文字ずつ'], ['slide', '下からスライド'], ['shine', 'ポップ+きらっ']], ...tk('anim') }),
        UI.select({ label: 'いっしょに出す効果', options: [['none', 'なし'], ['confetti', '紙吹雪'], ['fireworks', '花火'], ['both', '紙吹雪+花火']], ...tk('effect') }),
        UI.num({ label: '1つだけの時間', min: 2, max: 60, step: 1, unit: '秒', ...tk('durationSec') }),
        UI.num({ label: 'セットの1枚', min: 2, max: 30, step: 1, unit: '秒', ...tk('setSec') }),
        UI.toggle({ label: '最後に「今日の記録」を入れる', ...tk('showStats') }),
        UI.when(() => T().showStats, UI.num({ label: '記録の時間', min: 3, max: 60, step: 1, unit: '秒', ...tk('statsSec') })),
        UI.toggle({ label: '最後の画面を消さずに残す(「消す」で消える)', ...tk('holdLast') }),
        UI.num({ label: '暗幕の濃さ', min: 0, max: 0.95, step: 0.05, ...tk('dim') }),
        UI.toggle({ label: '表示中はサイドバーを隠す', ...tk('hideSidebar') }),
        UI.toggle({ label: 'アバターの枠を避けて表示する', ...tk('avoidAvatar') }),
        UI.toggle({ label: '2回押さないと表示しない(誤操作防止)', ...tk('confirmTwice') }));

      // 呼び出しURL
      const base = `${location.origin}/api/thanks`;
      const urls = [
        ['エンディングセットを再生', `${base}/play?token=${T().token}`],
        ['1番目のメッセージを表示', `${base}/show?n=1&token=${T().token}`],
        ['消す', `${base}/hide?token=${T().token}`],
      ];
      root.append(h('h3', { class: 'h' }, 'Stream Deck・スマホから押す'),
        h('p', { class: 'hint' }, 'このURLを開く(アクセスする)と表示できます。Stream Deck の「Webリクエスト」系のプラグインなどに登録してください。このPCの中からだけ使えます。'));
      for (const [label, url] of urls) {
        const input = h('input', { type: 'text', value: url, readonly: true, style: { flex: 1, fontSize: '11px' } });
        root.append(h('div', { class: 'f-l', style: { marginTop: '6px' } }, label),
          h('div', { class: 'row' }, input, UI.button('コピー', () => { input.select(); navigator.clipboard && navigator.clipboard.writeText(url); ADM.toast('コピーしました'); }, 'small')));
      }
      root.append(h('div', { class: 'row end', style: { marginTop: '6px' } }, UI.button('URLを作り直す', () => { if (confirm('今のURLは使えなくなります。作り直しますか?')) ADM.send('thanks:newToken'); }, 'small')));
    },
  });
})();
