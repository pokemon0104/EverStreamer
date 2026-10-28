# NOTICE — third-party software, fonts and assets

EverStreamer is released under the MIT License (see `LICENSE`).
This file lists everything that is **not** original to this project, and confirms that everything bundled in the repository can be redistributed.

日本語の要約:このリポジトリに含まれるものは、すべて再配布できることを確認しています。フォントは同梱せず、初回に Google Fonts から取得して `data/fonts/` に保存します(すべて SIL Open Font License 1.1)。

## 1. Bundled in this repository

| Item | Location | Author / source | License | Redistributable |
|---|---|---|---|---|
| Source code, templates (JSON/CSS), styles, frames, backgrounds, callout and story designs | everything except below | This project | MIT | Yes |
| Sample mascot "Mochimaru" (4 images) | `features/character/assets/` | Original artwork drawn for this project | MIT | Yes |
| UI icons (arrows, badges, hearts, stars, chips) | inline SVG in `features/*/overlay.js` | Original, drawn for this project | MIT | Yes |
| Screenshots | `docs/images/` | Taken from this project | MIT | Yes |
| Text design gallery (111 designs) | `config/text-designs.json` | Original, made for this project | MIT | Yes |
| Texture images (65 JPG photos, 9 PNG code textures, `textures.json`) | `features/bigText/textures/` | Supplied by the author (GENOTA), who confirms they are self-made or free materials that may be redistributed | MIT | Yes |

Notes:

- Service names (YouTube, Twitch, X, Discord, TikTok, Instagram) appear only as text to tell users which service a setting is for. **No logos are included**; platforms are shown with neutral text marks (YT, TW, X, DC, TT, IG, …).
- No game console images, game logos, game characters or game company names are included.
- Emoji are rendered by the viewer's system font and are not bundled.

## 2. Downloaded at runtime (not bundled)

### Fonts — SIL Open Font License 1.1

Fonts are fetched from Google Fonts the first time they are used and cached in `data/fonts/` on your own PC. They are not included in this repository or in release zips.

Noto Sans JP, Noto Serif JP, M PLUS Rounded 1c, Zen Maru Gothic, Zen Kaku Gothic New, Kiwi Maru, Dela Gothic One, Reggae One, RocknRoll One, Potta One, Yusei Magic, Train One, Shippori Mincho, Yuji Syuku, Kaisei Decol, Orbitron, Rajdhani, Poppins, Montserrat, Bebas Neue, Cinzel, Mochiy Pop One, Hachi Maru Pop, Darumadrop One, Klee One, Kaisei Tokumin, Yuji Boku, Rampart One.

### Your own fonts

Fonts you import in the Font tab are saved only in `data/userfonts/` on your own PC. They are not part of this project; please check the license of each font you use on stream.

License text: https://openfontlicense.org/

### Twitch emotes

Twitch chat emotes are displayed by loading images from Twitch's own CDN (`static-cdn.jtvnw.net`) at runtime. They are not stored or redistributed by this project.

## 3. npm dependencies

Installed by `npm install`; not included in the repository.

| Package | License |
|---|---|
| express (and its dependencies) | MIT (`qs`: BSD-3-Clause, `inherits` / `setprototypeof`: ISC) |
| ws | MIT |
