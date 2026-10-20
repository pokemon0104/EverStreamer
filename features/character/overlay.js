/* キャラクター(PNGtuber 方式):口パク・まばたき・呼吸・揺れ・コメントやアラートへの反応 */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const SLOTS = ['idle', 'talk', 'blink', 'happy'];
  const entries = [];
  const C = () => OV.raw.character || {};
  const V = () => OV.state.characterView || {};
  /** 画像の URL(sample: は同梱のサンプル) */
  OV.charImageUrl = (f) => (!f ? '' : f.startsWith('sample:') ? `/char-assets/${encodeURIComponent(f.slice(7))}` : `/char-uploads/${encodeURIComponent(f)}`);

  // ---- マイクの音量(OBS のマイク・管理画面のマイクで共通) ----
  /** マイクの音量を測る。onLevel(0〜1) を約 30 回/秒 呼ぶ。止めるときは返り値の stop() */
  OV.micMeter = async function (onLevel) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let alive = true;
    const tick = () => {
      if (!alive) return;
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3)); // 声の大きさ(RMS)を 0〜1 に
      setTimeout(tick, 33);
    };
    // 自動再生の制限で止まっているときは、画面に触れたときに動かす
    const resume = () => { if (ac.state === 'suspended') ac.resume().catch(() => {}); };
    resume();
    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('keydown', resume, true);
    tick();
    return {
      get suspended() { return ac.state === 'suspended'; },
      stop() { alive = false; document.removeEventListener('pointerdown', resume, true); document.removeEventListener('keydown', resume, true); stream.getTracks().forEach((t) => t.stop()); ac.close().catch(() => {}); },
    };
  };

  // ---- 描画 ----
  function build(e) {
    e.layer.innerHTML = `<div class="chr"><div class="chr-bubble"><span></span></div><div class="chr-motion"><div class="chr-sway"><div class="chr-hop"><div class="chr-bob">${SLOTS.map((s) => `<img class="chr-img" data-slot="${s}" alt="" draggable="false">`).join('')}</div></div></div></div></div>`;
    e.el = e.layer.querySelector('.chr');
    e.imgs = Object.fromEntries(SLOTS.map((s) => [s, e.layer.querySelector(`[data-slot="${s}"]`)]));
    e.bubble = e.layer.querySelector('.chr-bubble');
  }
  function face(e) {
    const c = C();
    const has = (s) => !!(c.images || {})[s];
    const now = performance.now();
    let f = 'idle';
    if (e.happyUntil > now && has('happy')) f = 'happy';
    else if (e.talking && has('talk')) f = 'talk';
    else if (e.blinking && has('blink')) f = 'blink';
    for (const s of SLOTS) e.imgs[s].classList.toggle('on', s === f);
    e.el.classList.toggle('talking', !!e.talking);
  }
  function render(e, S) {
    const c = S.character || {};
    const v = S.characterView || {};
    const on = !!c.enabled && v.show !== false;
    e.layer.style.display = on ? '' : 'none';
    if (!on) return;
    if (!e.el) build(e);
    const sig = JSON.stringify([c.images]);
    if (sig !== e.sig) {
      e.sig = sig;
      for (const s of SLOTS) { const u = OV.charImageUrl((c.images || {})[s]); if (u) e.imgs[s].src = u; else e.imgs[s].removeAttribute('src'); }
    }
    const h = clamp(Number(v.h) || 300, 40, 1800);
    Object.assign(e.el.style, { left: `${Number(v.x) || 0}px`, top: `${Number(v.y) || 0}px`, height: `${h}px`, width: `${h}px` });
    e.el.classList.toggle('flip', !!v.flip);
    e.el.classList.toggle('breathe', c.breathe !== false);
    e.el.classList.toggle('sway', !!c.sway);
    e.el.classList.toggle('bob', c.talkBounce !== false);
    face(e);
  }
  function hop(e, big) {
    const el = e.layer.querySelector('.chr-hop');
    if (!el) return;
    el.classList.remove('hop', 'hop-big');
    void el.offsetWidth;
    el.classList.add(big ? 'hop-big' : 'hop');
  }
  function say(e, text) {
    if (!text || !e.bubble) return;
    e.bubble.querySelector('span').textContent = text;
    e.bubble.classList.remove('on');
    void e.bubble.offsetWidth;
    e.bubble.classList.add('on');
    clearTimeout(e.bubbleT);
    e.bubbleT = setTimeout(() => e.bubble.classList.remove('on'), clamp(Number(C().bubbleSec) || 3.5, 1, 15) * 1000);
  }
  // コメントで口を動かす(マイクが使えないとき)
  function flap(e, ms) {
    clearInterval(e.flapT);
    const until = performance.now() + ms;
    e.flapT = setInterval(() => {
      if (performance.now() > until) { clearInterval(e.flapT); e.talking = false; face(e); return; }
      e.talking = !e.talking;
      face(e);
    }, 130);
  }
  // まばたき(2.5〜6秒ごと。ときどき2回)
  function scheduleBlink(e) {
    clearTimeout(e.blinkT);
    e.blinkT = setTimeout(() => {
      if (C().blink !== false && e.el) {
        const twice = Math.random() < 0.2;
        e.blinking = true; face(e);
        setTimeout(() => { e.blinking = false; face(e); }, 130);
        if (twice) setTimeout(() => { e.blinking = true; face(e); setTimeout(() => { e.blinking = false; face(e); }, 120); }, 280);
      }
      scheduleBlink(e);
    }, 2500 + Math.random() * 3500);
  }

  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'chr-layer';
      stage.appendChild(layer);
      const e = { stage, layer, sig: '', talking: false, blinking: false, happyUntil: 0 };
      entries.push(e);
      scheduleBlink(e);
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });

  // ---- 反応・口の開け閉め(サーバーから) ----
  OV.onMessage('character:react', (p) => {
    for (const e of entries) {
      if (!e.el || !e.stage.isConnected) continue;
      if (p.action === 'happy') { e.happyUntil = performance.now() + (p.big ? 2600 : 1600); setTimeout(() => face(e), p.big ? 2650 : 1650); }
      if (p.action !== 'none') hop(e, p.big || p.action === 'happy');
      if (p.bubble) say(e, OV.t(p.bubble).replace('{name}', p.name || ''));
      if (p.talk) flap(e, 1400);
      face(e);
    }
  });
  OV.charSetTalking = (on) => {
    for (const e of entries) { if (e.talking !== on) { e.talking = on; if (e.el) face(e); } }
  };
  OV.onMessage('character:talk', (p) => {
    const c = C();
    if (c.mouth !== 'admin' && !(p && p.button)) return;
    OV.charSetTalking(!!p.on);
  });

  // ---- OBS のマイクで口パク(ブラウザソースでマイクの許可が必要) ----
  if (OV.role === 'overlay') {
    let mic = null;
    let starting = false;
    let lastLoud = 0;
    const want = () => { const c = C(); return c.enabled && c.mouth === 'overlay'; };
    const sync = async () => {
      if (want() && !mic && !starting) {
        starting = true;
        try {
          mic = await OV.micMeter((lv) => {
            const c = C();
            const now = performance.now();
            if (lv >= (Number(c.threshold) || 0.06)) lastLoud = now;
            OV.charSetTalking(now - lastLoud < (Number(c.hold) || 160));
          });
        } catch (err) {
          console.warn('[character] マイクを使えません:', err && err.name);
        }
        starting = false;
      } else if (!want() && mic) { mic.stop(); mic = null; OV.charSetTalking(false); }
    };
    OV.onMessage('core:init', () => setTimeout(sync, 300));
    OV.onMessage('core:section', (p) => { if (p && p.key === 'character') setTimeout(sync, 50); });
  }
  void esc;
})();
