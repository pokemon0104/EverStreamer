/* リッチテキストの内容編集:1行ずつ、大きさ・行頭記号・強調・色を選ぶ */
(function () {
  'use strict';
  const { h } = UI;
  const SIZES = [['s', '小'], ['m', '中'], ['l', '大'], ['xl', '特大']];
  const STYLES = [['plain', '記号なし'], ['bullet', '▶ 箇条書き'], ['star', '★'], ['heart', '♥'], ['arrow', '→'], ['number', '1. 番号'], ['check', '□ やること'], ['done', '✔ 済み(線を引く)'], ['heading', '見出し']];
  const EMPHS = [['none', '強調なし'], ['bold', '太字'], ['marker', 'マーカー'], ['glow', '光る'], ['outline', '縁取り'], ['blink', '点滅']];
  const COLORS = ['', '#ffffff', '#ffd84a', '#ff6b6b', '#4fd1ff', '#7dff6b', '#c47dff', '#ff9a3c'];

  // まとめて入力:「# 見出し」「- 箇条書き」「* ★」「[ ] やること」「[x] 済み」「1. 番号」、行頭「!!」で特大・「!」で大
  function parseBulk(text) {
    return String(text || '').split(/\r?\n/).map((raw) => {
      let t = raw.trim();
      if (!t) return { text: '' };
      let size = 'm';
      if (t.startsWith('!!')) { size = 'xl'; t = t.slice(2).trim(); } else if (t.startsWith('!')) { size = 'l'; t = t.slice(1).trim(); }
      let style = 'plain';
      let m;
      if ((m = /^#\s*(.*)$/.exec(t))) { style = 'heading'; t = m[1]; if (size === 'm') size = 'l'; }
      else if ((m = /^\[\s*[xX✔]\s*\]\s*(.*)$/.exec(t))) { style = 'done'; t = m[1]; }
      else if ((m = /^\[\s*\]\s*(.*)$/.exec(t))) { style = 'check'; t = m[1]; }
      else if ((m = /^\d+[.)]\s*(.*)$/.exec(t))) { style = 'number'; t = m[1]; }
      else if ((m = /^[*★]\s*(.*)$/.exec(t)) && !t.startsWith('**')) { style = 'star'; t = m[1]; }
      else if ((m = /^[-・▶]\s*(.*)$/.exec(t))) { style = 'bullet'; t = m[1]; }
      return { text: t, size, style };
    });
  }
  function toBulk(lines) {
    let n = 0;
    return (lines || []).map((l) => {
      if (!l || !String(l.text || '').trim()) return '';
      const pre = l.size === 'xl' ? '!! ' : l.size === 'l' && l.style !== 'heading' ? '! ' : '';
      const mk = { heading: '# ', bullet: '- ', star: '* ', check: '[ ] ', done: '[x] ', number: `${++n}. ` }[l.style] || '';
      return `${pre}${mk}${l.text}`;
    }).join('\n');
  }

  /**
   * 見出しと行の編集欄(リッチテキストのパネルと、ゲームタブで共通)。
   * o: { getTitle, setTitle, getLines, setLines, key }  行の数が変わると、自動で作り直す
   */
  ADM.richEditor = function (o) {
    const wrap = h('div', { class: 'rt-editor' });
    let built = -1;
    const lines = () => (o.getLines() || []).map((x) => ({ ...x }));
    const setLine = (i, k, v) => { const a = lines(); if (!a[i]) return; a[i][k] = v; o.setLines(a); };
    const move = (i, d) => { const a = lines(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; o.setLines(a); };
    function build() {
      wrap.textContent = '';
      built = lines().length;
      wrap.append(UI.text({ label: '見出し', get: o.getTitle, set: o.setTitle }), h('h3', { class: 'h' }, '行(上から順に表示)'));
      for (let i = 0; i < built; i++) {
        const L = () => lines()[i] || {};
        const lk = (k, d) => ({ get: () => L()[k] || d, set: (v) => setLine(i, k, v) });
        const swatches = h('div', { class: 'rt-sw' }, ...COLORS.map((c) => {
          const b = h('button', { type: 'button', class: `rt-swb${c ? '' : ' none'}`, title: c || '色なし(パネルの文字色)', style: c ? { background: c } : null, onclick: () => setLine(i, 'color', c) });
          b.dataset.c = c;
          return b;
        }));
        UI.bind(swatches, () => [...swatches.children].forEach((b) => b.classList.toggle('on', (L().color || '') === b.dataset.c)));
        wrap.append(h('div', { class: 'rt-row' },
          h('div', { class: 'rt-row-top' },
            h('span', { class: 'rt-no' }, `${i + 1}`),
            UI.text({ placeholder: '文字(**強調** や ==マーカー== も使えます)', ...lk('text', '') }),
            UI.button('↑', () => move(i, -1), 'small'),
            UI.button('↓', () => move(i, 1), 'small'),
            UI.button('×', () => { const a = lines(); a.splice(i, 1); o.setLines(a); }, 'small danger')),
          h('div', { class: 'rt-row-opts' },
            UI.select({ options: SIZES, ...lk('size', 'm') }),
            UI.select({ options: STYLES, ...lk('style', 'plain') }),
            UI.select({ options: EMPHS, ...lk('emph', 'none') }),
            swatches)));
      }
      wrap.append(
        h('div', { class: 'row' },
          UI.button('+ 行を追加', () => o.setLines([...lines(), { text: '', size: 'm', style: 'bullet' }]), 'primary small'),
          UI.button('空き行を追加', () => o.setLines([...lines(), { text: '' }]), 'small')),
        h('p', { class: 'hint' }, '文の一部だけ目立たせたいときは、**ここ** で強調の色・太字、==ここ== でマーカーになります。'));
      // まとめて入力
      let draft = null;
      const ta = UI.textarea({ rows: 6, placeholder: '# 見出し\n!! 特大の行\n- 箇条書き\n* 星の行\n[ ] やること\n[x] 済んだこと', get: () => (draft == null ? toBulk(lines()) : draft), set: (v) => { draft = v; } });
      const bulkId = `rt-bulk${o.key ? `-${o.key}` : ''}`;
      UI.setDefaultOpen(bulkId, false);
      wrap.append(UI.section(bulkId, 'まとめて入力(テキストから作る)', ta,
        h('p', { class: 'hint' }, '行頭の記号:「# 」見出し、「- 」箇条書き、「* 」★、「[ ] 」やること、「[x] 」済み、「1. 」番号。行頭に「!」で大、「!!」で特大。'),
        h('div', { class: 'row end' }, UI.button('この内容で置き換える', () => {
          if (draft == null) return ADM.toast('先に内容を書き換えてください', 'warn');
          o.setLines(parseBulk(draft));
          draft = null;
        }, 'primary small'))));
    }
    build();
    // 行の数が変わったら作り直す(行の追加・削除・まとめて入力)
    return UI.bind(wrap, () => { if (lines().length !== built) build(); });
  };

  const KIND_NAME = { goal: '今日の目標', purpose: 'ゲーム全体の目的', custom: 'このパネルだけ' };
  ADM.RICH_KIND_NAME = KIND_NAME;

  /** 自由入力のパネルを、ゲームの「今日の目標」「ゲーム全体の目的」に連動させる(canvas: 'h' / 'v') */
  ADM.linkRichPanel = function (p, kind, canvas) {
    const d = p.data || {};
    const keys = OV.RICH_KEYS[kind];
    const g = OV.state.game || {};
    const text = (arr) => JSON.stringify((arr || []).filter((l) => l && String(l.text || '').trim()).map((l) => String(l.text).trim()));
    const own = p.type === 'text' ? String(d.body || '').split(/\r?\n/).filter((x) => x.trim()).map((x) => ({ text: x.replace(/^[-・▶*]\s*/, '') })) : (d.lines || []);
    const differs = own.length && text(own) !== text(g[keys[1]]);
    const adopt = !!(differs && confirm(`このパネルの内容で、共通の「${KIND_NAME[kind]}」を置き換えますか?\n\nOK … このパネルの内容を共通の「${KIND_NAME[kind]}」にする\nキャンセル … このパネルの内容は使わず、共通の内容を表示する`));
    const payload = { id: p.id, kind, adopt };
    if ((canvas || OV.canvas) === 'v') payload.canvas = 'v';
    ADM.hub.send('richText:convert', payload);
  };
  // 連動できるパネル:リッチテキスト、または名前・見出しに「目的」「目標」が入ったテキストパネル
  ADM.isGoalLike = (p) => p.type === 'richText' || (p.type === 'text' && /目的|目標/.test(`${p.name} ${(p.data || {}).title || ''}`));

  ADM.registerInspector('richText', {
    title: 'リッチテキストの内容',
    sig: (p) => JSON.stringify([OV.richKind(p.data || {})]),
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const setD = (k) => (v) => ADM.patchPanel(id, { data: { [k]: v } });
      const kind = () => OV.richKind(D());
      const keys = () => OV.RICH_KEYS[kind()];

      root.append(
        UI.seg({ label: '表示する内容', options: [['goal', '今日の目標'], ['purpose', 'ゲーム全体の目的'], ['custom', 'このパネルだけ']], get: kind, set: (v) => {
          if (v !== 'custom' && kind() === 'custom') ADM.linkRichPanel(ADM.panel(id), v, OV.canvas);
          else if (v === 'custom') ADM.patchPanel(id, { data: { source: 'custom', linkGame: false, title: OV.richSource(D()).title, lines: OV.richSource(D()).lines.map((x) => ({ ...x })) } });
          else ADM.patchPanel(id, { data: { source: v, linkGame: v !== 'custom' } });
        } }),
        UI.when(() => kind() !== 'custom', h('p', { class: 'hint' }, '内容はゲームの設定に保存され、横画面・縦画面で同じ種類のパネルすべてに反映されます。ゲームプロファイルにも自動で保存されるので、ゲームを切り替えて戻ると引き継がれます(ゲームタブでも編集できます)。')),
        UI.when(() => kind() === 'custom', h('div', { class: 'note-box' },
          h('div', null, 'このパネルの内容は、この画面だけのものです。横画面・縦画面で同じ内容にするには連動してください。'),
          h('div', { class: 'row', style: { marginTop: '6px' } },
            UI.button('今日の目標に連動', () => ADM.linkRichPanel(ADM.panel(id), 'goal', OV.canvas), 'small primary'),
            UI.button('ゲーム全体の目的に連動', () => ADM.linkRichPanel(ADM.panel(id), 'purpose', OV.canvas), 'small')))),
        UI.toggle({ label: '見出しを表示', get: () => D().showTitle !== false, set: setD('showTitle') }),
        UI.seg({ label: '見出しの位置', options: [['left', '左'], ['center', '中央'], ['right', '右']], get: () => D().titleAlign || 'left', set: setD('titleAlign') }),
        UI.seg({ label: '本文の位置', options: [['left', '左'], ['center', '中央'], ['right', '右']], get: () => D().align || 'left', set: setD('align') }),
        UI.color({ label: '強調の色', get: () => D().accent, set: setD('accent') }),
        ADM.richEditor({
          key: id,
          getTitle: () => OV.richSource(D()).title,
          setTitle: (v) => (keys() ? ADM.patchGame({ [keys()[0]]: v }) : ADM.patchPanel(id, { data: { title: v } })),
          getLines: () => OV.richSource(D()).lines,
          setLines: (arr) => (keys() ? ADM.patchGame({ [keys()[1]]: arr }) : ADM.patchPanel(id, { data: { lines: arr } })),
        }));
    },
  });

})();
