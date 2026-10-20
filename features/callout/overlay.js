/* お願いポップアップ:ボタン1つで、メッセージを演出つきで出す(オーバーレイと、管理画面のプレビューで共通) */
(function () {
  'use strict';
  const { esc, clamp, fontStack, hexToRgba } = OV.util;

  // ---- アイコン(矢印は自前の SVG。指さしなどは絵文字) ----
  const arrow = (rot) => `<svg viewBox="0 0 100 100" class="co-svg" style="transform:rotate(${rot}deg)"><path d="M38 6h24v48h22L50 96 16 54h22z" fill="currentColor" stroke="rgba(0,0,0,.55)" stroke-width="5" stroke-linejoin="round"/></svg>`;
  const chevrons = (rot) => `<svg viewBox="0 0 100 100" class="co-svg co-chev" style="transform:rotate(${rot}deg)">${[0, 1, 2].map((i) => `<path class="cv cv${i}" d="M18 ${10 + i * 28}l32 22 32-22" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
  const curve = (flip) => `<svg viewBox="0 0 100 100" class="co-svg" style="transform:scaleX(${flip ? -1 : 1})"><path d="M14 18c40 0 62 18 62 50" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round"/><path d="M56 60l20 30 20-30z" fill="currentColor"/></svg>`;
  OV.CALLOUT_ICONS = {
    none: { label: 'なし', html: '' },
    pointDown: { label: '👇 指さし(下)', html: '👇', dir: 'down' },
    pointRight: { label: '👉 指さし(右)', html: '👉', dir: 'right' },
    pointLeft: { label: '👈 指さし(左)', html: '👈', dir: 'left' },
    pointUp: { label: '👆 指さし(上)', html: '👆', dir: 'up' },
    arrowDown: { label: '⬇ 矢印(下)', html: arrow(0), dir: 'down' },
    arrowRight: { label: '➡ 矢印(右)', html: arrow(-90), dir: 'right' },
    arrowLeft: { label: '⬅ 矢印(左)', html: arrow(90), dir: 'left' },
    arrowUp: { label: '⬆ 矢印(上)', html: arrow(180), dir: 'up' },
    chevDown: { label: '︾ 流れる矢印(下)', html: chevrons(0), dir: 'down' },
    chevRight: { label: '》 流れる矢印(右)', html: chevrons(-90), dir: 'right' },
    chevLeft: { label: '《 流れる矢印(左)', html: chevrons(90), dir: 'left' },
    curveDown: { label: '↷ 曲がった矢印(右下)', html: curve(false), dir: 'down' },
    curveDownL: { label: '↶ 曲がった矢印(左下)', html: curve(true), dir: 'down' },
    thumb: { label: '👍 高評価', html: '👍' },
    bell: { label: '🔔 ベル(通知)', html: '🔔' },
    heart: { label: '❤️ ハート', html: '❤️' },
    chat: { label: '💬 コメント', html: '💬' },
    star: { label: '⭐ 星', html: '⭐' },
    sparkles: { label: '✨ きらきら', html: '✨' },
  };

  // ---- 位置(3×3 の基準点 + ずらす量) ----
  const M = 40; // 画面の端からの余白
  const ANCHOR = {
    tl: [0, 0], t: [50, 0], tr: [100, 0], l: [0, 50], c: [50, 50], r: [100, 50], bl: [0, 100], b: [50, 100], br: [100, 100],
  };
  function placeStyle(pl) {
    const [ax, ay] = ANCHOR[pl.anchor] || ANCHOR.b;
    const mx = ax === 0 ? M : ax === 100 ? -M : 0;
    const my = ay === 0 ? M : ay === 100 ? -M : 0;
    return {
      left: `calc(${ax}% + ${mx + (Number(pl.x) || 0)}px)`, top: `calc(${ay}% + ${my + (Number(pl.y) || 0)}px)`,
      transform: `translate(${-ax}%, ${-ay}%) scale(${Number(pl.scale) || 1})`, transformOrigin: `${ax}% ${ay}%`,
    };
  }

  // ---- デザイン → 要素 ----
  OV.applyCalloutDesign = function (box, d) {
    const s = box.style;
    s.setProperty('--co-size', `${Number(d.size) || 56}px`);
    s.setProperty('--co-font', fontStack(d.font));
    s.setProperty('--co-fw', d.bold ? '700' : '400');
    s.setProperty('--co-color', d.color || '#fff');
    s.setProperty('--co-fx', d.effectColor || '#fff');
    s.setProperty('--co-sub', d.subColor || d.color || '#fff');
    s.setProperty('--co-icon', d.iconColor || d.color || '#fff');
    // 縁取り:グラデーションの文字でもきれいに付くよう、上下左右の影を重ねて作る
    const sw = Number(d.strokeWidth) || 0;
    const sc = d.strokeColor || '#000';
    s.setProperty('--co-sf', sw > 0 ? `drop-shadow(${sw}px 0 0 ${sc}) drop-shadow(-${sw}px 0 0 ${sc}) drop-shadow(0 ${sw}px 0 ${sc}) drop-shadow(0 -${sw}px 0 ${sc})` : 'none');
    const g = [d.grad1 || '#fff', d.grad2 || '#ffd84a', d.grad3].filter(Boolean).join(', ');
    s.setProperty('--co-grad', `linear-gradient(${Number(d.gradAngle) || 0}deg, ${g})`);
    s.setProperty('--co-bg', d.boxImage ? d.boxImage : (d.boxColor || '#000'));
    s.setProperty('--co-bgc', hexToRgba(d.boxColor || '#000', clamp(d.boxAlpha == null ? 1 : Number(d.boxAlpha), 0, 1)));
    s.setProperty('--co-bg-a', String(clamp(d.boxAlpha == null ? 1 : Number(d.boxAlpha), 0, 1)));
    s.setProperty('--co-bc', d.borderColor || '#fff');
    s.setProperty('--co-bw', `${Number(d.borderWidth) || 0}px`);
    s.setProperty('--co-radius', `${Number(d.radius) || 0}px`);
    s.setProperty('--co-px', `${Number(d.padX) || 0}px`);
    s.setProperty('--co-py', `${Number(d.padY) || 0}px`);
    box.dataset.box = d.box || 'none';
    box.dataset.fill = d.fill === 'gradient' ? 'gradient' : 'solid';
    box.dataset.fx = d.effect || 'none';
    box.classList.toggle('co-shadow', !!d.shadow);
  };
  const chars = (t) => [...String(t || '')].map((ch, i) => (ch === ' ' ? '<span class="co-ch sp" style="--i:' + i + '"> </span>' : `<span class="co-ch" style="--i:${i}">${esc(ch)}</span>`)).join('');
  /** メッセージの中身(アイコン+文字)を作る */
  OV.calloutInner = (m) => {
    const ic = OV.CALLOUT_ICONS[m.icon] || OV.CALLOUT_ICONS.none;
    const icon = ic.html ? `<span class="co-icon an-${esc(m.iconAnim || 'none')} dir-${ic.dir || 'none'}" style="font-size:${(Number(m.iconSize) || 1) * 1.15}em">${ic.html}</span>` : '';
    return `${icon}<span class="co-texts"><span class="co-text">${chars(m.text)}</span>${m.sub ? `<span class="co-subt">${esc(m.sub)}</span>` : ''}</span>`;
  };

  // ---- 登場・退場 ----
  const KF = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    pop: [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.65 }, { opacity: 1, transform: 'scale(1)' }],
    bounceIn: [{ opacity: 0, transform: 'translateY(-160px)' }, { opacity: 1, transform: 'translateY(0)', offset: 0.55 }, { transform: 'translateY(-34px)', offset: 0.72 }, { transform: 'translateY(0)', offset: 0.86 }, { transform: 'translateY(-10px)', offset: 0.93 }, { transform: 'translateY(0)' }],
    slideUp: [{ opacity: 0, transform: 'translateY(140px)' }, { opacity: 1, transform: 'translateY(0)' }],
    slideDown: [{ opacity: 0, transform: 'translateY(-140px)' }, { opacity: 1, transform: 'translateY(0)' }],
    slideLeft: [{ opacity: 0, transform: 'translateX(220px)' }, { opacity: 1, transform: 'translateX(0)' }],
    slideRight: [{ opacity: 0, transform: 'translateX(-220px)' }, { opacity: 1, transform: 'translateX(0)' }],
    zoom: [{ opacity: 0, transform: 'scale(2.2)', filter: 'blur(8px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }],
    flip: [{ opacity: 0, transform: 'perspective(800px) rotateX(-90deg)' }, { opacity: 1, transform: 'perspective(800px) rotateX(0deg)' }],
    spin: [{ opacity: 0, transform: 'rotate(-200deg) scale(0)' }, { opacity: 1, transform: 'rotate(0deg) scale(1)' }],
    wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
    blur: [{ opacity: 0, filter: 'blur(20px)' }, { opacity: 1, filter: 'blur(0px)' }],
    type: [{ opacity: 1 }, { opacity: 1 }],
    none: null,
  };
  const KF_OUT = {
    fade: [{ opacity: 1 }, { opacity: 0 }],
    popOut: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.15)', offset: 0.3 }, { opacity: 0, transform: 'scale(0)' }],
    zoomOut: [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.5)' }],
    slideDown: [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(140px)' }],
    slideUp: [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-140px)' }],
    slideLeft: [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-220px)' }],
    slideRight: [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(220px)' }],
    flip: [{ opacity: 1, transform: 'perspective(800px) rotateX(0deg)' }, { opacity: 0, transform: 'perspective(800px) rotateX(90deg)' }],
    drop: [{ opacity: 1, transform: 'translateY(0) rotate(0deg)' }, { opacity: 0, transform: 'translateY(260px) rotate(8deg)' }],
    wipe: [{ clipPath: 'inset(0 0 0 0%)' }, { clipPath: 'inset(0 0 0 100%)' }],
    blur: [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(20px)' }],
    none: null,
  };
  OV.CALLOUT_ENTERS = [['pop', 'ポップ(弾んで出る)'], ['bounceIn', '上から落ちて跳ねる'], ['fade', 'フェード'], ['slideUp', '下からスライド'], ['slideDown', '上からスライド'], ['slideLeft', '右からスライド'], ['slideRight', '左からスライド'],
    ['zoom', '大きい所からズーム'], ['flip', 'くるっと回転(縦)'], ['spin', 'くるくる回って出る'], ['wipe', 'ワイプ'], ['blur', 'ぼかしから'], ['type', 'タイプライター(1文字ずつ)'], ['none', 'なし']];
  OV.CALLOUT_EXITS = [['fade', 'フェード'], ['popOut', 'ポップ(しぼむ)'], ['zoomOut', '小さくなって消える'], ['slideDown', '下へスライド'], ['slideUp', '上へスライド'], ['slideLeft', '左へスライド'], ['slideRight', '右へスライド'],
    ['flip', 'くるっと回転(縦)'], ['drop', '落ちる'], ['wipe', 'ワイプ'], ['blur', 'ぼかして消える'], ['none', 'なし']];
  OV.CALLOUT_EFFECTS = [['none', 'なし(シンプル)'], ['glow', '光る(グロー)'], ['neon', 'ネオン(ちらちら光る)'], ['sparkle', 'きらきら(星が舞う)'], ['shine', 'つやが流れる'], ['rainbow', '虹色に変わる'],
    ['pulse', 'ドクンと脈打つ'], ['float', 'ふわふわ浮く'], ['wave', '文字が波打つ'], ['shake', 'ときどき揺れる'], ['blink', '点滅']];
  OV.CALLOUT_ICON_ANIMS = [['bounce', '矢印の向きに弾む'], ['pulse', '大きくなったり小さく'], ['wiggle', 'ゆらゆら'], ['shake', 'ぷるぷる'], ['ring', 'ベルのように揺れる'], ['spin', '回る'], ['none', '動かない']];

  function play(e, el, frames, opt) {
    if (!frames || !el.animate) return null;
    const a = el.animate(frames, { fill: 'both', ...opt });
    e.anims.push(a);
    return a;
  }
  // きらきら:箱のまわりに星を出す
  function sparkle(e) {
    const r = e.box.getBoundingClientRect();
    const sr = e.stage.getBoundingClientRect();
    const k = sr.width / OV.W || 1;
    const w = r.width / k, h = r.height / k;
    if (!w) return;
    const st = document.createElement('span');
    st.className = 'co-star';
    st.textContent = Math.random() < 0.5 ? '✦' : '✧';
    const sz = 14 + Math.random() * 26;
    Object.assign(st.style, { left: `${(r.left - sr.left) / k + Math.random() * w}px`, top: `${(r.top - sr.top) / k + Math.random() * h}px`, fontSize: `${sz}px` });
    e.fxLayer.appendChild(st);
    setTimeout(() => st.remove(), 1300);
  }

  function cleanup(e) {
    e.anims.forEach((a) => { try { a.cancel(); } catch { /* ignore */ } });
    e.anims = [];
    clearInterval(e.sparkTimer);
    clearTimeout(e.hideTimer);
    e.layer.classList.remove('on');
    e.fxLayer.innerHTML = '';
    e.token = '';
    e.phase = '';
  }
  function fill(e, m) {
    const S = OV.state;
    const pl = (m.place || {})[OV.canvas] || { anchor: 'b', x: 0, y: 0, scale: 1 };
    Object.assign(e.pos.style, placeStyle(pl));
    OV.applyCalloutDesign(e.box, m.design || {});
    e.box.dataset.iconpos = m.iconPos || 'right';
    e.box.innerHTML = OV.calloutInner(m);
    e.box.classList.toggle('typing', m.enter === 'type');
    e.box.style.setProperty('--co-cps', `${Math.max(20, (m.enterMs || 700) / Math.max(1, [...String(m.text || '')].length))}ms`);
    clearInterval(e.sparkTimer);
    if ((m.design || {}).effect === 'sparkle') e.sparkTimer = setInterval(() => sparkle(e), 160);
    void S;
  }

  function render(e, S) {
    const p = OV.calloutLocal || S.calloutShow || {};
    if (!p.active) { if (e.token) cleanup(e); return; }
    const m = ((S.callout || {}).messages || []).find((x) => x.id === p.id);
    if (!m) { if (e.token) cleanup(e); return; }
    const sig = JSON.stringify([m, OV.canvas]);
    if (p.token !== e.token) {
      cleanup(e);
      e.token = p.token;
      e.phase = 'show';
      e.sig = sig;
      fill(e, m);
      e.layer.classList.add('on');
      play(e, e.anim, KF[m.enter] === undefined ? KF.pop : KF[m.enter], { duration: Math.max(1, m.enterMs), easing: m.enter === 'bounceIn' ? 'ease-out' : 'cubic-bezier(.2,.8,.2,1)' });
      return;
    }
    if (p.phase === 'out' && e.phase !== 'out') {
      e.phase = 'out';
      const kf = KF_OUT[m.exit] === undefined ? KF_OUT.fade : KF_OUT[m.exit];
      if (kf) play(e, e.anim, kf, { duration: Math.max(1, m.exitMs), easing: 'cubic-bezier(.6,0,.8,.4)' });
      e.hideTimer = setTimeout(() => { if (e.phase === 'out') { e.layer.classList.remove('on'); clearInterval(e.sparkTimer); } }, (kf ? m.exitMs : 0) + 50);
      return;
    }
    // 表示中に設定を変えた:演出をやり直さずに、見た目だけ変える(管理画面で調整しながら確認できる)
    if (sig !== e.sig && e.phase === 'show') { e.sig = sig; fill(e, m); e.box.classList.remove('typing'); }
  }

  const entries = [];
  OV.calloutRefresh = () => entries.forEach((e) => render(e, OV.state));
  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'co-layer';
      layer.innerHTML = '<div class="co-pos"><div class="co-anim"><div class="co-box"></div></div></div><div class="co-fxl"></div>';
      stage.appendChild(layer);
      const q = (s) => layer.querySelector(s);
      entries.push({ stage, layer, pos: q('.co-pos'), anim: q('.co-anim'), box: q('.co-box'), fxLayer: q('.co-fxl'), anims: [], token: '' });
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });
})();
