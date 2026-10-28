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

// ---- シーン(OBS のシーンのように、ゲームプロファイルごとに見た目・配置をまるごと持つ) ----
// 横画面・縦画面のパネル(文字サイズ・スタイル・表示/非表示・位置)、サイドバー・全体の大きさ、背景、ゲーム枠、演出、あらすじの出し方
const SCENE_KEYS = ['panels', 'vPanels', 'layout', 'vLayout', 'background', 'vBackground', 'gameFrame', 'vGameFrame', 'frameCustom', 'reactions', 'vReactions', 'story', 'storyView', 'vStoryView'];
const sceneOn = (raw) => ((raw.game || {}).sceneLink !== false);
/** いまの画面の設定を、プロファイルのシーンとして保存する */
function saveScene(raw, prof) {
  if (!prof || !sceneOn(raw)) return false;
  const sc = {};
  for (const k of SCENE_KEYS) if (raw[k] !== undefined) sc[k] = clone(raw[k]);
  prof.scene = sc;
  return true;
}
/** プロファイルのシーンを、いまの画面に読み込む。変えた設定欄の名前を返す */
function applyScene(ctx, prof) {
  const raw = ctx.raw;
  const sc = prof && prof.scene;
  if (!sc || !sceneOn(raw)) return [];
  const changed = [];
  for (const k of SCENE_KEYS) {
    if (sc[k] === undefined) continue;
    // 背景・ゲーム枠で「ゲームごとに切り替える」をオフにしている画面は、いまのまま(全ゲーム共通)
    if ((k === 'background' || k === 'vBackground' || k === 'gameFrame' || k === 'vGameFrame') && raw[k] && raw[k].linkGame === false) continue;
    if (k === 'frameCustom' && ((raw.gameFrame || {}).linkGame === false || (raw.vGameFrame || {}).linkGame === false)) continue;
    let v = clone(sc[k]);
    // 取り込んだゲーム枠の画像の一覧は、すべてのゲームで共通
    if ((k === 'gameFrame' || k === 'vGameFrame') && isPlainObject(v)) v.images = clone((raw[k] || {}).images || []);
    raw[k] = ctx.normalizeRaw(k, v);
    changed.push(k);
  }
  return changed;
}

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
      // ゲーム枠も、このゲームの枠として保存する(ゲーム枠タブで「ゲームと連動」がオンの画面だけ)
      require('../gameFrame/server').saveAllToProfile(ctx.raw);
      // パネル・レイアウトなど、画面の設定をまるごと、このゲームのシーンとして保存する
      saveScene(ctx.raw, entry);
      ctx.commit('gameProfiles', 'game');
      ctx.toast(`ゲームプロファイル「${entry.name}」を保存しました`);
    },
    loadProfile({ id }, ctx) {
      const p = ctx.state.gameProfiles.find((x) => x.id === id);
      if (!p) return;
      // 切り替える前に、いまのゲームの背景・ゲーム枠を、いまのゲームのプロファイルに保存しておく
      // (まだ保存されていないプロファイルでも、切り替えて戻ったときに元の見た目に戻るように)
      const bgMod = require('../background/server');
      const gfMod = require('../gameFrame/server');
      const prev = ctx.state.game.profileId ? ctx.state.gameProfiles.find((x) => x.id === ctx.state.game.profileId) : null;
      if (prev && prev.id !== p.id) {
        const a = bgMod.saveToProfile(ctx.raw, 'h');
        const b = bgMod.saveToProfile(ctx.raw, 'v');
        const c = saveScene(ctx.raw, prev);
        if (gfMod.saveAllToProfile(ctx.raw) || a || b || c) ctx.commit('gameProfiles');
      }
      // 古いプロファイルに目的・目標がなければ、空にする(前のゲームの内容を持ち越さない)
      const empty = { purposeTitle: 'このゲームの目的', purpose: [], objectiveTitle: '今日の目標', objective: [], storyTitle: 'これまでのあらすじ', story: '' };
      Object.assign(ctx.state.game, empty, clone(pick(p, PROFILE_KEYS)), { profileId: p.id });
      ctx.commit('game');
      // そのゲームの背景に切り替える(保存されていれば)
      // シーンが保存されていれば、パネル・レイアウト・背景・ゲーム枠などをまるごと切り替える。
      // まだなければ(初めて切り替えたゲーム)、いまの画面をそのまま引き継ぎ、別のゲームに切り替えるときに、このゲームのシーンとして保存する
      const changed = p.scene && sceneOn(ctx.raw)
        ? applyScene(ctx, p)
        : [...bgMod.applyFromProfile(ctx.raw, p), ...gfMod.applyFromProfile(ctx.raw, p)];
      if (changed.length) ctx.commitRaw(...new Set(changed));
      if (!p.scene && sceneOn(ctx.raw)) {
        saveScene(ctx.raw, p);
        ctx.commit('gameProfiles');
      }
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
