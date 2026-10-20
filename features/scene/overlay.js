/* 場面(開始待機・休憩・終了):画面全体を、テンプレートのデザインでおおう */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const entries = [];

  /** いま表示する場面(管理画面の「プレビューだけで見る」が優先) */
  OV.sceneNow = () => OV.sceneLocal || ((OV.state.scene || {}).current) || 'live';
  const pad = (n) => String(n).padStart(2, '0');
  function countText(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(t % 60)}` : `${pad(m)}:${pad(t % 60)}`;
  }
  // 背景の動き:CSS だけで描く軽いもの(重いぼかしは使わない)
  function fxHtml(fx) {
    const r = (a, b) => (a + Math.random() * (b - a)).toFixed(2);
    if (fx === 'orbs') return [0, 1, 2, 3].map((i) => `<i class="sc-orb o${i}"></i>`).join('');
    if (fx === 'grid') return '<i class="sc-grid"></i><i class="sc-horizon"></i>';
    if (fx === 'particles') return Array.from({ length: 34 }, () => `<i class="sc-pt" style="left:${r(0, 100)}%;--s:${r(3, 9)}px;--d:${r(7, 16)}s;--dl:-${r(0, 16)}s;--x:${r(-60, 60)}px"></i>`).join('');
    if (fx === 'waves') return '<i class="sc-wave w1"></i><i class="sc-wave w2"></i><i class="sc-wave w3"></i>';
    if (fx === 'lines') return Array.from({ length: 7 }, (_, i) => `<i class="sc-line" style="top:${8 + i * 13}%;--d:${r(3, 6)}s;--dl:-${r(0, 6)}s"></i>`).join('');
    return '';
  }
  function socialHtml() {
    const pr = OV.state.profile || {};
    const items = (OV.SNS || []).filter((s) => (pr.sns || {})[s.id]);
    if (!items.length) return '';
    return `<div class="sc-social">${items.map((s) => `<span class="sc-sn"><i>${s.icon}</i>${esc(OV.snsText ? OV.snsText(s, pr.sns[s.id], true) : pr.sns[s.id])}</span>`).join('')}</div>`;
  }
  function gameHtml() {
    const g = OV.state.game || {};
    if (g.method === 'logo' && g.logo) return `<div class="sc-game"><img src="/logos/${encodeURIComponent(g.logo)}" alt=""></div>`;
    if (!g.title) return '';
    return `<div class="sc-game"><span class="sc-gk">${esc(OV.t('NOW PLAYING'))}</span><span class="sc-gt">${esc(g.title)}</span></div>`;
  }

  // 文字を、横幅に収まる大きさにする
  function fit(e) {
    const t = e.layer.querySelector('.sc-title');
    if (!t) return;
    t.style.setProperty('--tk', '1');
    const wrap = t.parentElement;
    const cs = getComputedStyle(wrap);
    const max = (wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * 0.98;
    const w = t.scrollWidth || 1;
    if (w > max) t.style.setProperty('--tk', (max / w).toFixed(3));
  }

  function build(e, S, id) {
    const sc = S.scene || {};
    const cfg = sc[id] || {};
    const tpl = OV.template ? OV.template() : null;
    const ts = (tpl && tpl.scene) || {};
    const fx = sc.fx && sc.fx !== 'auto' ? sc.fx : (ts.fx || 'orbs');
    const photo = cfg.bgType === 'upload' && !!cfg.bgFile;
    e.layer.classList.toggle('sc-photo', photo); // 自分の画像の上では、文字を白にする
    const look = OV.lookById ? OV.lookById('tpl', photo) : null;
    const title = look && OV.titleTextHtml ? OV.titleTextHtml(cfg.title || '', look) : esc(cfg.title || '');
    const hasCount = (id === 'starting' || id === 'brb') && sc.endsAt > 0;
    const bg = (OV.tplValue && (OV.tplValue('scene', tpl) || {}).bg) || (OV.tplValue && OV.tplValue('background', tpl)) || '#000';
    e.layer.dataset.scene = id;
    e.layer.dataset.fx = fx;
    e.layer.dataset.layout = ts.layout || 'center';
    e.layer.innerHTML = `<div class="sc-bg"></div><div class="sc-fx">${fxHtml(fx)}</div>
      <div class="sc-wrap">
        ${cfg.kicker ? `<div class="sc-kicker"><span>${esc(cfg.kicker)}</span></div>` : ''}
        <div class="sc-title">${title}</div>
        ${cfg.sub ? `<div class="sc-sub">${esc(cfg.sub)}</div>` : ''}
        ${hasCount ? '<div class="sc-count"><div class="sc-num" data-count>--:--</div><div class="sc-prog"><i data-prog></i></div></div>' : ''}
        ${id === 'ending' && cfg.next ? `<div class="sc-next">${esc(cfg.next)}</div>` : ''}
        <div class="sc-foot">${sc.showGame !== false && id !== 'ending' ? gameHtml() : ''}${sc.showSocial !== false ? socialHtml() : ''}</div>
      </div>`;
    const bgEl = e.layer.querySelector('.sc-bg');
    if (cfg.bgType === 'upload' && cfg.bgFile) {
      // 自分の画像・動画(上に暗幕を重ねて、文字を読みやすくする)
      if (OV.isVideoFile && OV.isVideoFile(cfg.bgFile)) { bgEl.style.background = '#000'; OV.setBgVideo(bgEl, cfg.bgFile); } else {
        Object.assign(bgEl.style, { background: `#000 url("/bg-uploads/${encodeURIComponent(cfg.bgFile)}") center / cover no-repeat` });
      }
      const dim = document.createElement('div');
      dim.className = 'sc-dim';
      dim.style.opacity = String(clamp(Number(cfg.bgDim) || 0, 0, 0.9));
      bgEl.appendChild(dim);
    } else bgEl.style.background = bg;
    fit(e);
    setTimeout(() => fit(e), 200);
    setTimeout(() => fit(e), 1200);
    tick(e);
  }
  function tick(e) {
    const S = OV.state.scene || {};
    const n = e.layer.querySelector('[data-count]');
    if (!n) return;
    const left = (S.endsAt || 0) - Date.now();
    const cfg = S[OV.sceneNow()] || {};
    if (left <= 0) { n.textContent = cfg.doneText || OV.t('まもなく始まります'); n.classList.add('done'); } else { n.textContent = countText(left); n.classList.remove('done'); }
    const pg = e.layer.querySelector('[data-prog]');
    if (pg) {
      const total = Math.max(1, (S.endsAt || 0) - (S.startAt || 0));
      pg.style.width = `${clamp(100 - (left / total) * 100, 0, 100).toFixed(2)}%`;
    }
  }

  function render(e, S) {
    const id = OV.sceneNow();
    const on = id !== 'live';
    const fadeMs = Number((S.scene || {}).fadeMs);
    e.layer.style.setProperty('--sc-fade', `${Number.isFinite(fadeMs) ? fadeMs : 800}ms`);
    e.stage.classList.toggle('sc-on', on);
    if (!on) {
      if (e.key) {
        e.key = '';
        e.layer.classList.remove('on');
        clearTimeout(e.clear);
        e.clear = setTimeout(() => { if (!e.key) e.layer.innerHTML = ''; }, (Number.isFinite(fadeMs) ? fadeMs : 800) + 100);
      }
      return;
    }
    const sc = S.scene || {};
    const key = JSON.stringify([id, sc[id], sc.endsAt > 0, sc.fx, sc.showGame, sc.showSocial, S.theme, S.profile, (S.game || {}).title, (S.game || {}).logo, (S.game || {}).method, (OV.catalogs.templates || []).length, window.I18N && I18N.lang, OV.canvas]);
    if (key === e.key) { tick(e); return; }
    const wasOn = !!e.key;
    e.key = key;
    clearTimeout(e.clear);
    build(e, S, id);
    if (!wasOn) { void e.layer.offsetWidth; }
    e.layer.classList.add('on');
  }

  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'sc-layer';
      stage.appendChild(layer);
      entries.push({ stage, layer, key: '' });
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });
  OV.onTick(() => entries.forEach((e) => { if (e.key) tick(e); }));
  /** 管理画面の「プレビューだけで見る」を切り替えたあとに描き直す */
  OV.sceneRefresh = () => entries.forEach((e) => { e.key = e.key ? 'x' : ''; render(e, OV.state); });
})();
