/* 投票・アイデア募集・カウンターの描画 */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const fmt = (n) => Number(n || 0).toLocaleString('ja-JP');

  // ---------- 投票 ----------
  OV.registerPanelType('poll', {
    label: '投票',
    sizeLabels: { headingSize: 'タイトル', bodySize: '候補・票数', numberSize: '(未使用)' },
    deps: (S, p) => (S.ctState ? S.ctState[p.id] || null : null),
    render(el, p) {
      const d = p.data || {};
      const s = (OV.state.ctState || {})[p.id] || { votes: {} };
      const cands = (Array.isArray(d.candidates) ? d.candidates : []).map((c, i) => ({ ...c, n: Number(s.votes[c.id]) || 0, i }));
      const total = cands.reduce((a, c) => a + c.n, 0);
      const list = (d.sortByVotes !== false ? [...cands].sort((a, b) => b.n - a.n || a.i - b.i) : cands).slice(0, clamp(Number(d.showTop) || 4, 1, 12));
      const prev = el.__poll || { pct: {}, n: {} };
      const rows = list.map((c, idx) => {
        const pct = total ? (c.n / total) * 100 : 0;
        return `<div class="pl-row${c.n > (prev.n[c.id] || 0) && el.__poll ? ' bump' : ''}${idx === 0 && c.n > 0 ? ' lead' : ''}" data-id="${esc(c.id)}" data-pct="${pct.toFixed(2)}">
          <div class="pl-head"><span class="pl-rank">#${idx + 1}</span><span class="pl-name">${esc(c.name)}</span><span class="pl-n">${OV.t(`${fmt(c.n)}票`)}${d.showPercent !== false ? `<small> ${Math.round(pct)}%</small>` : ''}</span></div>
          <div class="pl-track"><i class="pl-fill" style="width:${(prev.pct[c.id] != null ? prev.pct[c.id] : pct).toFixed(2)}%"></i></div></div>`;
      }).join('');
      const closed = d.active === false ? `<span class="pl-closed">${OV.t('受付終了')}</span>` : '';
      el.innerHTML = `<div class="ov-h pl-title"><span>${esc(d.title || OV.t('投票'))}</span><span class="pl-total">${closed}${OV.t(`${fmt(total)}票`)}</span></div>${rows || `<div class="pl-empty">${OV.t('候補を登録してください')}</div>`}${d.hint ? `<div class="pl-hint">${esc(d.hint)}</div>` : ''}`;
      // バーを、前の長さから新しい長さへ伸ばす
      const next = { pct: {}, n: {} };
      list.forEach((c) => { next.n[c.id] = c.n; });
      el.querySelectorAll('.pl-row').forEach((row) => {
        const pct = Number(row.dataset.pct);
        const fill = row.querySelector('.pl-fill');
        next.pct[row.dataset.id] = pct;
        if (prev.pct[row.dataset.id] != null && prev.pct[row.dataset.id] !== pct) {
          void fill.offsetWidth;
          fill.style.transition = 'width .7s cubic-bezier(.2,.8,.2,1)';
          fill.style.width = `${pct}%`;
        } else fill.style.width = `${pct}%`;
      });
      el.__poll = next;
    },
  });

  // ---------- アイデア募集 ----------
  OV.registerPanelType('ideas', {
    label: 'アイデア募集',
    sizeLabels: { headingSize: 'タイトル', bodySize: 'アイデア', numberSize: '(未使用)' },
    deps: (S, p) => (S.ctState ? S.ctState[p.id] || null : null),
    render(el, p) {
      const d = p.data || {};
      const s = (OV.state.ctState || {})[p.id] || { ideas: [] };
      const items = (s.ideas || []).slice(-clamp(Number(d.showCount) || 4, 1, 12)).reverse();
      const seen = el.__ideas;
      const html = items.length ? items.map((it) => `<div class="id-item${seen && !seen.has(it.id) ? ' new' : ''}"><span class="id-text">${esc(it.text)}</span>${d.showUser !== false && it.user ? `<span class="id-user">by ${esc(it.user)}</span>` : ''}</div>`).join('')
        : `<div class="id-empty">${esc(d.hint || (d.prefix ? OV.t(`「${d.prefix} ○○」でアイデアを書き込もう`) : OV.t('チャットでアイデアを募集中…')))}</div>`;
      el.innerHTML = `<div class="ov-h id-title"><span>${esc(d.title || OV.t('アイデア募集'))}</span><span class="id-count">${OV.t(`${fmt((s.ideas || []).length)}件`)}${d.active === false ? ` ${OV.t('受付終了')}` : ''}</span></div><div class="id-list">${html}</div>`;
      el.__ideas = new Set(items.map((x) => x.id));
    },
  });

  // ---------- カウンター ----------
  OV.registerPanelType('counter', {
    label: 'カウンター',
    sizeLabels: { headingSize: 'タイトル', bodySize: '名前', numberSize: '数字' },
    render(el, p) {
      const d = p.data || {};
      const list = Array.isArray(d.counters) ? d.counters : [];
      const prev = el.__counters;
      const cards = list.map((c, i) => `<div class="ct-card${prev && Number(c.value) > (prev[i] || 0) ? ' up' : ''}"><div class="ct-name">${esc(c.name)}</div><div class="ct-val">${fmt(c.value)}</div></div>`).join('');
      el.innerHTML = `${d.showTitle !== false && d.title ? `<div class="ov-h ct-title">${esc(d.title)}</div>` : ''}<div class="ct-grid ${d.layout === 'column' ? 'col' : 'row'}">${cards}</div>`;
      el.__counters = list.map((c) => Number(c.value) || 0);
    },
  });
})();
