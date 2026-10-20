/* 管理画面の部品(数値+スライダー、色、選択など)。値は get() から読み、変更は set() に渡す */
(function () {
  'use strict';
  const UI = (window.UI = {});
  const refreshers = new Set();

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  UI.h = h;

  /** el が画面にある間、状態が変わるたびに fn を呼ぶ */
  UI.bind = (el, fn) => {
    const r = { el, fn, seen: false };
    refreshers.add(r);
    try { fn(); } catch (e) { console.error(e); }
    return el;
  };
  UI.refreshAll = () => {
    for (const r of refreshers) {
      if (!r.el.isConnected) {
        if (r.seen) refreshers.delete(r);
        continue;
      }
      r.seen = true;
      try { r.fn(); } catch (e) { console.error(e); }
    }
  };
  const focused = (...els) => els.includes(document.activeElement);
  /** 条件が成り立つときだけ表示 */
  UI.when = (cond, el) => UI.bind(el, () => { el.style.display = cond() ? '' : 'none'; });

  UI.field = (label, ...controls) => h('div', { class: 'f' }, h('span', { class: 'f-l' }, label), h('div', { class: 'f-c' }, ...controls));

  UI.num = ({ label, get, set, min = 0, max = 100, step = 1, unit = '', hint }) => {
    const range = h('input', { type: 'range', min, max, step });
    const num = h('input', { type: 'number', min, max, step, class: 'num' });
    const apply = (v) => {
      const n = parseFloat(v);
      if (!Number.isNaN(n)) set(n);
    };
    range.addEventListener('input', () => { num.value = range.value; apply(range.value); });
    num.addEventListener('input', () => { range.value = num.value; apply(num.value); });
    const row = UI.field(label, range, num, unit ? h('span', { class: 'f-u' }, unit) : null);
    if (hint) row.title = hint;
    return UI.bind(row, () => {
      if (focused(num, range)) return;
      const v = get();
      num.value = v == null ? '' : +Number(v).toFixed(4);
      range.value = v == null ? min : v;
    });
  };

  UI.text = ({ label, get, set, placeholder = '', maxlength }) => {
    const input = h('input', { type: 'text', placeholder, maxlength });
    input.addEventListener('input', () => set(input.value));
    const row = label ? UI.field(label, input) : input;
    return UI.bind(row, () => { if (!focused(input)) input.value = get() ?? ''; });
  };

  UI.textarea = ({ label, get, set, rows = 5, placeholder = '' }) => {
    const ta = h('textarea', { rows, placeholder });
    ta.addEventListener('input', () => set(ta.value));
    const row = h('div', { class: 'f f-col' }, label ? h('span', { class: 'f-l' }, label) : null, ta);
    return UI.bind(row, () => { if (!focused(ta)) ta.value = get() ?? ''; });
  };

  UI.color = ({ label, get, set, alpha }) => {
    const pick = h('input', { type: 'color' });
    const hex = h('input', { type: 'text', class: 'hex', maxlength: 9, spellcheck: 'false' });
    pick.addEventListener('input', () => { hex.value = pick.value; set(pick.value); });
    hex.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(hex.value)) { pick.value = hex.value; set(hex.value); }
    });
    const parts = [pick, hex];
    let a;
    if (alpha) {
      a = h('input', { type: 'range', min: 0, max: 1, step: 0.05, class: 'alpha', title: '不透明度' });
      a.addEventListener('input', () => alpha.set(parseFloat(a.value)));
      parts.push(a);
    }
    const row = UI.field(label, ...parts);
    return UI.bind(row, () => {
      const v = get() || '';
      if (!focused(pick, hex)) {
        hex.value = v;
        hex.placeholder = v ? '' : 'なし';
        if (/^#[0-9a-f]{6}$/i.test(v)) pick.value = v;
      }
      if (a && !focused(a)) a.value = alpha.get() ?? 1;
    });
  };

  UI.select = ({ label, options, get, set }) => {
    const sel = h('select');
    const fill = () => {
      const opts = typeof options === 'function' ? options() : options;
      const key = JSON.stringify(opts);
      if (sel.dataset.key === key) return;
      sel.dataset.key = key;
      sel.innerHTML = '';
      for (const [v, l] of opts) sel.append(h('option', { value: v }, l));
    };
    sel.addEventListener('change', () => set(sel.value));
    const row = label ? UI.field(label, sel) : sel;
    return UI.bind(row, () => { fill(); if (!focused(sel)) sel.value = get() ?? ''; });
  };

  UI.toggle = ({ label, get, set }) => {
    const cb = h('input', { type: 'checkbox' });
    cb.addEventListener('change', () => set(cb.checked));
    const row = h('label', { class: 'f f-toggle' }, cb, h('span', { class: 'sw' }), h('span', { class: 'f-l' }, label));
    return UI.bind(row, () => { cb.checked = !!get(); });
  };

  UI.seg = ({ label, options, get, set }) => {
    const wrap = h('div', { class: 'seg' });
    const btns = options.map(([v, l]) => {
      const b = h('button', { type: 'button', onclick: () => set(v) }, l);
      b.dataset.v = v;
      wrap.append(b);
      return b;
    });
    const row = label ? UI.field(label, wrap) : wrap;
    return UI.bind(row, () => {
      const cur = String(get());
      btns.forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
    });
  };

  UI.button = (label, onclick, cls = '') => h('button', { type: 'button', class: `btn ${cls}`, onclick }, label);

  const openState = {};
  UI.section = (id, title, ...kids) => {
    const d = h('details', { class: 'sec' }, h('summary', null, title), h('div', { class: 'sec-body' }, ...kids));
    d.open = openState[id] !== undefined ? openState[id] : true;
    d.addEventListener('toggle', () => { openState[id] = d.open; });
    return d;
  };
  UI.setDefaultOpen = (id, open) => { if (openState[id] === undefined) openState[id] = open; };
})();
