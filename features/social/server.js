'use strict';
// 名前と SNS:配信者の名前・X・YouTube・Twitch・Discord などの ID(横・縦で共通)と、それを表示するパネル
const { isPlainObject } = require('../../core/util');

const KEYS = ['x', 'youtube', 'twitch', 'discord', 'tiktok', 'instagram'];
const defaults = () => ({ name: '', sns: Object.fromEntries(KEYS.map((k) => [k, ''])) });
function normalize(v) {
  const o = isPlainObject(v) ? v : {};
  const sns = isPlainObject(o.sns) ? o.sns : {};
  return {
    name: String(o.name || '').slice(0, 60),
    sns: Object.fromEntries(KEYS.map((k) => [k, String(sns[k] || '').trim().slice(0, 80)])),
  };
}

module.exports = {
  order: 15,
  namespace: 'social',
  sections: { profile: { default: defaults, normalize } },
  panelTypes: {
    social: {
      label: '名前とSNS',
      defaults: () => ({
        name: '名前とSNS',
        anim: { type: 'fade', ms: 350 },
        look: { bodySize: 20, headingSize: 24, padding: 12 },
        data: { showName: true, layout: 'row', items: [...KEYS], prefix: true },
      }),
    },
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const cur = ctx.raw.profile;
      if (patch.name !== undefined) cur.name = patch.name;
      if (isPlainObject(patch.sns)) Object.assign(cur.sns, patch.sns);
      ctx.raw.profile = normalize(cur);
      ctx.commitRaw('profile');
    },
  },
  KEYS,
};
