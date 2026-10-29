'use strict';
// 大きな文字(枠なしで、文字だけを画面の好きな場所に大きく表示する)
const fs = require('fs');
const path = require('path');
const { watchJson, uid } = require('../../core/util');

module.exports = {
  order: 21,
  /** テキストデザインのギャラリー:デザイン一覧(config/text-designs.json)と、お気に入り・最近・マイデザイン(data) */
  init({ app, catalogs, paths, dir }) {
    const express = require('express');
    // 質感の画像:自分で足したもの(data/text-textures)・同梱のもの(features/bigText/textures)・追加パック(packs/*/textures)を自動で見つけて、質感の選択肢に加える
    const packs = require('../../core/packs');
    const userTex = path.join(paths.data, 'text-textures');
    try { fs.mkdirSync(userTex, { recursive: true }); } catch { /* 作れなくても動く */ }
    const texDirs = () => [userTex, path.join(dir, 'textures'), ...packs.list(paths.packs).map((p) => path.join(p.dir, 'textures'))];
    app.get('/text-textures/:file', (req, res) => {
      const f = String(req.params.file || '');
      if (!/^[\w.-]+\.(png|jpe?g|webp)$/i.test(f)) return res.status(404).end();
      const d = texDirs().find((x) => fs.existsSync(path.join(x, f)));
      if (!d) return res.status(404).end();
      res.set('Cache-Control', 'max-age=600');
      res.sendFile(path.join(d, f));
    });
    let designs = { types: [], categories: [], textures: [] };
    let lastSig = '';
    const scanTextures = () => {
      const out = [];
      for (const d of texDirs()) {
        let labels = {};
        try { labels = JSON.parse(fs.readFileSync(path.join(d, 'textures.json'), 'utf8')); } catch { /* ラベルなし */ }
        let names = [];
        try { names = fs.readdirSync(d); } catch { continue; }
        for (const f of names.sort()) {
          const m = /^(.+)\.(png|jpe?g|webp)$/i.exec(f);
          if (!m || out.some((x) => x.id === m[1])) continue;
          out.push({ id: m[1], name: String(labels[f] || m[1]), file: f, photo: true });
        }
      }
      return out;
    };
    /** 追加パックの text-designs.json を足す(id が重なるときは、パックの名前を前に付ける) */
    const withPacks = (base) => {
      const out = { ...base, categories: [...(base.categories || [])], themes: (base.themes || []).map((t) => ({ ...t, ids: [...(t.ids || [])] })), types: [...(base.types || [])], textures: [...(base.textures || [])] };
      const typeIds = new Set(out.types.map((t) => t.id));
      const varIds = new Set(out.types.flatMap((t) => (t.variants || []).map((v) => v.id)));
      for (const p of packs.list(paths.packs)) {
        const d = packs.readJson(path.join(p.dir, 'text-designs.json'));
        if (!d || !Array.isArray(d.types)) continue;
        const rename = {};
        for (const c of d.categories || []) if (c && c.id && !out.categories.some((x) => x.id === c.id)) out.categories.push({ ...c, pack: p.name });
        for (const t of d.types) {
          if (!t || !t.id || !Array.isArray(t.variants)) continue;
          const tid = typeIds.has(t.id) ? `${p.id}-${t.id}` : t.id;
          typeIds.add(tid);
          const variants = t.variants.filter((v) => v && v.id).map((v) => {
            const vid = varIds.has(v.id) ? `${p.id}-${v.id}` : v.id;
            varIds.add(vid); rename[v.id] = vid;
            return { ...v, id: vid };
          });
          out.types.push({ ...t, id: tid, pack: p.name, variants });
        }
        for (const th of d.themes || []) {
          if (!th || !th.id) continue;
          const ids = (th.ids || []).map((x) => rename[x] || x);
          const cur = out.themes.find((x) => x.id === th.id);
          if (cur) cur.ids.push(...ids); else out.themes.push({ ...th, ids });
        }
        for (const tx of d.textures || []) if (tx && tx.id && !out.textures.some((x) => x.id === tx.id)) out.textures.push(tx);
      }
      return out;
    };
    const publishDesigns = () => {
      const all = withPacks(designs);
      const have = new Set((all.textures || []).map((t) => t.id));
      const extra = scanTextures().filter((t) => !have.has(t.id));
      lastSig = JSON.stringify(extra);
      catalogs.set('textDesigns', { ...all, textures: [...(all.textures || []), ...extra] });
    };
    watchJson(path.join(paths.config, 'text-designs.json'), (d) => { designs = d && Array.isArray(d.types) ? d : { types: [], categories: [], textures: [] }; publishDesigns(); }, { fallback: { types: [] } });
    packs.watch(paths.packs, publishDesigns);
    setInterval(() => { // 画像を data/text-textures に入れたら、再起動しなくても選択肢に出す
      const have = new Set((designs.textures || []).map((t) => t.id));
      if (JSON.stringify(scanTextures().filter((t) => !have.has(t.id))) !== lastSig) publishDesigns();
    }, 5000).unref();
    const file = path.join(paths.data, 'text-designs-user.json');
    const read = () => {
      try {
        const d = JSON.parse(fs.readFileSync(file, 'utf8'));
        return { favorites: Array.isArray(d.favorites) ? d.favorites : [], recent: Array.isArray(d.recent) ? d.recent : [], mine: Array.isArray(d.mine) ? d.mine : [] };
      } catch { return { favorites: [], recent: [], mine: [] }; }
    };
    const publish = (u) => catalogs.set('textDesignsUser', u);
    publish(read());
    app.post('/api/text-designs/user', express.json({ limit: '2mb' }), (req, res) => {
      const b = req.body || {};
      const u = read();
      const id = String(b.id || '').slice(0, 80);
      if (b.op === 'fav') {
        u.favorites = u.favorites.filter((x) => x !== id);
        if (b.on) u.favorites.unshift(id);
      } else if (b.op === 'recent') {
        u.recent = [id, ...u.recent.filter((x) => x !== id)].slice(0, 24);
      } else if (b.op === 'save') {
        if (!b.look || typeof b.look !== 'object') return res.status(400).json({ error: '保存する設定がありません' });
        const name = String(b.name || 'マイデザイン').slice(0, 40);
        const item = { id: uid('my'), name, sample: String(b.sample || name).slice(0, 40), look: b.look, fontRef: b.fontRef || null, at: new Date().toISOString() };
        u.mine.unshift(item);
      } else if (b.op === 'rename') {
        const m = u.mine.find((x) => x.id === id);
        if (m) m.name = String(b.name || m.name).slice(0, 40);
      } else if (b.op === 'delete') {
        u.mine = u.mine.filter((x) => x.id !== id);
        u.favorites = u.favorites.filter((x) => x !== id);
        u.recent = u.recent.filter((x) => x !== id);
      } else return res.status(400).json({ error: '不明な操作です' });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(u, null, 2), 'utf8');
      publish(u);
      res.json({ ok: true });
    });
  },
  panelTypes: {
    bigText: {
      label: '大きな文字(自由配置)',
      defaults: () => ({
        name: '大きな文字',
        styleId: 'textOnly',
        placement: 'free',
        x: 160,
        y: 120,
        w: 1100,
        h: 200,
        anim: { type: 'pop', ms: 450 },
        // 枠・背景は出さない(スタイルを選ぶと、枠付きにもできる)
        look: { bgAlpha: 0, borderWidth: 0, borderStyle: 'none', insetColor: '', bevel: false, scanlines: false, shadowBlur: 0, shadowY: 0, padding: 0, borderTitle: false },
        data: {
          text: 'ここに文字',
          font: 'Dela Gothic One',
          size: 110, // px
          bold: true,
          italic: false,
          align: 'center', // left / center / right
          vertical: false, // 縦書き
          lineHeight: 1.2,
          letterSpacing: 0.04, // em
          skew: 0, // 傾き(度)
          fillType: 'solid', // solid / gradient
          color: '#ffffff',
          color2: '#ffd84a',
          angle: 180,
          stroke1: { on: true, color: '#1b1b3a', width: 6 }, // 内側の縁取り(px)
          stroke2: { on: false, color: '#ffffff', width: 6 }, // 外側の縁取り(px)
          stroke3: { on: false, color: '#000000', width: 4 }, // さらに外側の縁取り(px)
          roundStroke: true, // 縁取りの角を丸くする
          stops: null, // 3色以上のグラデーション [{color, pos(%)}]
          gloss: { on: false, strength: 1 }, // 上半分のツヤ
          texture: { id: 'none', blend: 'multiply' }, // 質感(炎・氷・大理石・金属・ラメ・ホロ・かすれ)
          accent: { on: false, fillType: 'solid', color: '#ff3030', color2: '#aa0000', angle: 180 }, // [[ ]] の部分の色
          accent2: { on: false, fillType: 'solid', color: '#2a8aff', color2: '#0040c0', angle: 180 }, // {{ }} の部分の色
          extrude: { on: false, color: '#000000', x: 5, y: 6 }, // 立体の厚み(px)
          band: { on: false, color: '#e8203a', height: 45 }, // 文字の下半分に引くマーカー線
          deco: { type: 'none', color: '#e8102a', edge: '', pad: 0.45 }, // 文字の後ろの図形
          pixel: { on: false, size: 5 }, // ドット風(1マスの大きさ px)
          // 文字ごとの大きさ:<< >> で大きく、(( )) で小さく。auto = 自動で小さくする文字(none / hira / kana)、digits = 数字を大きく
          charSize: { auto: 'none', digits: false, big: 1.35, small: 0.7 },
          designRef: null, // ギャラリーで選んだデザイン(名前・参考フォント)
          glow: { on: false, color: '#ffe14d', size: 18 },
          shadow: { on: true, color: '#000000', alpha: 0.6, x: 6, y: 6, blur: 0 },
          motion: 'none', // none / float / pulse / blink / shake
          motionSec: 2,
        },
      }),
    },
  },
};
