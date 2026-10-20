/* リッチテキスト:行ごとに大きさ・色・強調・行頭記号(▶ ★ □ ✔ 1.)を変えられる */
(function () {
  'use strict';
  const { esc } = OV.util;
  const SIZES = { s: 0.8, m: 1, l: 1.3, xl: 1.7 };
  const MARKS = { bullet: '▶', star: '★', check: '□', done: '✔', heart: '♥', arrow: '→' };
  const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '');

  // 文中の **強調** と ==マーカー== を飾る(それ以外の記号はそのまま表示)
  OV.richInline = (text) => esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong class="rt-em">$1</strong>')
    .replace(/==(.+?)==/g, '<mark class="rt-mk">$1</mark>');

  /** 表示する内容の種類:goal(今日の目標)/ purpose(ゲーム全体の目的)/ custom(このパネルだけ)。
   *  以前の版の linkGame(true = 連動)も読めるようにしておく */
  OV.richKind = (d) => (d && ['goal', 'purpose', 'custom'].includes(d.source) ? d.source : (d && d.linkGame === false ? 'custom' : 'goal'));
  // ゲームの設定のどの項目に保存されているか
  OV.RICH_KEYS = { goal: ['objectiveTitle', 'objective'], purpose: ['purposeTitle', 'purpose'] };
  /** パネルが表示する行と見出し(連動していれば、ゲームの「今日の目標」または「ゲーム全体の目的」) */
  OV.richSource = (d, S) => {
    const g = (S || OV.state).game || {};
    const k = OV.RICH_KEYS[OV.richKind(d)];
    return k
      ? { title: g[k[0]] || '', lines: Array.isArray(g[k[1]]) ? g[k[1]] : [] }
      : { title: d.title || '', lines: Array.isArray(d.lines) ? d.lines : [] };
  };

  OV.registerPanelType('richText', {
    label: 'リッチテキスト(目的・目標など)',
    sizeLabels: { headingSize: '見出し', bodySize: '本文(「中」の大きさ)', numberSize: '(未使用)' },
    deps: (S, p) => {
      const k = OV.RICH_KEYS[OV.richKind(p && p.data)];
      return k && S.game ? [S.game[k[0]], S.game[k[1]]] : null;
    },
    render(el, p) {
      const d = p.data || {};
      const src = OV.richSource(d);
      const accent = safeColor(d.accent) || '#ffd84a';
      let html = '';
      if (d.showTitle !== false && src.title) html += `<div class="ov-h rt-title" style="text-align:${esc(d.titleAlign || 'left')}">${OV.richInline(src.title)}</div>`;
      html += `<div class="rt-body" style="--rt-accent:${accent};--rt-accent-a:${OV.util.hexToRgba(accent, 0.55)}">`;
      let n = 0;
      for (const ln of src.lines) {
        if (!ln) continue;
        const text = String(ln.text || '');
        const style = ln.style || 'plain';
        if (!text.trim()) { html += '<div class="rt-gap"></div>'; continue; }
        const sz = SIZES[ln.size] || 1;
        const color = safeColor(ln.color);
        const align = ln.align || d.align || 'left';
        let mark = '';
        if (style === 'number') mark = `${++n}.`;
        else if (MARKS[style]) mark = MARKS[style];
        const css = [`--rt-sz:${style === 'heading' && !ln.size ? 1.3 : sz}`, color ? `color:${color}` : '', `justify-content:${align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'}`, `text-align:${align}`].filter(Boolean).join(';');
        html += `<div class="rt-line st-${esc(style)} em-${esc(ln.emph || 'none')}" style="${esc(css)}">${mark ? `<span class="rt-mark" aria-hidden="true">${mark}</span>` : ''}<span class="rt-tx">${OV.richInline(text)}</span></div>`;
      }
      html += '</div>';
      el.innerHTML = html;
    },
  });
})();
