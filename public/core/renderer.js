/* 描画エンジン:オーバーレイと管理画面プレビューで同じものを使う(見た目が必ず一致する) */
(function () {
  'use strict';
  const { fontStack, hexToRgba } = OV.util;

  // ---------- 見た目(look)→ CSS ----------
  function textShadow(L) {
    const parts = [];
    const sw = Number(L.strokeWidth) || 0;
    if (sw > 0) {
      const n = sw > 3 ? 24 : 16;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        parts.push(`${(Math.cos(a) * sw).toFixed(2)}px ${(Math.sin(a) * sw).toFixed(2)}px 0 ${L.strokeColor}`);
      }
    }
    if (L.textShadow) parts.push(L.textShadow);
    const g = Number(L.glowStrength) || 0;
    if (g > 0) parts.push(`0 0 ${g}px ${L.glowColor}`, `0 0 ${g * 2.2}px ${L.glowColor}`);
    return parts.length ? parts.join(',') : 'none';
  }
  function frameOutset(L) {
    if (L.frame !== 'pixel') return 0;
    return (Number(L.borderWidth) || 0) * ((Number(L.pixelSteps) || 1) >= 2 ? 2 : 1);
  }
  function boxShadow(L) {
    const s = [];
    const bw = Number(L.borderWidth) || 0;
    if (L.frame === 'pixel' && bw > 0) {
      // 角が欠けたピクセル枠(box-shadow を上下左右にずらして作る)
      const c = L.borderColor;
      const p = bw;
      s.push(`0 -${p}px 0 0 ${c}`, `0 ${p}px 0 0 ${c}`, `-${p}px 0 0 0 ${c}`, `${p}px 0 0 0 ${c}`);
      if ((Number(L.pixelSteps) || 1) >= 2) {
        s.push(`0 -${2 * p}px 0 -${p}px ${c}`, `0 ${2 * p}px 0 -${p}px ${c}`, `-${2 * p}px 0 0 -${p}px ${c}`, `${2 * p}px 0 0 -${p}px ${c}`);
      }
    }
    if (L.insetColor) s.push(`inset 0 0 0 ${Number(L.insetWidth) || 3}px ${L.insetColor}`);
    if (L.bevel) s.push('inset 3px 3px 0 rgba(255,255,255,.35)', 'inset -3px -3px 0 rgba(0,0,0,.45)');
    if (L.innerShadow) s.push(L.innerShadow);
    const blur = Number(L.shadowBlur) || 0;
    const y = Number(L.shadowY) || 0;
    if (blur > 0 || y > 0) s.push(`0 ${y}px ${blur}px ${hexToRgba(L.shadowColor, L.shadowAlpha == null ? 0.6 : L.shadowAlpha)}`);
    return s.length ? s.join(',') : 'none';
  }
  function applyLook(node, L) {
    const w = node.wrap.style;
    const px = (v, d) => `${Number(v == null ? d : v)}px`;
    w.setProperty('--fs-h', px(L.headingSize, 26));
    w.setProperty('--fs-b', px(L.bodySize, 20));
    w.setProperty('--fs-n', px(L.numberSize, 56));
    w.setProperty('--lh', String(Number(L.lineHeight) || 1.4));
    w.setProperty('--ls', `${Number(L.letterSpacing) || 0}em`);
    w.setProperty('--pad', px(L.padding, 16));
    w.setProperty('--font', fontStack(L.font));
    w.setProperty('--hfont', fontStack(L.headingFont || L.font));
    w.setProperty('--nfont', fontStack(L.numberFont || L.headingFont || L.font));
    w.setProperty('--fw', L.bold ? '700' : '400');
    w.setProperty('--c-text', L.textColor || '#fff');
    w.setProperty('--c-head', L.headingColor || L.textColor || '#fff');
    w.setProperty('--c-num', L.numberColor || L.headingColor || '#fff');
    w.setProperty('--tshadow', textShadow(L));
    w.setProperty('--radius', px(L.radius, 0));
    w.setProperty('--outset', `${frameOutset(L)}px`);
    w.setProperty('--bg', L.bgImage ? L.bgImage : (L.bgColor || 'transparent'));
    w.setProperty('--bg-a', String(L.bgAlpha == null ? 1 : L.bgAlpha));
    w.setProperty('--scan-a', String(L.scanlineAlpha == null ? 0.25 : L.scanlineAlpha));
    const b = node.box.style;
    const bw = Number(L.borderWidth) || 0;
    b.border = (L.frame === 'pixel' || !L.borderStyle || L.borderStyle === 'none' || bw <= 0)
      ? 'none' : `${bw}px ${L.borderStyle} ${L.borderColor}`;
    b.boxShadow = boxShadow(L);
    node.box.classList.toggle('has-scan', !!L.scanlines);
    // ゲーム枠と同じデザインのスタイル:パネルの縁の内側に、枠と同じ帯を描く
    let gf = node.box.querySelector(':scope > .ov-gframe');
    if (L.gameFrame && OV.frameDecorate) {
      if (!gf) { gf = document.createElement('div'); gf.className = 'ov-gframe'; node.box.appendChild(gf); }
      const key = JSON.stringify([L.gameFrame, L.gfScale, L.radius, L.gfSig, (OV.catalogs.gameFrames || []).length]);
      if (gf.dataset.key !== key) { gf.dataset.key = key; OV.frameDecorate(gf, L.gameFrame, Number(L.gfScale) || 1, Number(L.radius) || 0); }
    } else if (gf) gf.remove();
    node.wrap.dataset.frame = L.frame || 'plain';
    node.wrap.classList.toggle('is-tpl', !!L.tpl && L.tplDeco !== false); // テンプレートの飾り(テンプレートの CSS が使う)
  }

  // ---------- 見出しを枠線の上に重ねる(ウィンドウ風) ----------
  // パネルの最初の見出し(.ov-h)を、枠線の上に乗せたラベル(.ov-legend)に写す。元の見出しは隠す
  function legendBg(L) {
    const mode = L.borderTitleBgMode || 'auto';
    if (mode === 'none') return 'transparent';
    if (mode === 'color' && L.borderTitleBgColor) return L.borderTitleBgColor;
    // 自動:背景色(グラデーションなら最初の色)で、枠線を切り取ったように見せる
    const m = L.bgImage ? /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/i.exec(L.bgImage) : null;
    return m ? m[0] : (L.bgColor || '#000000');
  }
  function legendSource(n) {
    if (n.type === 'group') return null;
    for (const el of n.content.querySelectorAll('.ov-h')) {
      if (el.closest('.ov-content') === n.content) return el;
    }
    return null;
  }
  function syncLegend(n, L) {
    if (L) n.legendLook = L;
    L = n.legendLook || {};
    const w = n.wrap;
    const src = L.borderTitle && !w.classList.contains('is-ghost') ? legendSource(n) : null;
    if (!src) {
      if (w.classList.contains('has-legend')) w.classList.remove('has-legend');
      n.content.querySelectorAll('.is-lg-src').forEach((el) => el.classList.remove('is-lg-src'));
      return false;
    }
    let lg = n.legend;
    if (!lg) { lg = document.createElement('div'); lg.className = 'ov-legend'; w.appendChild(lg); n.legend = lg; }
    if (!src.classList.contains('is-lg-src')) src.classList.add('is-lg-src');
    if (lg.innerHTML !== src.innerHTML) lg.innerHTML = src.innerHTML;
    if (!w.classList.contains('has-legend')) w.classList.add('has-legend');
    const bw = Number(L.borderWidth) || 0;
    const pixel = L.frame === 'pixel';
    const cssBorder = !pixel && L.borderStyle && L.borderStyle !== 'none' && bw > 0;
    const out = frameOutset(L);
    // 枠線の太さの中心(パネルの箱の上端からの距離)。ピクセル枠は箱の外側に描かれる
    const bc = pixel ? -out / 2 : (cssBorder ? bw / 2 : 0);
    const s = w.style;
    s.setProperty('--lg-bc', `${bc}px`);
    s.setProperty('--lg-off', `${pixel ? out / 2 : (cssBorder ? bw / 2 : 0)}px`);
    s.setProperty('--lg-inset', `${Number(L.borderTitleInset == null ? 24 : L.borderTitleInset)}px`);
    s.setProperty('--lg-scale', String(Number(L.borderTitleScale) || 1));
    s.setProperty('--lg-bg', legendBg(L));
    s.setProperty('--lg-padx', `${Number(L.borderTitlePad == null ? 0.4 : L.borderTitlePad)}em`);
    w.dataset.lgAlign = L.borderTitleAlign || 'left';
    return true;
  }

  // ---------- 配置 ----------
  const PLACE_PROPS = ['position', 'left', 'top', 'width', 'height', 'flex', 'alignSelf', 'minHeight', 'minWidth', 'maxWidth'];
  function applyPlacement(el, p, mode) {
    const s = el.style;
    PLACE_PROPS.forEach((k) => { s[k] = ''; });
    if (mode === 'free') {
      s.position = 'absolute';
      s.left = `${p.x}px`;
      s.top = `${p.y}px`;
      s.width = `${p.w}px`;
      if (p.heightMode === 'fixed') s.height = `${p.h}px`;
    } else if (mode === 'col') {
      if (p.fill) { s.flex = '1 1 0px'; s.minHeight = `${p.fillMin || 120}px`; }
      else if (p.heightMode === 'fixed') { s.flex = `0 0 ${p.h}px`; s.minHeight = '0'; }
      else s.flex = '0 0 auto';
      if (p.widthMode === 'fixed') { s.width = `${p.w}px`; s.maxWidth = '100%'; s.alignSelf = 'center'; }
    } else if (mode === 'row') {
      if (p.widthMode === 'fixed') s.flex = `0 0 ${p.w}px`;
      else s.flex = p.fill ? '1.4 1 0px' : '1 1 0px';
      s.minWidth = '0';
      if (p.heightMode === 'fixed') { s.height = `${p.h}px`; s.alignSelf = 'flex-end'; }
    } else if (mode === 'inGroup') {
      s.flex = '1 1 0px';
      s.minWidth = '0';
      s.minHeight = '0';
    }
  }
  function containerRect(c) {
    let x = Number(c.x) || 0;
    let y = Number(c.y) || 0;
    const w = Number(c.w) || 460;
    const h = Number(c.h) || OV.H;
    if (c.dock === 'right') x = OV.W - w;
    else if (c.dock === 'left') x = 0;
    else if (c.dock === 'bottom') y = OV.H - h;
    else if (c.dock === 'top') y = 0;
    return { x, y, w, h };
  }
  OV.containerRect = containerRect;
  OV.avatarRect = (layout) => {
    const a = (layout && layout.avatar) || {};
    const w = Math.min(OV.W, Math.max(40, Number(a.w) || 420));
    const h = Math.min(OV.H, Math.max(40, Number(a.h) || 420));
    return { x: a.side === 'left' ? 0 : OV.W - w, y: OV.H - h, w, h, show: a.show !== false, side: a.side === 'left' ? 'left' : 'right' };
  };
  /** パネルのグループ:中に入っているパネルの ID → グループの ID(1つのパネルは最初のグループにだけ入る) */
  OV.groupMap = (panels) => {
    const list = panels || [];
    const ids = new Set(list.map((p) => p.id));
    const isGroup = new Set(list.filter((p) => p.type === 'group').map((p) => p.id));
    const m = new Map();
    for (const g of list) {
      if (g.type !== 'group') continue;
      for (const id of ((g.data || {}).members || [])) if (ids.has(id) && !isGroup.has(id) && !m.has(id)) m.set(id, g.id);
    }
    return m;
  };
  /** そのパネルが入っているグループ(なければ null) */
  OV.groupOf = (id, panels) => {
    const list = panels || OV.state.panels || [];
    const gid = OV.groupMap(list).get(id);
    return gid ? list.find((p) => p.id === gid) : null;
  };
  OV.rectsOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  function syncChildren(parent, els) {
    els.forEach((el, i) => {
      if (parent.children[i] !== el) parent.insertBefore(el, parent.children[i] || null);
    });
    while (parent.children.length > els.length) parent.removeChild(parent.lastChild);
  }
  const overflows = (el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;

  // ---------- 本体 ----------
  OV.createRenderer = function (stage, opts = {}) {
    stage.classList.add('ov-stage');
    if (opts.editor) stage.classList.add('is-editor'); // 管理画面のプレビュー
    stage.dataset.canvas = OV.canvas;
    stage.style.width = `${OV.W}px`;
    stage.style.height = `${OV.H}px`;
    const container = document.createElement('div');
    container.className = 'ov-container';
    const freeLayer = document.createElement('div');
    freeLayer.className = 'ov-free';
    stage.append(container, freeLayer);
    for (const l of OV.layers) if (l.mount) l.mount(stage);

    const nodes = new Map();
    const groups = new Map();
    const afterFit = [];
    let rendered = false;
    let fitRaf = 0;
    let lastCfit = 1;

    function queueFit() {
      if (fitRaf) return;
      fitRaf = requestAnimationFrame(() => {
        fitRaf = 0;
        fitAll();
        syncGroupFit();
        afterFit.forEach((f) => f());
      });
    }

    function createNode(p) {
      const wrap = document.createElement('div');
      wrap.className = p.type === 'group' ? 'ov-panel ov-pgroup' : 'ov-panel';
      wrap.dataset.id = p.id;
      const box = document.createElement('div');
      box.className = 'ov-box';
      const content = document.createElement('div');
      content.className = 'ov-content';
      const glint = document.createElement('div');
      glint.className = 'ov-glint';
      box.append(content, glint);
      wrap.append(box);
      return { id: p.id, wrap, box, content, glint, sig: '', visible: null, type: p.type, fresh: true };
    }

    function shine(node) {
      node.glint.classList.remove('play');
      void node.glint.offsetWidth;
      node.glint.classList.add('play');
    }

    function setVisible(node, p, animate) {
      const visible = p.visible !== false && !(OV.panelHiders || []).some((fn) => { try { return fn(p); } catch (e) { return false; } });
      if (node.visible === visible) return;
      node.visible = visible;
      clearTimeout(node.visTimer);
      const w = node.wrap;
      w.dataset.anim = (p.anim && p.anim.type) || 'fade';
      w.style.setProperty('--anim-ms', `${(p.anim && p.anim.ms) || 350}ms`);
      if (!animate || w.dataset.anim === 'none') {
        w.classList.toggle('is-hidden', !visible);
        w.classList.toggle('is-gone', !visible);
        updateGroupVisibility();
        return;
      }
      if (visible) {
        w.classList.remove('is-gone');
        updateGroupVisibility();
        void w.offsetWidth;
        w.classList.remove('is-hidden');
        if (w.dataset.anim === 'shine' || w.dataset.anim === 'pop') shine(node);
      } else {
        w.classList.add('is-hidden');
        node.visTimer = setTimeout(() => {
          w.classList.add('is-gone');
          updateGroupVisibility();
          queueFit();
        }, (p.anim && p.anim.ms) || 350);
      }
      queueFit();
    }
    function updateGroupVisibility() {
      for (const g of groups.values()) {
        const kids = [...g.children];
        g.classList.toggle('is-gone', kids.length > 0 && kids.every((k) => k.classList.contains('is-gone')));
      }
      // パネルのグループ:中のパネルがすべて非表示なら、グループごと詰める
      for (const n of nodes.values()) {
        if (n.type !== 'group') continue;
        const kids = [...n.content.children];
        n.wrap.classList.toggle('is-empty', kids.every((k) => k.classList.contains('is-gone')));
      }
    }

    function render() {
      const S = OV.state;
      if (!Array.isArray(S.panels)) return;
      const layout = S.layout || {};
      const c = layout.container || {};
      stage.style.setProperty('--gs', String(layout.globalScale || 1));

      const r = containerRect(c);
      const cs = container.style;
      cs.left = `${r.x}px`;
      cs.top = `${r.y}px`;
      cs.width = `${r.w}px`;
      cs.height = `${r.h}px`;
      cs.padding = `${c.margin == null ? 16 : c.margin}px`;
      cs.setProperty('--gap', `${c.gap == null ? 12 : c.gap}px`);
      cs.display = c.enabled === false ? 'none' : '';
      const dir = c.direction === 'row' ? 'row' : 'col';
      container.dataset.dir = dir;

      const seen = new Set();
      let dirty = false;
      const gmap = OV.groupMap(S.panels);
      const byId = new Map(S.panels.map((p) => [p.id, p]));
      const getNode = (p) => {
        let n = nodes.get(p.id);
        if (!n || n.type !== p.type) {
          if (n) n.wrap.remove();
          n = createNode(p);
          nodes.set(p.id, n);
        }
        seen.add(p.id);
        return n;
      };
      const update = (n, p) => {
        const L = OV.effectiveLook(p);
        const t = OV.panelTypes[p.type];
        const deps = t && t.deps ? t.deps(S, p) : null;
        const sig = JSON.stringify([p.data, p.name, L, deps, p.type, window.I18N ? I18N.lang : '']);
        if (sig !== n.sig) {
          const prev = n.sig;
          n.sig = sig;
          applyLook(n, L);
          n.content.className = `ov-content t-${p.type}`;
          if (t && t.render) {
            t.render(n.content, p, { queueFit, look: L, state: S });
            if (prev && t.shouldShine && t.shouldShine(p, S, n)) shine(n);
          } else {
            n.content.textContent = OV.t(`(未対応のパネル: ${p.type})`);
          }
          // 「演出だけ」「空きスペース」など、枠も背景も出さないパネル
          n.wrap.classList.toggle('is-ghost', !!(n.content.firstElementChild && n.content.firstElementChild.classList.contains('ov-ghost')));
          syncLegend(n, L);
          n.content.querySelectorAll('img').forEach((img) => {
            if (!img.complete) img.addEventListener('load', queueFit, { once: true });
          });
          dirty = true;
        }
        if (p.type === 'group') layoutGroup(n, p);
        setVisible(n, p, rendered && !n.fresh);
        n.fresh = false;
      };
      // グループの中に、パネルを横一列に並べる(高さはそろう。幅は比率で分ける)
      const layoutGroup = (n, g) => {
        const d = g.data || {};
        n.content.style.setProperty('--pg-gap', `${Math.max(0, Number(d.gap == null ? 12 : d.gap))}px`);
        const kids = (d.members || []).filter((id) => gmap.get(id) === g.id).map((id) => {
          const m = byId.get(id);
          const mn = getNode(m);
          applyPlacement(mn.wrap, m, 'inGroup');
          const r = Number((d.ratios || {})[id]);
          mn.wrap.style.flex = `${r > 0 ? r : 1} 1 0px`;
          update(mn, m);
          return mn.wrap;
        });
        syncChildren(n.content, kids);
      };

      // サイドバー内の並び(横並び指定はグループにまとめる)
      const cps = S.panels.filter((p) => p.placement !== 'free' && !gmap.has(p.id));
      const items = [];
      for (let i = 0; i < cps.length; i++) {
        const p = cps[i];
        const next = cps[i + 1];
        if (p.pairWithNext && next && !p.fill && !next.fill) { items.push({ group: [p, next] }); i++; }
        else items.push({ panel: p });
      }
      const usedGroups = new Set();
      const contEls = items.map((it) => {
        if (it.panel) {
          const n = getNode(it.panel);
          applyPlacement(n.wrap, it.panel, dir);
          update(n, it.panel);
          return n.wrap;
        }
        const key = `g_${it.group[0].id}`;
        usedGroups.add(key);
        let g = groups.get(key);
        if (!g) { g = document.createElement('div'); g.className = 'ov-group'; groups.set(key, g); }
        applyPlacement(g, { ...it.group[0], fill: false }, dir);
        const kids = it.group.map((p) => {
          const n = getNode(p);
          applyPlacement(n.wrap, p, 'inGroup');
          update(n, p);
          return n.wrap;
        });
        syncChildren(g, kids);
        return g;
      });
      const freeEls = S.panels.filter((p) => p.placement === 'free' && !gmap.has(p.id)).map((p) => {
        const n = getNode(p);
        applyPlacement(n.wrap, p, 'free');
        update(n, p);
        return n.wrap;
      });
      syncChildren(freeLayer, freeEls);
      syncChildren(container, contEls);
      for (const [k, g] of groups) if (!usedGroups.has(k)) { g.remove(); groups.delete(k); }
      for (const [id, n] of nodes) if (!seen.has(id)) { n.wrap.remove(); nodes.delete(id); dirty = true; }
      updateGroupVisibility();

      for (const l of OV.layers) if (l.update) l.update(S, stage);
      rendered = true;
      // 配置が変わっただけでも収まり具合が変わるので毎回測り直す(軽量)
      queueFit();
      return dirty;
    }

    // ---------- はみ出し防止 ----------
    function fitPanel(n) {
      const t = OV.panelTypes[n.type] || {};
      const w = n.wrap;
      w.style.setProperty('--fit', '1');
      if (t.layoutFit) t.layoutFit(n.content);
      if (t.noFit || !overflows(n.content)) return;
      let lo = 0.3;
      let hi = 1;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        w.style.setProperty('--fit', mid.toFixed(4));
        if (t.layoutFit) t.layoutFit(n.content);
        if (overflows(n.content)) hi = mid; else lo = mid;
      }
      w.style.setProperty('--fit', lo.toFixed(4));
      if (t.layoutFit) t.layoutFit(n.content);
    }
    function fitAll() {
      container.style.setProperty('--cfit', '1');
      container.classList.remove('squeeze');
      for (const n of nodes.values()) if (n.visible) fitPanel(n);
      lastCfit = 1;
      if (container.style.display === 'none' || !overflows(container)) return;
      // サイドバー全体に収まらない場合は、サイドバー内の文字を一律で縮小する
      const inside = [...nodes.values()].filter((n) => n.visible && container.contains(n.wrap));
      const tryScale = (k) => {
        container.style.setProperty('--cfit', k.toFixed(4));
        // 各パネルの縮小率も、この倍率で測り直してから判定する(測定と実際の描画を一致させる)
        for (const n of inside) fitPanel(n);
        return !overflows(container);
      };
      let lo = 0.35;
      let hi = 1;
      if (!tryScale(lo)) container.classList.add('squeeze'); // それでも無理なら伸縮パネルの最小高さを解除
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        if (tryScale(mid)) lo = mid; else hi = mid;
      }
      // 最終確認:それでもはみ出す場合はさらに一段階縮める
      let k = lo;
      while (!tryScale(k) && k > 0.2) k -= 0.02;
      lastCfit = k;
    }

    // グループの中のパネルは、文字の縮小率をそろえる(数字の大きさがそろう)
    function syncGroupFit() {
      const S = OV.state;
      for (const n of nodes.values()) {
        if (n.type !== 'group') continue;
        const g = (S.panels || []).find((p) => p.id === n.id);
        if (!g || (g.data || {}).syncSize === false) continue;
        const kids = [...n.content.children].filter((k) => !k.classList.contains('is-gone'));
        if (kids.length < 2) continue;
        const fits = kids.map((k) => parseFloat(k.style.getPropertyValue('--fit')) || 1);
        const min = Math.min(...fits);
        kids.forEach((k, i) => {
          if (fits[i] === min) return;
          k.style.setProperty('--fit', min.toFixed(4));
          const kn = nodes.get(k.dataset.id);
          const t = kn && OV.panelTypes[kn.type];
          if (t && t.layoutFit) t.layoutFit(kn.content);
        });
      }
    }

    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', queueFit);
      if (document.fonts.ready) document.fonts.ready.then(queueFit);
    }
    const tick = setInterval(() => {
      for (const fn of OV.tickers) fn(stage);
      for (const n of nodes.values()) if (n.legendLook && n.legendLook.borderTitle) syncLegend(n);
    }, 500);

    return {
      stage,
      container,
      freeLayer,
      render,
      queueFit,
      onAfterFit: (fn) => afterFit.push(fn),
      nodeEl: (id) => (nodes.get(id) || {}).wrap,
      get containerScale() { return lastCfit; },
      destroy() { clearInterval(tick); },
      /** 表示中の文字で一番小さいサイズ(px) */
      minFontSize() {
        let min = Infinity;
        stage.querySelectorAll('.ov-panel:not(.is-gone) .ov-content *').forEach((el) => {
          if (el.closest('[aria-hidden="true"], .ov-ghost, .cb-wait, .gl-empty')) return; // 管理画面だけの案内は数えない
          let hasText = false;
          for (const ch of el.childNodes) if (ch.nodeType === 3 && ch.textContent.trim()) { hasText = true; break; }
          if (!hasText) return;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          if (fs && fs < min) min = fs;
        });
        return Number.isFinite(min) ? min : 0;
      },
    };
  };
})();
