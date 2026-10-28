# Contributing / 開発に参加するには

Thank you for helping! This guide covers how the project is organized, how to add a **template**, how to add a **translation** or a **chat platform**, and the rules every contribution must follow.

日本語は [後半](#日本語) にあります。

---

## Ground rules

- **Rights**: only contribute images, icons and fonts that you made yourself or that are clearly redistributable (e.g. fonts under the SIL Open Font License). Do not copy existing brands, logos, commercial overlays, game characters, console images or game company names.
- **Security**: the server listens on `localhost` only. Never log or display the YouTube API key, and never commit anything from `data/`.
- **Ease of use first**: when in doubt, choose the option that is simpler for a streamer who has never used Node.js.
- **No build step**: plain HTML / CSS / JavaScript in the browser, Node.js + Express + ws on the server. Please don't add frameworks or bundlers.

## Development setup

```
npm install
npm start          # http://localhost:3000/admin
```

Environment variables (for testing only):

| Variable | Use |
|---|---|
| `PORT` | Port to listen on (default 3000) |
| `YT_API_BASE` | Point the YouTube client at a mock server |
| `TWITCH_IRC_URL` | Point the Twitch client at a mock IRC WebSocket server |

Run `npm run release` to build `dist/everstreamer-v<version>.zip` (it never includes `node_modules`, `data` or `dist`).

## How the project is organized

```
server.js             Express + WebSocket server (localhost only)
core/                 State store, hub (messages), canvases, design tokens, templates, fonts
features/<name>/      One folder per feature (a "plugin")
  server.js           sections (saved state), handlers (messages), panelTypes, init()
  overlay.js          drawing on the OBS overlay and the admin preview
  admin.js            admin tabs / panel inspectors
  style.css           styles for both
config/               Editable data: templates, styles, frames, backgrounds, fonts…
public/               Pages, core browser scripts, translations (public/i18n)
docs/                 Feature reference (Japanese) and screenshots
```

- State lives in sections defined by each feature's `server.js`. A section with `vDefault` automatically gets a vertical-canvas copy (`panels` → `vPanels`, etc.).
- Admin → server messages are `{ type: '<namespace>:<handler>', payload }`.
- Features talk to each other on the server through `core/bus.js` events, e.g. `chat:messages`, `alert:event`, `alert:shown`, `yt:likes`, `yt:subs`.
- A folder containing a `.disabled` file is skipped, which is handy for turning a feature off.

---

## Adding a template

A template is **one JSON file and one optional CSS file** in `config/templates/`. No code changes are needed; files are picked up within a few seconds while the server is running.

```
config/templates/
├─ mytemplate.json   (required)
└─ mytemplate.css    (optional decorations)
```

### JSON fields

| Field | Content |
|---|---|
| `id` | Letters, digits, `-` or `_`. Must match the file name |
| `order` | Position in the list |
| `name`, `desc` | `{ "ja": "…", "en": "…" }` |
| `tokens` | Design tokens: `accent` (main color), `accent2` (sub color), `bg`, `surface`, `text`, `muted`, `font`, `headingFont`, `numberFont`, `radius` |
| `panel` | Panel look (same keys as a style's `look` in `config/styles.json`) |
| `title` | Game title text look (same shape as `config/title-looks.json`) |
| `titleBig` | Optional title look for big text on dark backdrops (celebrations, thanks) |
| `frame` | Game frame (same shape as `config/game-frames.json`) |
| `callout` | Callout design (same shape as a `design` in `config/callout-designs.json`) |
| `story` | Story design (same shape as a `design` in `config/story-designs.json`) |
| `background` | CSS `background` value |
| `scene` | `fx`: `orbs` / `grid` / `particles` / `waves` / `lines` / `none`; `layout`: `center` / `left` |

### Tokens in values

Any string value can contain tokens, which are replaced with the template's tokens and the user's chosen colors:

- `{accent}`, `{accent2}`, `{bg}`, `{surface}`, `{text}`, `{muted}`, `{font}`, `{radius}` …
- `{accent@0.4}` — the main color at 40% opacity
- `{accentLight}`, `{accentDark}` — automatically lightened / darkened main color
- `{onAccent}` — readable text color on top of the main color (white or black)

Tokens also work in `config/styles.json`.

### CSS

Scope every rule to your template so it only applies when it's selected:

```css
.ov-stage[data-template='mytemplate'] .ov-panel.is-tpl .ov-box::after { … }
```

- `.ov-panel.is-tpl` — panels whose style is "Match template"
- CSS variables: `--t-accent`, `--t-accent2`, `--t-accent-light`, `--t-accent-dark`, `--t-accent-text`, `--t-bg`, `--t-surface`, `--t-text`, `--t-muted`, `--t-on-accent`, `--t-accent-a50`, `--t-accent-a20`, `--t-accent2-a50`, `--t-font`, `--t-hfont`, `--t-nfont`, `--t-radius`

### Checklist for a new template

- [ ] Looks right on both the horizontal (`/overlay`) and vertical (`/overlay-vertical`) screens
- [ ] Panels, game frame, chat box, alert, callout, story and the Starting / Break / Ending scenes all look right
- [ ] Text is readable: aim for a contrast ratio of 4.5:1 or more for body text
- [ ] Works with a few different main colors
- [ ] Fonts are in `config/fonts.json` and are OFL (or similarly redistributable)
- [ ] No copied brands, logos or game assets

---

## Adding a text design or texture

- **Designs** (large text panel) live in `config/text-designs.json`: `types` hold `variants` with a `look`. Use only your own designs; don't name commercial fonts or copy known logos / titles.
- **Textures**: drop a JPG / PNG into `features/bigText/textures/` (add a label in `textures.json`). Only add images you made or that are clearly redistributable, and list them in `NOTICE.md`.

## Adding a translation

The admin page is written in Japanese. English text comes from `public/i18n/en.json`:

- `strings`: exact-match translations
- `patterns`: sentences with placeholders, e.g. `"現在の枠: {0}": "Current frame: {0}"`

Untranslated text falls back to Japanese. To add a language, create `public/i18n/<lang>.json` with the same shape and add it to the language menu in `features/theme/admin.js` and `public/core/i18n.js`.

## Adding a chat platform

Create `features/chat/platforms/<name>.js` and add it to `PLATFORMS` in `features/chat/server.js`:

```js
module.exports = {
  id: 'myplatform',
  label: 'My Platform',
  create(api) {
    return {
      start(cfg) { /* connect, then call api.status('connected', '…') */ },
      stop() { /* disconnect, then api.status('off', '') */ },
    };
  },
};
```

- `api.emit([message…])` — send chat messages (the common format is documented at the top of `features/chat/server.js`)
- `api.event({ kind, name, … })` — send alerts (`superchat`, `bits`, `member`, `gift`, `raid`, `follow`, `subscribe`)
- `api.status(state, detail)` — `connecting` / `connected` / `error` / `off`

Handle disconnects with a retry and backoff; the server must never crash because a platform is unreachable.

## Pull requests

1. Keep each pull request focused on one thing
2. Start the server and check the admin page and both overlays; the browser console should show no errors
3. Update `CHANGELOG.md` (under an "Unreleased" heading) and the READMEs if behavior changes
4. Don't include anything from `data/`

---

## 日本語

### 守ること

- **権利**:自作の画像・アイコン、または再配布できるもの(OFL のフォントなど)だけを使います。既存のブランド・ロゴ・市販のオーバーレイ・ゲームのキャラクター・ゲーム機の画像・ゲーム会社名は入れません。
- **安全**:サーバーは `localhost` だけで待ち受けます。YouTube の APIキーをログや画面に出さないこと、`data/` の中身をコミットしないこと。
- **使いやすさ優先**:迷ったら、Node.js を使ったことのない配信者にとって簡単なほうを選びます。
- **ビルドなし**:ブラウザは素の HTML / CSS / JavaScript、サーバーは Node.js + Express + ws です。

### 開発の始め方

`npm install` → `npm start`(`http://localhost:3000/admin`)。`npm run release` で `dist/` に Releases 用の zip ができます(`node_modules`・`data`・`dist` は含みません)。テスト用の環境変数 `YT_API_BASE` と `TWITCH_IRC_URL` で、YouTube と Twitch の接続先をテスト用のサーバーに向けられます。

### テンプレートを追加する

`config/templates/` に JSON(必須)と CSS(任意)を置くだけです。コードの変更はいりません。項目は上の「JSON fields」の表と同じです(`name`・`desc` は `{ "ja": "…", "en": "…" }`)。

- 値の中の `{accent}` などは、メインカラーなどに置き換わります。`{accent@0.4}` で不透明度 0.4、`{accentLight}` / `{accentDark}` で明るい/暗いメインカラー、`{onAccent}` でメインカラーの上で読みやすい文字色
- CSS は `.ov-stage[data-template='<id>']` から書き始め、そのテンプレートのときだけ効くようにします。使える CSS 変数は上の一覧のとおりです
- 確認:横型と縦型の両方、パネル・ゲーム枠・コメント欄・アラート・お願い・あらすじ・開始待機などの場面、文字の読みやすさ(本文はコントラスト比 4.5 以上が目安)、いくつかのメインカラー

### 翻訳

管理画面は日本語で書いてあり、英語は `public/i18n/en.json` の辞書(`strings`:文字全体が一致したときの訳、`patterns`:`{0}` などを含む文の訳)で置き換えます。辞書にない文字は日本語のまま表示されます。

### チャットのサービスを追加する

`features/chat/platforms/<名前>.js` を作り、`features/chat/server.js` の `PLATFORMS` に加えます。`api.emit`(コメント)、`api.event`(アラート)、`api.status`(接続状態)を使います。つながらないときは間隔を延ばしながら再接続し、サーバーが落ちないようにしてください。

### プルリクエスト

1 つのプルリクエストには 1 つの変更を。管理画面と横型・縦型の配信画面を開いて、ブラウザのコンソールにエラーが出ないことを確かめてください。動きが変わるときは `CHANGELOG.md` と README も更新し、`data/` の中身は含めないでください。
