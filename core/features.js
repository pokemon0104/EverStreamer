'use strict';
// features/ 以下のフォルダを機能(プラグイン)として読み込む
const fs = require('fs');
const path = require('path');

function loadFeatures(featuresDir) {
  const list = [];
  for (const name of fs.readdirSync(featuresDir)) {
    const dir = path.join(featuresDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (fs.existsSync(path.join(dir, '.disabled'))) continue; // .disabled を置くと無効化
    const serverFile = path.join(dir, 'server.js');
    const mod = fs.existsSync(serverFile) ? require(serverFile) : {};
    const has = (f) => fs.existsSync(path.join(dir, f));
    list.push({
      name,
      dir,
      order: typeof mod.order === 'number' ? mod.order : 100,
      mod,
      client: { overlay: has('overlay.js'), admin: has('admin.js'), css: has('style.css') },
    });
  }
  list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return list;
}

module.exports = { loadFeatures };
