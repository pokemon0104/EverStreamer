/* テキストパネル:見出し+本文(行頭が「-」「・」「*」の行は箇条書き) */
(function () {
  'use strict';
  const { esc } = OV.util;
  const BULLET_RE = /^\s*(?:[-*・▶●◆★]|•)\s*(.*)$/;

  OV.registerPanelType('text', {
    label: 'テキスト',
    render(el, p) {
      const d = p.data || {};
      const mode = d.bulletMode || 'auto';
      const lines = String(d.body || '').split(/\r?\n/);
      let html = '';
      if (d.showTitle !== false && d.title) {
        html += `<div class="ov-h tf-title" style="text-align:${esc(d.titleAlign || 'left')}">${esc(d.title)}</div>`;
      }
      html += `<div class="tf-body" style="text-align:${esc(d.align || 'left')}">`;
      let inList = false;
      for (const raw of lines) {
        const m = BULLET_RE.exec(raw);
        const isBullet = mode === 'all' ? raw.trim() !== '' : mode === 'none' ? false : !!m;
        if (isBullet) {
          const text = m ? m[1] : raw.trim();
          if (!inList) { html += '<ul class="tf-list">'; inList = true; }
          html += `<li><span class="tf-mark" aria-hidden="true">${esc(d.bullet || '・')}</span><span class="tf-li">${esc(text)}</span></li>`;
        } else {
          if (inList) { html += '</ul>'; inList = false; }
          html += raw.trim() === '' ? '<div class="tf-gap"></div>' : `<p class="tf-p">${esc(raw)}</p>`;
        }
      }
      if (inList) html += '</ul>';
      html += '</div>';
      el.innerHTML = html;
    },
  });
})();
