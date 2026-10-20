/* コメント欄:ダミー、または YouTube のライブチャット(横型・縦型・両方)。新しいコメントが下に積まれ、古いものは上に消える */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  // 以前の設定(source がない)は、ダミー表示のまま
  const sourceOf = (d) => d.source || (d.dummy === false ? 'none' : 'dummy');

  // ---- 共通の部品(ほかの機能でも使える) ----
  const ic = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  // バッジ(各サービスのロゴではなく、汎用の図柄)
  const BADGE = {
    owner: ['配信者', ic('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor"/>')],
    moderator: ['モデレーター', ic('<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/>')],
    member: ['メンバー', ic('<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.6L12 17l-5.9 3.4 1.3-6.6L2.5 9.3l6.6-.8z" fill="currentColor"/>')],
    vip: ['VIP', ic('<path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor"/>')],
    verified: ['認証済み', ic('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7 12.5l3 3 7-7" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')],
  };
  OV.chatBadge = (b) => (BADGE[b] ? `<i class="cb-badge b-${b}" title="${esc(OV.t(BADGE[b][0]))}">${BADGE[b][1]}</i>` : '');
  // YouTube / Twitch の印(ロゴは使わず、文字の略号)
  OV.chatPlatformIcon = (p) => {
    if (p === 'twitch') return `<i class="cb-plat p-twitch" title="Twitch">TW</i>`;
    if (p === 'youtube') return `<i class="cb-plat p-youtube" title="YouTube">YT</i>`;
    return '';
  };
  /** 本文(Twitch のエモートは画像、YouTube の :名前: はそのまま) */
  OV.chatTextHtml = (c) => {
    if (!Array.isArray(c.parts) || !c.parts.length) return esc(c.text || '');
    return c.parts.map((x) => (x.t === 'emote' && /^https:\/\/static-cdn\.jtvnw\.net\//.test(x.url) ? `<img class="cb-emote" src="${esc(x.url)}" alt="${esc(x.alt || '')}">` : esc(x.v || x.alt || ''))).join('');
  };

  OV.registerPanelType('comments', {
    label: 'コメント欄',
    noFit: true, // 量が多いときは文字を縮めず、古いコメントを隠す
    // 上で欠けてしまう古いコメントは、まるごと隠す(半分だけ見えないように)
    layoutFit(el) {
      const list = el.querySelector('.cb-list');
      if (!list) return;
      const items = [...list.children];
      items.forEach((x) => { x.style.display = ''; });
      const top = list.getBoundingClientRect().top;
      for (let i = 0; i < items.length - 1 && items[i].getBoundingClientRect().top < top - 1; i++) items[i].style.display = 'none';
    },
    deps: (S, p) => {
      const src = sourceOf((p && p.data) || {});
      const log = S.chatLog || {};
      return src === 'h' || src === 'v' ? log[src] : src === 'all' ? [log.h, log.v] : null;
    },
    render(el, p) {
      const d = p.data || {};
      const src = sourceOf(d);
      let items = [];
      if (src === 'dummy') {
        items = String(d.sample || '').split(/\r?\n/).filter((l) => l.trim()).map((l) => {
          const i = l.search(/[::]/);
          return i > 0 ? { name: l.slice(0, i).trim(), text: l.slice(i + 1).trim() } : { name: '', text: l.trim() };
        });
      } else if (src !== 'none') {
        const log = OV.state.chatLog || {};
        const tag = (side) => (x) => ({ ...x, side });
        items = src === 'all'
          ? [...(log.h || []).map(tag('h')), ...(log.v || []).map(tag('v'))].sort((a, b) => (a.at || 0) - (b.at || 0))
          : (log[src] || []).map(tag(src));
        items = items.slice(-clamp(Number(d.max) || 12, 1, 60));
      }
      // 消えるまでの秒数(0 = 消さない)。時間が来たら CSS だけで消える(描き直し不要)
      const life = clamp(Number(d.life) || 0, 0, 600) * 1000;
      const now = Date.now();
      if (life && src !== 'dummy') items = items.filter((c) => !c.at || now - c.at < life);
      const mixed = new Set(items.map((c) => c.platform || 'youtube')).size > 1; // YouTube と Twitch が混ざっているときだけ印を出す
      const seen = el.__cbSeen || new Set();
      const fresh = new Set();
      let html = '';
      if (d.showTitle !== false && d.title) html += `<div class="ov-h cb-title">${esc(d.title)}</div>`;
      html += `<div class="cb-list cb-${esc(d.look || 'bubble')}">`;
      if (!items.length && src !== 'dummy' && src !== 'none' && OV.role === 'admin') {
        html += `<div class="cb-wait">${OV.t('コメントが届くと、ここに表示されます(「チャット」タブのダミーコメントで試せます)')}</div>`;
      }
      html += items.map((c, i) => {
        const key = c.id || `${c.name}:${c.text}:${i}`;
        fresh.add(key);
        const isNew = el.__cbSeen && !seen.has(key);
        const mark = src === 'all' && d.showMark !== false ? `<span class="cb-side ${c.side}">${OV.t(c.side === 'v' ? '縦(印)' : '横(印)').replace('(印)', '')}</span>` : '';
        const plat = (d.showPlatform === 'on' || ((d.showPlatform || 'auto') === 'auto' && mixed)) ? OV.chatPlatformIcon(c.platform) : '';
        const badges = d.showBadges !== false ? (c.badges || []).map(OV.chatBadge).join('') : '';
        const color = d.nameColor !== false && c.color ? ` style="color:${esc(c.color)}"` : '';
        const name = d.showName !== false && c.name ? `<span class="cb-name"${color}>${esc(c.name)}</span>` : '';
        const amt = c.amount ? `<span class="cb-amt">${esc(c.amount)}</span>` : '';
        const out = life && c.at ? ` style="animation-delay:0s,${Math.max(0, (life - (now - c.at)) / 1000).toFixed(2)}s"` : '';
        const cls = `cb-item${c.sc ? ' sc' : ''}${isNew ? ' new' : ''}${life && c.at ? ' fade' : ''}${(c.badges || []).includes('owner') ? ' owner' : ''}`;
        return `<div class="${cls}"${out}><span class="cb-head">${mark}${plat}${badges}${name}${amt}</span><span class="cb-text">${OV.chatTextHtml(c)}</span></div>`;
      }).join('');
      html += '</div>';
      el.__cbSeen = fresh;
      el.innerHTML = html;
    },
  });
})();
