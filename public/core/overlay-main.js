/* OBS ブラウザソース用:状態を受け取って描画するだけ。管理画面を閉じても表示は維持される */
(function () {
  'use strict';
  const stageEl = document.getElementById('stage');
  const renderer = OV.createRenderer(stageEl);
  let pending = false;
  const rerender = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; renderer.render(); });
  };

  // OBS(横 1920x1080 / 縦 1080x1920)ではそのまま。ブラウザで開いた場合は画面に合わせて縮小表示
  function fitWindow() {
    const s = Math.min(window.innerWidth / OV.W, window.innerHeight / OV.H);
    stageEl.style.transform = Math.abs(s - 1) < 0.001 ? '' : `scale(${s})`;
  }
  window.addEventListener('resize', fitWindow);
  fitWindow();

  function reveal() {
    const show = () => stageEl.classList.add('ready');
    // フォントの読み込みを待ってから表示(最大2.5秒)
    const timeout = new Promise((r) => setTimeout(r, 2500));
    Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), timeout]).then(() => {
      renderer.queueFit();
      requestAnimationFrame(show);
    });
  }

  const hub = new OV.Hub('overlay');
  hub.on('core:init', (p) => {
    OV.state = p.state;
    OV.catalogs = p.catalogs || {};
    OV.loadFonts();
    renderer.render();
    reveal();
  });
  hub.on('core:section', (p) => { OV.setSection(p.key, p.value); if (OV.sectionRelevant(p.key)) rerender(); });
  hub.on('core:catalog', (p) => {
    OV.catalogs[p.name] = p.value;
    if (p.name === 'fonts') OV.loadFonts();
    rerender();
  });
  // 切断中も最後の表示を維持し、自動で再接続する(hub-client が担当)
  window.__overlay = { renderer, hub };
})();
