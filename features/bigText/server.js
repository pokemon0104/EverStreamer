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
    // 質感の画像:同梱のもの(features/bigText/textures)と、自分で足したもの(data/text-textures)を自動で見つけて、質感の選択肢に加える
    const texDirs = [path.join(paths.data, 'text-textures'), path.join(dir, 'textures')];
    try { fs.mkdirSync(texDirs[0], { recursive: true }); } catch { /* 作れなくても動く */ }
    for (const d of texDirs) app.use('/text-textures', express.static(d, { maxAge: '10m' }));
    let designs = { types: [], categories: [], textures: [] };
    let lastSig = '';
    const scanTextures = () => {
      const out = [];
      for (const d of texDirs) {
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
    const publishDesigns = () => {
      const have = new Set((designs.textures || []).map((t) => t.id));
      const extra = scanTextures().filter((t) => !have.has(t.id));
      lastSig = JSON.stringify(extra);
      catalogs.set('textDesigns', { ...designs, textures: [...(designs.textures || []), ...extra] });
    };
    watchJson(path.join(paths.config, 'text-designs.json'), (d) => { designs = d && Array.isArray(d.types) ? d : { types: [], categories: [], textures: [] }; publishDesigns(); }, { fallback: { types: [] } });
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
