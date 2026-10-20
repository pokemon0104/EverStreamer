'use strict';
// リッチテキスト:行ごとに大きさ・色・強調・行頭記号を変えられる文字のパネル(「ゲーム全体の目的」「今日の目標」など)。
// 内容を「今日の目標」「ゲーム全体の目的」にすると、ゲームの設定(ゲームプロファイル)に保存され、横画面・縦画面で共通になる。
const { isPlainObject } = require('../../core/util');

const KEYS = { goal: ['objectiveTitle', 'objective'], purpose: ['purposeTitle', 'purpose'] };
const KIND_NAME = { goal: '今日の目標', purpose: 'ゲーム全体の目的' };

// テキストパネルの本文(「- 」で箇条書き)を、リッチテキストの行にする
function bodyToLines(body) {
  return String(body || '').split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (!t) return { text: '' };
    const m = /^[-・▶*]\s*(.*)$/.exec(t);
    return m ? { text: m[1], size: 'm', style: 'bullet' } : { text: t, size: 'm', style: 'plain' };
  });
}

module.exports = {
  order: 31,
  namespace: 'richText',
  handlers: {
    // テキストパネル(以前の「今日の目的」など)を、目的・目標と連動するリッチテキストのパネルに変える。
    // adopt = true なら、そのパネルの内容を、共通の目的・目標として保存する
    convert({ id, kind, adopt }, ctx) {
      if (!KEYS[kind]) return;
      const p = ctx.state.panels.find((x) => x.id === id);
      if (!p || (p.type !== 'text' && p.type !== 'richText')) return;
      const d = isPlainObject(p.data) ? p.data : {};
      const title = d.title || KIND_NAME[kind];
      const lines = p.type === 'text' ? bodyToLines(d.body) : (Array.isArray(d.lines) ? d.lines : []);
      if (adopt) {
        const g = ctx.state.game;
        g[KEYS[kind][0]] = title;
        g[KEYS[kind][1]] = JSON.parse(JSON.stringify(lines));
        ctx.commit('game');
        const prof = g.profileId ? (ctx.state.gameProfiles || []).find((x) => x.id === g.profileId) : null;
        if (prof) { prof[KEYS[kind][0]] = title; prof[KEYS[kind][1]] = JSON.parse(JSON.stringify(lines)); ctx.commit('gameProfiles'); }
      }
      p.type = 'richText';
      p.data = {
        source: kind, linkGame: true,
        showTitle: d.showTitle !== false, titleAlign: d.titleAlign || 'left', align: d.align || 'left', accent: d.accent || '#ffd84a',
        title, lines,
      };
      ctx.commit('panels');
      ctx.toast(`「${p.name}」を「${KIND_NAME[kind]}」に連動しました(横・縦で共通)`);
    },
  },
  panelTypes: {
    richText: {
      label: 'リッチテキスト(目的・目標など)',
      defaults: () => ({
        name: 'リッチテキスト',
        styleId: 'tpl',
        look: { headingSize: 30, bodySize: 26 },
        data: {
          // 表示する内容は data.source で決める:goal = ゲームの「今日の目標」/ purpose = 「ゲーム全体の目的」/ custom = このパネルだけ。
          // source がない古いパネルは、linkGame(true = 今日の目標 / false = このパネルだけ)で判断する。
          // goal と purpose はゲームの設定に保存され、横画面・縦画面で同じ内容になる(プロファイルと連動)
          linkGame: true,
          title: '今日の目標',
          showTitle: true,
          titleAlign: 'left',
          align: 'left',
          accent: '#ffd84a', // **強調** と ==マーカー== の色
          lines: [
            { text: 'ボスを倒すまで進める', size: 'l', style: 'bullet', emph: 'bold' },
            { text: '**ノーダメージ** に挑戦', size: 'm', style: 'star' },
          ],
        },
      }),
    },
  },
};
