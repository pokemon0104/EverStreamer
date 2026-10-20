'use strict';
// テキストパネル(見出し+本文・箇条書き)
module.exports = {
  order: 20,
  panelTypes: {
    text: {
      label: 'テキスト',
      defaults: () => ({
        name: 'テキスト',
        data: {
          title: '見出し',
          showTitle: true,
          body: '- 箇条書きは行頭に「-」か「・」',
          bulletMode: 'auto', // auto / all / none
          bullet: '▶',
          titleAlign: 'left',
          align: 'left',
        },
      }),
    },
  },
};
