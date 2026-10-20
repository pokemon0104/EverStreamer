/* 名前と SNS のパネル(アイコンは各サービスのロゴではなく、汎用の図柄) */
(function () {
  'use strict';
  const { esc } = OV.util;
  // 各サービスのロゴは使わず、文字の略号で示す(商標を避けるため)
  const mark = (t) => `<b class="sn-mk">${t}</b>`;
  OV.SNS = [
    { id: 'x', label: 'X', icon: mark('X'), at: true },
    { id: 'youtube', label: 'YouTube', icon: mark('YT') },
    { id: 'twitch', label: 'Twitch', icon: mark('TW') },
    { id: 'discord', label: 'Discord', icon: mark('DC') },
    { id: 'tiktok', label: 'TikTok', icon: mark('TT') },
    { id: 'instagram', label: 'Instagram', icon: mark('IG') },
  ];
  /** 表示用の文字(X・TikTok・Instagram は先頭に @ を付ける) */
  OV.snsText = (s, v, prefix) => {
    const t = String(v || '').trim();
    if (!t || !prefix || /^https?:/i.test(t) || t.startsWith('@')) return t;
    return ['x', 'tiktok', 'instagram'].includes(s.id) ? `@${t}` : t;
  };

  OV.registerPanelType('social', {
    label: '名前とSNS',
    sizeLabels: { headingSize: '名前', bodySize: 'SNS の文字', numberSize: '(未使用)' },
    deps: (S) => [S.profile],
    render(el, p) {
      const pr = OV.state.profile || {};
      const d = p.data || {};
      const items = (d.items || []).map((id) => OV.SNS.find((s) => s.id === id)).filter((s) => s && (pr.sns || {})[s.id]);
      const name = d.showName !== false ? String(pr.name || '') : '';
      if (!items.length && !name) {
        el.innerHTML = OV.role === 'admin'
          ? `<div class="ov-ghost peek sp-ghost">${OV.t('名前とSNS')}<small>${OV.t('(クイック設定で名前やIDを入れると表示されます)')}</small></div>`
          : '<div class="ov-ghost"></div>';
        return;
      }
      const list = items.map((s) => `<span class="sn-item sn-${s.id}"><i class="sn-ic">${s.icon}</i><span class="sn-t">${esc(OV.snsText(s, pr.sns[s.id], d.prefix !== false))}</span></span>`).join('');
      el.innerHTML = `<div class="sn-wrap sn-${d.layout === 'col' ? 'col' : 'row'}">${name ? `<div class="sn-name">${esc(name)}</div>` : ''}${list ? `<div class="sn-list">${list}</div>` : ''}</div>`;
    },
  });
})();
