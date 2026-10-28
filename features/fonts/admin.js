/* フォントタブ:PC に入っているフォントを登録する/フォントファイルを取り込む。登録したフォントは、すべてのフォント選択欄に出る */
(function () {
  'use strict';
  const { h } = UI;
  const { fontStack } = OV.util;
  let pcFonts = null; // queryLocalFonts で読んだ PC のフォント名

  async function post(url, body, headers) {
    const r = await fetch(url, { method: 'POST', body, headers });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `エラー(${r.status})`);
    return j;
  }
  const addSystem = async (families) => {
    try {
      await post('/api/user-fonts/system', JSON.stringify({ families }), { 'Content-Type': 'application/json' });
      ADM.toast(`「${families.join('」「')}」を登録しました`);
    } catch (e) { ADM.toast(e.message, 'error'); }
  };
  async function uploadFiles(files) {
    for (const f of [...files]) {
      try {
        const j = await post('/api/user-fonts', f, { 'x-filename': encodeURIComponent(f.name) });
        ADM.toast(`「${j.family}」を取り込みました`);
      } catch (e) { ADM.toast(`${f.name}: ${e.message}`, 'error'); }
    }
  }

  ADM.registerTab({
    id: 'fonts',
    label: 'フォント',
    order: 85,
    sig: () => JSON.stringify((OV.catalogs.fonts || []).filter((f) => f.local).map((f) => f.family)) + (pcFonts ? pcFonts.length : -1),
    build(root) {
      const own = (OV.catalogs.fonts || []).filter((f) => f.local);
      const sample = h('input', { type: 'text', value: 'あいうえお ABC 123 冒険の書', placeholder: '見本の文字' });
      const list = h('div', { class: 'uf-list' });
      const rows = own.map((f) => {
        const pv = h('div', { class: 'uf-pv' }, sample.value);
        pv.style.fontFamily = fontStack(f.family);
        return h('div', { class: 'uf-row' },
          h('div', { class: 'uf-meta' }, h('b', null, f.family), h('span', { class: 'chip' }, f.local === 'file' ? '取り込み' : 'PCのフォント')),
          pv,
          UI.button('削除', async () => {
            if (!confirm(`「${f.family}」を一覧から削除しますか?${f.local === 'file' ? '(取り込んだファイルも削除します)' : '(PC のフォント自体は消えません)'}`)) return;
            try { await post('/api/user-fonts/remove', JSON.stringify({ family: f.family }), { 'Content-Type': 'application/json' }); } catch (e) { ADM.toast(e.message, 'error'); }
          }, 'small danger'));
      });
      sample.addEventListener('input', () => list.querySelectorAll('.uf-pv').forEach((el) => { el.textContent = sample.value; }));
      rows.forEach((r) => list.append(r));

      // 1) PC のフォントを名前で登録
      const nameIn = h('input', { type: 'text', placeholder: '例:UD デジタル 教科書体 N-B', list: 'uf-pc-list', style: { flex: 1 } });
      const dl = h('datalist', { id: 'uf-pc-list' }, (pcFonts || []).map((n) => h('option', { value: n })));
      const namePv = h('div', { class: 'uf-pv' }, 'あいうえお ABC 123');
      nameIn.addEventListener('input', () => { namePv.style.fontFamily = fontStack(nameIn.value.trim()); });
      const loadPc = async () => {
        if (!window.queryLocalFonts) { ADM.toast('このブラウザでは、PC のフォント一覧を読み込めません(Chrome・Edge なら使えます)。フォント名を直接入力してください', 'warn'); return; }
        try {
          const all = await window.queryLocalFonts();
          pcFonts = [...new Set(all.map((x) => x.family))].sort((a, b) => a.localeCompare(b, 'ja'));
          ADM.toast(`PC のフォントを ${pcFonts.length} 種類 読み込みました。名前の欄で選べます`);
          ADM.changed();
        } catch (e) { ADM.toast('フォント一覧の読み込みが許可されませんでした', 'warn'); }
      };

      // 2) フォントファイルを取り込む
      const file = h('input', { type: 'file', multiple: true, accept: '.ttf,.otf,.woff,.woff2,.ttc', style: { display: 'none' } });
      file.addEventListener('change', () => { if (file.files.length) uploadFiles(file.files); file.value = ''; });
      const drop = h('div', { class: 'dropzone', onclick: () => file.click() }, 'ここにフォントファイルをドロップ、またはクリックして選択(TTF / OTF / WOFF / WOFF2、複数まとめてOK)');
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files); });

      root.append(
        h('p', { class: 'hint' }, 'ここで登録したフォントは、パネルの「フォント」「見出しフォント」や、大きな文字パネルなど、すべてのフォント選択欄に出ます。'),
        h('h3', { class: 'h' }, 'PC に入っているフォントを使う'),
        h('p', { class: 'hint' }, 'OBS も同じ PC で動いているので、PC にインストール済みのフォントは名前を登録するだけで使えます。「PC のフォント一覧を読み込む」を押すと、名前の欄で一覧から選べます(初回はブラウザが許可を求めます)。'),
        h('div', { class: 'row' }, UI.button('PC のフォント一覧を読み込む', loadPc, 'small')),
        h('div', { class: 'row', style: { marginTop: '6px' } }, nameIn, dl, UI.button('登録', () => { const n = nameIn.value.trim(); if (n) { addSystem([n]); nameIn.value = ''; } }, 'primary')),
        namePv,
        h('p', { class: 'hint' }, '見本の文字がそのフォントにならないときは、名前が違います。一覧から選ぶか、フォントの正式な名前(Windows の「設定」→「個人用設定」→「フォント」に出る名前)を入れてください。'),
        h('h3', { class: 'h' }, 'フォントファイルを取り込む'),
        h('p', { class: 'hint' }, 'ダウンロードしたフリーフォントなど、インストールしていないフォントを使うときはこちら。ファイルはこのツールの data/userfonts に保存されます。'),
        drop, file,
        h('h3', { class: 'h' }, `登録したフォント(${own.length})`),
        own.length ? h('div', null, UI.field('見本の文字', sample), list) : h('p', { class: 'hint' }, 'まだありません。'));
    },
  });
})();
