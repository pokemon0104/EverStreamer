/* いいね・コメントの演出(オーバーレイと管理画面のプレビューで再生。音は OBS 用の画面だけ) */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- アイコン(なめらかな SVG。グラデーションとつやで立体的に) ----
  let gid = 0;
  const PATHS = {
    heart: 'M12 21.3l-1.4-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.6 11.5L12 21.3z',
    star: 'M12 2.2l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z',
    coin: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z',
  };
  function sprite(name, color) {
    const id = `rxg${++gid}`;
    const d = PATHS[name] || PATHS.star;
    const shine = name === 'coin'
      ? '<circle cx="12" cy="12" r="6.6" fill="none" stroke="rgba(255,255,255,.65)" stroke-width="1.4"/><path d="M12 8.2l1.1 2.4 2.6.3-1.9 1.8.5 2.6L12 14l-2.3 1.3.5-2.6-1.9-1.8 2.6-.3z" fill="#fff"/>'
      : '<ellipse cx="8.4" cy="7.6" rx="2.6" ry="1.6" fill="rgba(255,255,255,.7)" transform="rotate(-30 8.4 7.6)"/>';
    const em = name === 'star' ? 8 : 7;
    return `<svg viewBox="0 0 24 24" style="width:${em}em;height:${em}em;display:block"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".85"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><path d="${d}" fill="url(#${id})"/>${shine}</svg>`;
  }
  // 演出の色:テンプレートのメインカラー・サブカラーを中心に
  const palette = () => {
    const tk = OV.tokens ? OV.tokens() : {};
    return [tk.accent || '#22e4ff', tk.accent2 || '#ff3dd1', tk.accentLight || '#9ff3ff', '#ffffff', '#ffd84a', tk.accent2Light || '#ffb0ee'];
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---- 共通部品 ----
  function add(parent, cls, html, style, life) {
    const el = document.createElement('div');
    el.className = `rx ${cls}`;
    if (html) el.innerHTML = html;
    for (const [k, v] of Object.entries(style || {})) el.style.setProperty(k, v);
    parent.appendChild(el);
    setTimeout(() => el.remove(), life || 4000);
    while (parent.children.length > 120) parent.firstChild.remove(); // 出しすぎ防止
    return el;
  }
  const px = (v) => `${Math.round(v)}px`;

  // ---- 効果(感謝メッセージからも使えるよう OV.fx として公開) ----
  const fx = {
    rise(parent, rect, name, color, s, i) {
      add(parent, 'rx-rise', sprite(name, color), {
        left: px(rect.x + rect.w / 2 + rnd(-rect.w / 3, rect.w / 3)),
        top: px(rect.y + rect.h * 0.35),
        'font-size': px(5 * s),
        '--dx': px(rnd(-70, 70)),
        '--rise': px(rnd(170, 320)),
        '--dur': `${rnd(1.8, 2.6).toFixed(2)}s`,
      }, 2800);
    },
    burst(parent, rect, color, s) {
      const x = rect.x + rnd(rect.w * 0.2, rect.w * 0.8);
      const y = rect.y + rnd(rect.h * 0.2, rect.h * 0.6);
      add(parent, 'rx-pop', sprite('star', color), { left: px(x), top: px(y), 'font-size': px(6 * s) }, 1200);
      const c = 24 * s;
      add(parent, 'rx-ring', '', { left: px(x + c), top: px(y + c), '--c': color, width: px(2 * c), height: px(2 * c), 'margin-left': px(-c), 'margin-top': px(-c) }, 900);
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI * 2 * i) / 10 + rnd(-0.2, 0.2);
        const d = rnd(60, 110) * s;
        add(parent, 'rx-spark', '', { left: px(x + c), top: px(y + c), '--dx': px(Math.cos(a) * d), '--dy': px(Math.sin(a) * d), background: color, width: px(rnd(4, 8) * s), height: px(rnd(4, 8) * s) }, 1000);
      }
    },
    // 光るチップがはねる(以前のコイン)
    coin(parent, rect, color, s, withPlus) {
      const x = rect.x + rect.w / 2 + rnd(-rect.w / 2.5, rect.w / 2.5);
      const y = rect.y + rect.h * 0.3 + rnd(-10, 10);
      add(parent, 'rx-coin', sprite('coin', color), { left: px(x), top: px(y), 'font-size': px(5 * s) }, 1300);
      if (withPlus) add(parent, 'rx-plus small', '+1', { left: px(x + 4 * s), top: px(y - 10), 'font-size': px(26 * s) }, 1300);
    },
    // 花火:光の粒が広がって、ゆっくり落ちる
    firework(parent, rect, s) {
      const x = rect.x + rnd(rect.w * 0.15, rect.w * 0.85);
      const y = rect.y + rnd(rect.h * 0.15, rect.h * 0.55);
      const pal = palette();
      const c1 = pick(pal);
      const c2 = pick(pal);
      add(parent, 'rx-flare', '', { left: px(x), top: px(y), '--c': c1, width: px(160 * s), height: px(160 * s), 'margin-left': px(-80 * s), 'margin-top': px(-80 * s) }, 900);
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + rnd(-0.08, 0.08);
        const r = rnd(110, 170) * s;
        const sz = rnd(5, 9) * s;
        add(parent, 'rx-spark fw', '', { left: px(x), top: px(y), '--dx': px(Math.cos(a) * r), '--dy': px(Math.sin(a) * r), background: i % 4 ? c1 : c2, width: px(sz), height: px(sz), '--dur': `${rnd(1.1, 1.6).toFixed(2)}s` }, 1700);
      }
    },
    confetti(parent, rect, n, s) {
      const pal = palette();
      for (let i = 0; i < n; i++) {
        add(parent, 'rx-fall', '', {
          left: px(rect.x + rnd(0, rect.w)),
          top: px(rect.y - 30),
          width: px(rnd(8, 14) * s),
          height: px(rnd(12, 20) * s),
          background: pal[i % pal.length],
          'border-radius': i % 3 === 0 ? '50%' : '3px',
          '--fall': px(rect.h + 60),
          '--dx': px(rnd(-120, 120)),
          '--rot': `${Math.round(rnd(-720, 720))}deg`,
          '--dur': `${rnd(2.2, 3.6).toFixed(2)}s`,
          'animation-delay': `${rnd(0, 0.6).toFixed(2)}s`,
        }, 4600);
      }
    },
    plus(parent, rect, n, s) {
      add(parent, 'rx-plus', `+${n}`, { left: px(rect.x + rect.w / 2 - 40 * s), top: px(rect.y + rect.h * 0.25), 'font-size': px(52 * s) }, 1600);
    },
  };
  OV.fx = fx;

  // ---- どこに出すか ----
  const RULES = {
    like: { metrics: ['likeCount'], re: /いいね|高評価/ },
    comment: { metrics: ['chatCount', 'commentCount'], re: /コメント|チャット/ },
  };
  function findPanelEl(stage, kind) {
    const r = RULES[kind];
    const ps = (OV.state.panels || []).filter((p) => p.visible !== false);
    const p = ps.find((x) => (x.type === 'number' || x.type === 'comments') && x.data && x.data.source === 'youtube' && r.metrics.includes(x.data.metric))
      || ps.find((x) => (x.type === 'number' || x.type === 'comments') && r.re.test(`${x.name} ${(x.data || {}).label || ''}`));
    return p ? stage.querySelector(`.ov-panel[data-id="${p.id}"]`) : null;
  }
  function rectInStage(stage, el) {
    const s = stage.getBoundingClientRect();
    const k = s.width / OV.W || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  function areaRect(stage, cfg, kind) {
    if (cfg.area === 'screen') return { x: 0, y: 0, w: OV.W, h: OV.H };
    if (cfg.area === 'panel' && kind !== 'word') {
      const el = findPanelEl(stage, kind);
      if (el && !el.closest('.is-gone, .is-empty')) return rectInStage(stage, el);
    }
    return { x: Number(cfg.x) || 0, y: Number(cfg.y) || 0, w: Number(cfg.w) || 600, h: Number(cfg.h) || 400 };
  }
  function glowPanel(stage, kind) {
    const el = findPanelEl(stage, kind);
    if (!el) return;
    el.classList.remove('rx-glow');
    void el.offsetWidth;
    el.classList.add('rx-glow');
  }

  // ---- 音(やわらかいチャイム。ファイル不要) ----
  let ac = null;
  let lastBlip = 0;
  /** ベルのような音を1つ鳴らす(サイン波+倍音、すぐ減衰) */
  OV.chime = function (freqs, vol, gap = 0.07, len = 0.5) {
    if (OV.role !== 'overlay') return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach((f, i) => {
        const t = ac.currentTime + i * gap;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        g.connect(ac.destination);
        [[1, 'sine', 1], [2, 'sine', 0.25], [3, 'triangle', 0.08]].forEach(([m, type, a]) => {
          const o = ac.createOscillator();
          const og = ac.createGain();
          o.type = type;
          o.frequency.value = f * m;
          og.gain.value = a;
          o.connect(og).connect(g);
          o.start(t);
          o.stop(t + len + 0.05);
        });
      });
    } catch (e) { /* 音が出せない環境では無視 */ }
  };
  function blip(kind) {
    const now = performance.now();
    if (now - lastBlip < 120) return;
    lastBlip = now;
    const vol = clamp(Number((OV.state.reactions || {}).volume) || 0.4, 0, 1) * 0.22;
    if (kind === 'like') OV.chime([1046.5, 1568], vol, 0.06, 0.45); else OV.chime([880, 1318.5], vol * 0.8, 0.05, 0.35);
  }

  // ---- いいね ----
  function playLike(entry, p, cfg) {
    const { stage, layer } = entry;
    const s = clamp(Number(cfg.size) || 1, 0.4, 3);
    const n = Math.max(1, Number(p.count) || 1);
    const k = Math.min(n, clamp(Number(cfg.max) || 10, 1, 50));
    const rect = areaRect(stage, cfg, 'like');
    const color = cfg.color || '#ff4f78';
    if (cfg.sound) blip('like');
    if (cfg.type === 'glow') { glowPanel(stage, 'like'); return; }
    if (cfg.type === 'plusone') { fx.plus(layer, rect, n, s); glowPanel(stage, 'like'); return; }
    if (cfg.type === 'confetti') { fx.confetti(layer, rect, Math.min(120, 20 + k * 8), s); if (n > 1) fx.plus(layer, rect, n, s); return; }
    for (let i = 0; i < k; i++) {
      setTimeout(() => {
        if (cfg.type === 'heart') fx.rise(layer, rect, 'heart', color, s, i);
        else if (cfg.type === 'star') fx.burst(layer, rect, '#ffd84a', s);
        else if (cfg.type === 'coin') fx.coin(layer, rect, palette()[0], s, k <= 3);
        else if (cfg.type === 'firework') fx.firework(layer, rect, s);
      }, i * (cfg.type === 'firework' ? 260 : 120));
    }
    // 上限を超えた分や、コインが多いときは「+N」でまとめて見せる
    if (n > k || (cfg.type === 'coin' && k > 3)) setTimeout(() => fx.plus(layer, rect, n, s), Math.min(k, 6) * 120);
  }

  // ---- コメント ----
  function bubbleHtml(m, cfg) {
    if (!cfg.showText) return `<span class="rx-cn">${OV.t('コメント +1')}</span>`;
    const text = String(m.text || '').slice(0, 60);
    return `${m.amount ? `<span class="rx-amt">${esc(m.amount)}</span>` : ''}${m.name ? `<span class="rx-cn">${esc(m.name)}</span>` : ''}<span class="rx-ct">${esc(text)}</span>`;
  }
  function oneComment(entry, m, cfg) {
    const { stage, layer } = entry;
    const s = clamp(Number(cfg.size) || 1, 0.4, 3);
    const rect = areaRect(stage, cfg, 'comment');
    const max = clamp(Number(cfg.max) || 6, 1, 30);
    const sc = m.type === 'superChatEvent' || m.type === 'superStickerEvent' ? ' sc' : '';
    if (cfg.sound) blip('comment');
    if (cfg.type === 'glow') { glowPanel(stage, 'comment'); return; }
    if (cfg.type === 'bubble') {
      const old = layer.querySelectorAll('.rx-bubble');
      for (let i = 0; i <= old.length - max; i++) old[i].remove();
      // 重ならないよう、横は列を順番に、縦は2段を交互に使う
      const cols = Math.max(1, Math.floor(rect.w / (340 * s)));
      entry.col = ((entry.col || 0) + 1) % cols;
      entry.row = ((entry.row || 0) + 1) % 2;
      const colW = rect.w / cols;
      const el = add(layer, `rx-bubble${sc}`, bubbleHtml(m, cfg), { 'font-size': px(22 * s), 'max-width': px(Math.min(colW - 10, 560 * s)), top: px(rect.y + rect.h - (70 + entry.row * 64) * s) }, 5200);
      el.style.left = px(rect.x + entry.col * colW + rnd(0, Math.max(0, colW - el.offsetWidth - 10)));
      return;
    }
    if (cfg.type === 'scroll') {
      const lanes = Math.max(1, Math.floor(rect.h / (48 * s)));
      const el = add(layer, `rx-scroll${sc}`, bubbleHtml(m, cfg), { 'font-size': px(26 * s), top: px(rect.y + Math.floor(rnd(0, lanes)) * 48 * s), left: px(rect.x + rect.w) }, 8000);
      el.style.setProperty('--dist', px(rect.w + el.offsetWidth));
      return;
    }
    if (cfg.type === 'dotwin') {
      entry.queue.push(m);
      while (entry.queue.length > max) entry.queue.shift();
      if (!entry.typing) nextWindow(entry, cfg, rect, s);
    }
  }
  // お知らせカード(1件ずつ、すべり込んで表示)
  function nextWindow(entry, cfg, rect, s) {
    const m = entry.queue.shift();
    if (!m) { entry.typing = false; return; }
    entry.typing = true;
    const { layer } = entry;
    const w = Math.min(rect.w, 640 * s);
    const sc = m.type === 'superChatEvent' || m.type === 'superStickerEvent' ? ' sc' : '';
    const body = cfg.showText
      ? `<div class="rx-card-h">${m.name ? `<span class="rx-cn">${esc(m.name)}</span>` : ''}${m.amount ? `<span class="rx-amt">${esc(m.amount)}</span>` : ''}</div><div class="rx-ct">${esc(String(m.text || '').slice(0, 80))}</div>`
      : `<div class="rx-ct">${esc(OV.t('コメントが届きました!'))}</div>`;
    const box = add(layer, `rx-card${sc}`, body, { left: px(rect.x), top: px(rect.y + rect.h - 120 * s), width: px(w), 'font-size': px(24 * s) }, 60000);
    const len = String(m.text || '').length;
    setTimeout(() => { box.classList.add('out'); setTimeout(() => { box.remove(); nextWindow(entry, cfg, rect, s); }, 400); }, clamp(1800 + len * 45, 2200, 5200));
  }
  function playComments(entry, p, cfg) {
    const msgs = (p.messages || []).slice(-30);
    // まとめて届いた分は、次の取得までの間に少しずつずらして出す(続けて届いているように見せる)
    const gap = clamp((Number(p.spreadMs) || 3000) / Math.max(1, msgs.length), 250, 2500);
    msgs.forEach((m, i) => setTimeout(() => oneComment(entry, m, cfg), i * gap));
  }

  // ---- 各画面(オーバーレイ・プレビュー)にレイヤーを作る ----
  const entries = [];
  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'rx-layer';
      stage.appendChild(layer);
      entries.push({ stage, layer, queue: [], typing: false });
    },
  });
  // ---- コメントの言葉に反応する絵文字 ----
  function playWord(entry, p, cfg) {
    const { stage, layer } = entry;
    const s = clamp(Number(cfg.size) || 1, 0.4, 3);
    const rect = areaRect(stage, cfg, 'word');
    const room = clamp(Number(cfg.max) || 12, 1, 40) - layer.querySelectorAll('.rx-emoji').length;
    (p.icons || []).slice(0, Math.max(0, room)).forEach((icon, i) => {
      setTimeout(() => {
        const long = String(icon).length > 2 && !/\p{Extended_Pictographic}/u.test(icon); // 文字(「草」「GG!」など)は少し小さめ
        add(layer, 'rx-emoji', esc(icon), {
          left: px(rect.x + rnd(rect.w * 0.1, rect.w * 0.9)),
          top: px(rect.y + rect.h * rnd(0.55, 0.9)),
          'font-size': px((long ? 44 : 60) * s),
          color: p.color || '#fff',
          '--dx': px(rnd(-80, 80)),
          '--rise': px(rnd(160, 300) * s),
          '--dur': `${rnd(1.8, 2.6).toFixed(2)}s`,
        }, 2800);
      }, i * 120);
    });
  }

  OV.onMessage('reactions:fire', (p) => {
    const all = OV.state.reactions;
    if (!all) return;
    if (p.canvas && p.canvas !== OV.canvas) return; // 別の画面(横/縦)向けのテスト・言葉の反応
    if (OV.screenOn && !OV.screenOn('reactions')) return; // この画面(横型/縦型)には出さない
    if (p.kind === 'word') {
      const w = all.word;
      if (!w || (!w.enabled && !p.test)) return;
      for (const e of entries) if (e.stage.isConnected) playWord(e, p, w);
      return;
    }
    const cfg = all[p.kind === 'like' ? 'like' : 'comment'];
    if (!cfg || (!cfg.enabled && !p.test)) return;
    for (const e of entries) {
      if (!e.stage.isConnected) continue;
      if (p.kind === 'like') playLike(e, p, cfg); else playComments(e, p, cfg);
    }
  });
})();
