# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-10-29

### Added
- **Add-on packs**: drop a folder into `packs/` to add templates, large-text designs, textures and character sets; loaded automatically while running and kept when updating. Pack templates are marked "Add-on pack" in the template list
- **Character sets**: switch all four character images at once (sample or add-on pack characters)
- 4 more Google Fonts (all SIL OFL): DotGothic16, Press Start 2P, Creepster, Bangers

### Changed
- Release zips and git never include the contents of `packs/` (only its README)

---

## [1.1.0] - 2026-10-28

### Added
- **Large text panel** with a gallery of 111 original text designs (neon, metallic, pop, soft, thumbnail, contrast headings, classic and 65 photo textures), per-character size and color markup, multi-layer outlines, glow, 3D shadow, gradients, textures, background shapes and motion; "My designs" and favorites
- **Font tab**: register fonts installed on your PC or import font files into `data/userfonts`; they show up in all font pickers
- **Social accounts panel** (several accounts; list / row / rotating; neutral text marks, no service logos)
- **Per-game screen settings** linked to game profiles, and per-game game frames
- **Panel heading on the border** option (with "apply to all panels")
- **Game video area** can be dragged and resized in the preview; **YouTube display guide** and screenshot overlay (preview only)
- **Horizontal / vertical output toggle** for celebrations, thank-you messages, effects and chat-linked panels
- 7 more Google Fonts (all SIL OFL): Mochiy Pop One, Hachi Maru Pop, Darumadrop One, Klee One, Kaisei Tokumin, Yuji Boku, Rampart One

### Notes
- Photo textures in `features/bigText/textures/` are supplied by the author, who confirmed they are original or freely redistributable (see `NOTICE.md`)

---

## [1.0.0] - 2026-10-20

First public release.

### Added
- 8 templates (Neon Cyber, Clean Minimal, Pop Colorful, Dark Luxury, FPS Tactical, Fantasy, Pastel, Esports) built on design tokens; main and sub colors
- Quick setup tab, simple / advanced mode, welcome guide
- Japanese and English admin page; fixed on-stream texts follow the chosen language
- Horizontal (1920×1080) and vertical (1080×1920) overlays with separate layouts
- Starting / Break / Ending scenes with countdown, animated backgrounds and custom image / video backgrounds
- Chat hub with a common message format; YouTube (Data API v3, quota-aware) and Twitch (anonymous IRC) at the same time; exclusions and dummy comments
- Chat box with badges, Twitch emotes, Super Chat highlight and auto-fade
- PNGtuber-style character (2–4 images) with lip sync (admin page mic / OBS mic / chat / push-to-talk), blink, breathing, reactions and speech bubbles; original sample mascot "Mochimaru"
- Alerts for Super Chats, bits, members / subs, gifts, raids, follows and channel subscriptions; trigger URL for external tools
- Panels: game title, rich text goals, number panels with progress bars, name & SNS, camera frame, latest supporters, polls, idea collection, counters, and more
- Callouts, story, celebrations, thank-you messages, game profiles, presets
- `start.bat` / `start.command` / `start.sh` launchers and `npm run release` for release zips

---

## 1.2.0(日本語)

追加パックの読み込み(`packs` フォルダに入れるだけで、テンプレート・大きな文字のデザイン・質感・キャラクターを追加)、キャラクターのセットの切り替え、Google Fonts 4 種類の追加(すべて OFL)。

## 1.1.0(日本語)

大きな文字パネル(111 種類のデザイン・写真の質感 65 種)、フォントタブ(PC のフォント・フォントファイルの取り込み)、SNSアカウントパネル、ゲームごとの画面設定、見出しを枠線の上に重ねる設定、ゲーム映像の場所をプレビューで移動、YouTube の表示の目安、横型・縦型の出力切り替えを追加しました。Google Fonts を 7 種類追加(すべて OFL)。

## 1.0.0(日本語)

最初の公開版です。テンプレート 8 種類、クイック設定と初回の案内、日本語/英語、横型・縦型の配信画面、開始待機・休憩・終了の場面、YouTube・Twitch のチャット、コメント欄、キャラクター(PNGtuber 方式)、アラート、各種パネル、起動用のファイルと Releases 用 zip の作成スクリプトを含みます。
