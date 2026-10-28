/* SNSアカウント:サービスの印+アカウント名を並べる(縦並び/横並び/1つずつ切り替え) */
(function () {
  'use strict';
  const { esc } = OV.util;

  // 印は、サービスの略号をテンプレートの色の角丸に入れたもの(各サービスのロゴや専用色は使わない)。icon を書けば自由に差し替えられる
  const C = { bg: 'var(--t-accent, #4f8cff)', fg: 'var(--t-on-accent, #ffffff)' };
  const PLATFORMS = {
    x: { name: 'X', mark: 'X', ...C },
    youtube: { name: 'YouTube', mark: 'YT', ...C },
    twitch: { name: 'Twitch', mark: 'TW', ...C },
    instagram: { name: 'Instagram', mark: 'IG', ...C },
    tiktok: { name: 'TikTok', mark: 'TT', ...C },
    bluesky: { name: 'Bluesky', mark: 'Bs', ...C },
    threads: { name: 'Threads', mark: '@', ...C },
    discord: { name: 'Discord', mark: 'DC', ...C },
    niconico: { name: 'ニコニコ', mark: 'NC', ...C },
    facebook: { name: 'Facebook', mark: 'f', ...C },
    web: { name: 'Web', mark: 'WEB', ...C },
    other: { name: '', mark: '★', ...C },
  };
  OV.snsPlatforms = PLATFORMS;

  function itemHtml(it, d) {
    const P = PLATFORMS[it.platform] || PLATFORMS.other;
    const mark = it.icon || P.mark;
    let icon = '';
    if (d.iconMode !== 'none') {
      const style = d.iconMode === 'mono'
        ? 'background:transparent;color:inherit;box-shadow:inset 0 0 0 .1em currentColor'
        : `background:${P.bg};color:${P.fg}${P.ring ? `;box-shadow:inset 0 0 0 .08em ${P.ring}` : ''}`;
      const len = [...mark].length;
      icon = `<span class="sns-ic${len >= 2 ? ' wide' : ''}" style="${esc(style)}" aria-hidden="true"><span>${esc(mark)}</span></span>`;
    }
    const service = it.label || (d.showService ? P.name : '');
    return `<div class="sns-it">${icon}<span class="sns-tx">${service ? `<span class="sns-sv">${esc(service)}</span>` : ''}<span class="sns-id">${esc(it.id || '')}</span></span></div>`;
  }

  OV.registerPanelType('sns', {
    label: 'SNSアカウント',
    sizeLabels: { headingSize: '見出し', bodySize: 'アカウント名', numberSize: '(未使用)' },
    render(el, p) {
      const d = p.data || {};
      const items = (d.items || []).filter((it) => it && it.show !== false && (it.id || it.label));
      const layout = d.layout || 'list';
      let html = '';
      if (d.showTitle !== false && d.title) html += `<div class="ov-h sns-title" style="text-align:${esc(d.align || 'left')}">${esc(d.title)}</div>`;
      if (!items.length) {
        html += '<div class="sns-empty" aria-hidden="true">アカウントを登録してください</div>';
      } else {
        const just = d.align === 'center' ? 'center' : d.align === 'right' ? 'flex-end' : 'flex-start';
        html += `<div class="sns-list l-${esc(layout)}" style="justify-content:${just};align-items:${layout === 'list' ? just : 'center'}" data-sec="${Math.max(2, Number(d.rotateSec) || 6)}">${items.map((it) => itemHtml(it, d)).join('')}</div>`;
      }
      el.innerHTML = html;
      if (layout === 'rotate') rotate(el);
    },
  });

  // 1つずつ切り替え:時刻から何番目を出すか決める(OBS とプレビューで同じものが出る)
  function rotate(root) {
    root.querySelectorAll('.sns-list.l-rotate').forEach((list) => {
      const kids = list.children;
      if (!kids.length) return;
      const sec = Number(list.dataset.sec) || 6;
      const i = Math.floor(Date.now() / (sec * 1000)) % kids.length;
      for (let k = 0; k < kids.length; k++) kids[k].classList.toggle('on', k === i);
    });
  }
  OV.onTick((stage) => rotate(stage));
})();
