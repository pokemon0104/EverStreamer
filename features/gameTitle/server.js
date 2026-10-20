'use strict';
// ゲームタイトル(方式A:おまかせテキスト / 方式B:ロゴ画像)とゲームプロファイル
const fs = require('fs');
const path = require('path');
const express = require('express');
const { uid, clone, deepMerge, pick, isPlainObject, watchJson } = require('../../core/util');

const PROFILE_KEYS = ['title', 'method', 'lookId', 'lookLocked', 'logo', 'logoShadow', 'logoGlow', 'logoGlowColor', 'purposeTitle', 'purpose', 'objectiveTitle', 'objective', 'storyTitle', 'story'];
// 目的・目標・あらすじ・ロゴ(書き換えると、選んでいるゲームのプロファイルにも自動で保存する)
const TEXT_KEYS = ['purposeTitle', 'purpose', 'objectiveTitle', 'objective', 'storyTitle', 'story', 'logo', 'method', 'logoShadow', 'logoGlow', 'logoGlowColor'];
const ALLOWED_EXT = ['.png', '.webp', '.svg'];

let looks = [];
let logosDir = '';

const defaultGame = () => ({
  title: 'ゲームのタイトル',
  method: 'text', // text = 方式A / logo = 方式B
  lookId: 'tpl',
  lookLocked: false,
  logo: '',
  logoShadow: true,
  logoGlow: false,
  logoGlowColor: '#ffffff',
  profileId: 'gp_main',
  // 「ゲーム全体の目的」:このゲームをどんな目的で配信するか(リッチテキストのパネルで表示。横・縦で共通)
  purposeTitle: 'このゲームの目的',
  purpose: [
    { text: 'このゲームを **最後まで** クリアする', size: 'l', style: 'star', emph: 'bold' },
  ],
  // 「今日の目標」:今日はどこまで進めるか(objective は以前の「今日の目的」をそのまま引き継ぐ)
  // 「あらすじ」(配信の前に表示する。--- だけの行でページを区切る)
  storyTitle: 'これまでのあらすじ',
  story: 'ここに、ゲームのあらすじを書きます。\n**大事なところ** は強調、==ここ== はマーカーになります。\n---\n「---」だけの行で、次のページに分かれます。',
  objectiveTitle: '今日の目標',
  objective: [
    { text: '次のボスを倒して、新しいエリアへ', size: 'l', style: 'bullet', emph: 'bold' },
    { text: '寄り道は **最小限** で進む', size: 'm', style: 'bullet' },
    { text: 'ノーデスに挑戦!', size: 'm', style: 'star', color: '#ffd84a' },
  ],
});

const defaultProfiles = () => [
  { id: 'gp_main', name: 'ゲーム1', ...pick(defaultGame(), PROFILE_KEYS) },
];

// 以前の版からの引き継ぎ:「今日の目的」→「今日の目標」、ゲーム全体の目的は空から始める
function migrateText(o) {
  if (!isPlainObject(o)) return o;
  if (!('purpose' in o)) { o.purpose = []; if (!('purposeTitle' in o)) o.purposeTitle = 'このゲームの目的'; }
  if (o.objectiveTitle === '今日の目的') o.objectiveTitle = '今日の目標';
  if (!('story' in o)) { o.story = ''; if (!('storyTitle' in o)) o.storyTitle = 'これまでのあらすじ'; }
  return o;
}
function normalizeGame(v) {
  if (!isPlainObject(v)) return defaultGame();
  return { ...defaultGame(), ...migrateText({ ...v }) };
}

