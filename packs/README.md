# packs — 追加パックの置き場所 / Add-on packs

このフォルダに、追加パック(テンプレート・文字のデザイン・質感・キャラクター)のフォルダを入れると、EverStreamer が自動で読み込みます。起動中でも数秒で反映されます。本体を新しい版に上書きしても、このフォルダの中身は消えません(Releases の zip にはこの説明書だけが入っています)。

Put add-on pack folders here (templates, text designs, textures, characters). EverStreamer loads them automatically, even while running. Updating EverStreamer keeps this folder's contents.

```
packs/
└─ <パックの名前>/
   ├─ pack.json            { "name": "…", "version": "1.0.0", "author": "…" }
   ├─ templates/           <id>.json + <id>.css(config/templates と同じ形)
   ├─ text-designs.json    大きな文字のデザイン(config/text-designs.json と同じ形)
   ├─ textures/            質感の画像(PNG / JPG / WebP)+ textures.json
   └─ characters/<セット>/ idle / talk / blink / happy の画像 + character.json
```

- パックの画像や CSS は `/packs/<パックの名前>/...` で読み込めます(テンプレートの CSS の `url()` などに使います)
- パックを外すときは、フォルダごと削除してください
- パックの利用条件は、それぞれのパックに入っている LICENSE を確認してください
