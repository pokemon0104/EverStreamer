/* 管理画面の土台:接続・状態の反映・タブ/インスペクタの登録口・送信(楽観的更新) */
(function () {
  'use strict';
  const { h } = UI;
  const { clone, deepMerge, mergePatch } = OV.util;

  const ADM = (window.ADM = {
    tabs: [],
    inspectors: {},
    topbars: [],
    listeners: {},
    selectedId: null,
    activeTab: 'quick',
    catalogVersion: 0,
  });
  Object.defineProperty(ADM, 'state', { get: () => OV.state });

  ADM.on = (e, f) => (ADM.listeners[e] = ADM.listeners[e] || []).push(f);
  ADM.emit = (e, ...a) => (ADM.listeners[e] || []).forEach((f) => f(...a));
  /** 左側のタブを追加 { id, label, order, build(root), sig?() } */
  ADM.registerTab = (t) => ADM.tabs.push(t);
  /** パネル種別ごとの「内容」編集欄 { title, build(root, id), sig?(panel) } */
  ADM.registerInspector = (type, def) => { ADM.inspectors[type] = def; };
  /** 上部バーの部品 { order, build(root) } */
  ADM.registerTopbar = (t) => ADM.topbars.push(t);
  ADM.panel = (id) => (OV.state.panels || []).find((p) => p.id === id);
  ADM.selected = () => ADM.panel(ADM.selectedId);
  ADM.typeLabel = (t) => OV.t((OV.panelTypes[t] && OV.panelTypes[t].label) || t);

  // ---------- 送信 ----------
  // ドラッグやスライダーの連続変更はまとめて送る。自分の古い変更の「こだま」は無視してちらつきを防ぐ。
  const pending = new Map();
  const lastSeq = {};
  let flushTimer = 0;
  ADM.send = (type, payload = {}, section) => {
    // 縦画面を編集中は canvas: 'v' を付ける(サーバー側で縦画面用の設定に読み替える)
    const seq = ADM.hub.send(type, OV.canvas === 'v' ? Object.assign({}, payload, { canvas: 'v' }) : payload);
    if (section) lastSeq[OV.canvasKey(section)] = seq;
    return seq;
  };
  function flush() {
    flushTimer = 0;
    for (const e of pending.values()) ADM.send(e.type, Object.assign({}, e.base, { patch: e.patch }), e.section);
    pending.clear();
  }
  function queuePatch(key, type, base, patch, section) {
    const e = pending.get(key);
    if (e) mergePatch(e.patch, clone(patch));
    else pending.set(key, { type, base, patch: clone(patch), section });
    if (!flushTimer) flushTimer = setTimeout(flush, 30);
  }
  ADM.queuePatch = queuePatch; // 続けて変える値(スライダーなど)を、まとめて送る
  ADM.patchPanel = (id, patch) => {
    const p = ADM.panel(id);
    if (!p) return;
    deepMerge(p, clone(patch));
    queuePatch(`panel:${id}`, 'panels:update', { id }, patch, 'panels');
    ADM.changed();
  };
  ADM.patchLayout = (patch) => {
    deepMerge(OV.state.layout, clone(patch));
    queuePatch('layout', 'layout:update', {}, patch, 'layout');
    ADM.changed();
  };
  ADM.patchGame = (patch) => {
    deepMerge(OV.state.game, clone(patch));
    queuePatch('game', 'game:update', {}, patch, 'game');
    ADM.changed();
  };

  // ---------- 画面更新 ----------
  let updTimer = 0;
  let tabSig = null;
  let inspSig = null;
  const els = {};
  ADM.changed = () => {
    if (updTimer) return;
    updTimer = requestAnimationFrame(() => { updTimer = 0; refresh(); });
  };
  function refresh() {
    if (ADM.preview) ADM.preview.render();
    UI.refreshAll();
    rebuildIfNeeded();
    ADM.emit('refresh');
  }
  // ---------- かんたん表示 / 詳細設定 ----------
  // かんたん表示では、よく使うタブだけを出す(詳細設定をオンにすると、すべてのタブ)
  ADM.BASIC_TABS = ['quick', 'scene', 'chat', 'character', 'alerts', 'game', 'story', 'callout', 'youtube'];
  const readAdv = () => { try { return localStorage.getItem('sok.advanced') === '1'; } catch { return false; } };
  ADM.advanced = readAdv();
  ADM.setAdvanced = (on) => {
    ADM.advanced = !!on;
    try { localStorage.setItem('sok.advanced', on ? '1' : '0'); } catch { /* 保存できなくても動く */ }
    if (!on && !ADM.BASIC_TABS.includes(ADM.activeTab)) ADM.activeTab = 'quick';
    buildNav();
    tabSig = null;
    rebuildIfNeeded();
  };
  const visibleTab = (t) => ADM.advanced || t.basic || ADM.BASIC_TABS.includes(t.id);
  function buildNav() {
    els.nav.innerHTML = '';
    ADM.tabs.sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const t of ADM.tabs) {
      if (!visibleTab(t)) continue;
      const b = h('button', { type: 'button', class: 'tab', onclick: () => ADM.showTab(t.id) }, t.label);
      b.dataset.id = t.id;
      els.nav.append(b);
    }
    const adv = h('button', { type: 'button', class: `tab tab-adv${ADM.advanced ? ' on-adv' : ''}`, title: 'すべてのタブ(細かい調整)を表示します', onclick: () => ADM.setAdvanced(!ADM.advanced) }, ADM.advanced ? '詳細設定をとじる' : '詳細設定 ▸');
    els.nav.append(adv);
    [...els.nav.children].forEach((x) => x.classList.toggle('on', x.dataset.id === ADM.activeTab));
  }
  ADM.showTab = (id) => {
    const t = ADM.tabs.find((x) => x.id === id);
    if (t && !visibleTab(t)) { ADM.advanced = true; buildNav(); } // 詳細設定のタブへ移動するときは、詳細設定を開く
    ADM.activeTab = id;
    tabSig = null;
    rebuildIfNeeded();
  };
  function rebuildIfNeeded() {
    const tab = ADM.tabs.find((t) => t.id === ADM.activeTab) || ADM.tabs[0];
    if (tab) {
      const s = `${tab.id}|${tab.sig ? tab.sig() : ''}|${ADM.catalogVersion}`;
      if (s !== tabSig) {
        const sameTab = tabSig && tabSig.startsWith(`${tab.id}|`);
        tabSig = s;
        const sc = els.tabBody.scrollTop;
        els.tabBody.innerHTML = '';
        tab.build(els.tabBody);
        if (sameTab) els.tabBody.scrollTop = sc;
        [...els.nav.children].forEach((b) => b.classList.toggle('on', b.dataset.id === tab.id));
      }
    }
    const p = ADM.selected();
    const ins = p && ADM.inspectors[p.type];
    const is = p ? [p.id, p.type, ins && ins.sig ? ins.sig(p) : '', ADM.catalogVersion].join('|') : 'none';
    if (is !== inspSig) {
      const sameId = inspSig && p && inspSig.startsWith(`${p.id}|`);
      inspSig = is;
      const sc = els.inspector.scrollTop;
      els.inspector.innerHTML = '';
      if (!p) {
        els.inspector.append(h('div', { class: 'empty' }, 'パネルを選ぶと、ここで内容や見た目を調整できます。プレビューのパネルをクリックするか、左の一覧から選んでください。'));
      } else if (ADM.buildInspector) {
        ADM.buildInspector(els.inspector, p.id);
      }
      if (sameId) els.inspector.scrollTop = sc;
    }
  }
  ADM.select = (id) => {
    if (ADM.selectedId === id) return;
    ADM.selectedId = id;
    ADM.emit('select', id);
    ADM.changed();
  };

  ADM.toast = (message, kind = 'info') => {
    const t = h('div', { class: `toast ${kind}` }, message);
    els.toasts.append(t);
    const ms = kind === 'warn' || kind === 'error' ? 6000 : 2600; // 注意は長めに表示
    setTimeout(() => t.classList.add('out'), ms);
    setTimeout(() => t.remove(), ms + 400);
  };

  ADM.start = function () {
    els.nav = document.getElementById('tabs-nav');
    els.tabBody = document.getElementById('tab-body');
    els.inspector = document.getElementById('inspector');
    els.toasts = document.getElementById('toasts');
    els.conn = document.getElementById('conn');
    const slots = document.getElementById('topbar-slots');
    ADM.topbars.sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((t) => {
      const slot = h('div', { class: 'tb-slot' });
      slots.append(slot);
      t.build(slot);
    });
    // 横画面 / 縦画面
    document.body.classList.toggle('canvas-v', OV.canvas === 'v');
    const ovLink = document.getElementById('overlay-link');
    if (ovLink && OV.canvas === 'v') {
      ovLink.href = '/overlay-vertical';
      ovLink.title = 'OBS(縦型配信用・幅1080 高さ1920)に登録する URL です';
      ovLink.textContent = '縦型オーバーレイを開く';
      document.title = 'EverStreamer 管理画面(縦画面)';
    }
    ADM.preview = ADM.createPreview(document.getElementById('preview'));
    buildNav();

    OV.role = 'admin';
    const hub = (ADM.hub = new OV.Hub('admin'));
    const setConn = (on) => {
      els.conn.classList.toggle('on', on);
      els.conn.lastChild.textContent = on ? '接続中' : '再接続しています…';
    };
    hub.on('core:open', () => setConn(true));
    hub.on('core:close', () => setConn(false));
    hub.on('core:init', (p) => {
      OV.state = p.state;
      OV.catalogs = p.catalogs || {};
      OV.loadFonts();
      pending.clear();
      ADM.catalogVersion++;
      if (!ADM.panel(ADM.selectedId)) ADM.selectedId = ((OV.state.panels || [])[0] || {}).id || null;
      tabSig = null;
      inspSig = null;
      refresh();
    });
    hub.on('core:section', (p, m) => {
      if (m.origin && m.origin === hub.clientId && lastSeq[p.key] && m.seq < lastSeq[p.key]) return;
      for (const e of pending.values()) if (OV.canvasKey(e.section) === p.key) return;
      OV.setSection(p.key, p.value);
      if (!OV.sectionRelevant(p.key)) {
        if (p.key === 'panels' || p.key === 'vPanels') ADM.changed(); // もう一方の画面のパネル(ゲームタブの一覧用)
        return;
      }
      if (p.key === OV.canvasKey('panels') && !ADM.panel(ADM.selectedId)) ADM.selectedId = ((p.value || [])[0] || {}).id || null;
      ADM.changed();
    });
    hub.on('core:catalog', (p) => {
      OV.catalogs[p.name] = p.value;
      ADM.catalogVersion++;
      if (p.name === 'fonts') OV.loadFonts();
      ADM.changed();
    });
    hub.on('core:toast', (p) => ADM.toast(p.message, p.kind));
    hub.on('core:error', (p) => ADM.toast(p.message, 'error'));
    hub.on('panels:added', (p) => ADM.select(p.id));
  };
})();