function listLogos() {
  try {
    return fs.readdirSync(logosDir)
      .filter((f) => ALLOWED_EXT.includes(path.extname(f).toLowerCase()))
      .map((f) => ({ file: f, mtime: fs.statSync(path.join(logosDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .map((x) => x.file);
  } catch {
    return [];
  }
}

function sniffOk(buf, ext) {
  if (ext === '.png') return buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
  if (ext === '.webp') return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (ext === '.svg') return /<svg[\s>]/i.test(buf.toString('utf8', 0, Math.min(buf.length, 4096)));
  return false;
}

module.exports = {
  order: 25,
  namespace: 'game',
  sections: {
    game: { default: defaultGame, normalize: normalizeGame },
    gameProfiles: { default: defaultProfiles, normalize: (v) => (Array.isArray(v) ? v.map(migrateText) : defaultProfiles()) },
  },
  panelTypes: {
    gameTitle: {
      label: 'ゲームタイトル',
      defaults: () => ({
        name: 'ゲームタイトル',
        anim: { type: 'pop', ms: 450 },
        look: { headingSize: 42, bodySize: 18, padding: 14 },
        data: {
          showLive: true,
          liveText: 'LIVE',
          offText: 'OFFLINE',
          showTimer: true,
          align: 'left',
          logoMaxHeight: 110,
          shineOnChange: true,
        },
      }),
    },
    // ゲームのロゴだけを大きく表示する(縦型配信の左上など)
    gameLogo: {
      label: 'ゲームロゴ',
      defaults: () => ({
        name: 'ゲームロゴ',
        anim: { type: 'pop', ms: 450 },
        look: { headingSize: 60, padding: 6 },
        data: {
          source: 'game', // game = 選んでいるゲームのロゴ(プロファイルで切り替わる) / file = 決まったロゴ
          file: '',
          fallback: 'title', // ロゴがないとき:title = タイトル文字をリッチ表示 / none = 何も出さない
          align: 'center', // left / center / right
          valign: 'center', // top / center / bottom
          shadow: true,
          glow: false,
          glowColor: '#ffffff',
          shineOnChange: true,
        },
      }),
    },
  },
  init({ app, paths, catalogs }) {
    logosDir = path.join(paths.data, 'logos');
    fs.mkdirSync(logosDir, { recursive: true });
    const refreshLogos = () => catalogs.set('logos', listLogos());
    refreshLogos();

    watchJson(path.join(paths.config, 'title-looks.json'), (d) => {
      looks = Array.isArray(d.looks) ? d.looks : [];
      catalogs.set('looks', looks);
    }, { fallback: { looks: [] } });

    // ロゴのアップロード(本体は生データ、元のファイル名は X-Filename ヘッダー)
    app.post('/api/logos', express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
      const orig = decodeURIComponent(String(req.get('x-filename') || 'logo.png'));
      const ext = path.extname(orig).toLowerCase();
      if (!ALLOWED_EXT.includes(ext)) return res.status(400).json({ error: 'PNG / WebP / SVG のみアップロードできます' });
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ファイルが空です' });
      if (!sniffOk(buf, ext)) return res.status(400).json({ error: '画像の中身が拡張子と一致しません' });
      const base = path.basename(orig, path.extname(orig))
        .replace(/[^\w\u3040-\u30ff\u3400-\u9fff\-]+/g, '_').slice(0, 40) || 'logo';
      const file = `${base}-${Date.now().toString(36)}${ext}`;
      fs.writeFileSync(path.join(logosDir, file), buf);
      refreshLogos();
      res.json({ file });
    });
    app.use('/logos', express.static(logosDir));
    module.exports._refreshLogos = refreshLogos;
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.game, patch);
      ctx.commit('game');
      // 目的・目標は、選んでいるゲームのプロファイルにも保存する(ゲームを切り替えて戻ったときに引き継ぐ)
      const g = ctx.state.game;
      const keys = TEXT_KEYS.filter((k) => k in patch);
      const prof = keys.length && g.profileId ? ctx.state.gameProfiles.find((x) => x.id === g.profileId) : null;
      if (prof) { Object.assign(prof, clone(pick(g, keys))); ctx.commit('gameProfiles'); }
    },
    // 「おまかせ」:用意した組み合わせから、今と違うものを選ぶ
    omakase(_, ctx) {
      const g = ctx.state.game;
      if (g.lookLocked) return ctx.toast('見た目が固定されています。固定を外すと「おまかせ」できます', 'warn');
      const pool = looks.filter((l) => l.id !== g.lookId);
      if (!pool.length) return;
      g.lookId = pool[Math.floor(Math.random() * pool.length)].id;
      g.method = 'text';
      ctx.commit('game');
    },
    saveProfile({ name, overwriteId }, ctx) {
      const list = ctx.state.gameProfiles;
      const g = ctx.state.game;
      let entry = overwriteId ? list.find((x) => x.id === overwriteId) : null;
      if (!entry) {
        const n = String(name || '').trim().slice(0, 40);
        if (!n) return ctx.toast('プロファイル名を入力してください', 'warn');
        entry = list.find((x) => x.name === n);
        if (!entry) { entry = { id: uid('gp'), name: n }; list.push(entry); }
      }
      Object.assign(entry, pick(g, PROFILE_KEYS));
      g.profileId = entry.id;
      // 背景も、このゲームの背景として保存する(背景タブで「ゲームと連動」がオンの画面だけ)
      const bgMod = require('../background/server');
      bgMod.saveToProfile(ctx.raw, 'h');
      bgMod.saveToProfile(ctx.raw, 'v');
      ctx.commit('gameProfiles', 'game');
      ctx.toast(`ゲームプロファイル「${entry.name}」を保存しました`);
    },
    loadProfile({ id }, ctx) {
      const p = ctx.state.gameProfiles.find((x) => x.id === id);
      if (!p) return;
      // 古いプロファイルに目的・目標がなければ、空にする(前のゲームの内容を持ち越さない)
      const empty = { purposeTitle: 'このゲームの目的', purpose: [], objectiveTitle: '今日の目標', objective: [], storyTitle: 'これまでのあらすじ', story: '' };
      Object.assign(ctx.state.game, empty, clone(pick(p, PROFILE_KEYS)), { profileId: p.id });
      ctx.commit('game');
      // そのゲームの背景に切り替える(保存されていれば)
      const changed = require('../background/server').applyFromProfile(ctx.raw, p);
      if (changed.length) ctx.commitRaw(...changed);
    },
    deleteProfile({ id }, ctx) {
      ctx.state.gameProfiles = ctx.state.gameProfiles.filter((x) => x.id !== id);
      if (ctx.state.game.profileId === id) { ctx.state.game.profileId = ''; ctx.commit('game'); }
      ctx.commit('gameProfiles');
    },
    renameProfile({ id, name }, ctx) {
      const p = ctx.state.gameProfiles.find((x) => x.id === id);
      const n = String(name || '').trim().slice(0, 40);
      if (!p || !n) return;
      p.name = n;
      ctx.commit('gameProfiles');
    },
    deleteLogo({ file }, ctx) {
      const f = path.basename(String(file || ''));
      if (!ALLOWED_EXT.includes(path.extname(f).toLowerCase())) return;
      try { fs.unlinkSync(path.join(logosDir, f)); } catch { /* ignore */ }
      if (ctx.state.game.logo === f) { ctx.state.game.logo = ''; ctx.commit('game'); }
      for (const prof of ctx.state.gameProfiles) if (prof.logo === f) { prof.logo = ''; ctx.commit('gameProfiles'); }
      module.exports._refreshLogos();
    },
  },
};
