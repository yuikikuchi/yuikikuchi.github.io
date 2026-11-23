# yuikikuchi.github.io

METASYSTEM（Yui Kikuchi）の実績ポートフォリオ（https://yuikikuchi.github.io/）。
上の帯、左にフォルダのツリー、中央にページ、右に要点、という組み。ツリーでえらんだ1ページだけを出す。

ライブラリもビルドもなし。HTML・CSS・JavaScript をそのまま GitHub Pages が配信する。

```
index.html            全ページの本文（文章を直すのはここ）。アイコンの絵（<symbol>）も先頭にある
404.html              見つからないページ
assets/css/style.css  見た目。色は先頭の :root（墨・生成り・砂、差し色はオレンジと青）
assets/js/main.js     ページの切りかえ・ツリー・進み具合・工程の図・紹介資料のめくり
assets/img/og.png     SNS で共有されたときの画像（1200×630）
assets/workuru/       WORKURU の紹介資料（スライドの画像と PDF）。ワークルのリポジトリから写したもの
scripts/sync-workuru-deck.sh   上の資料を写し直して、index.html のスライドの一覧も作り直す
favicon.svg / apple-touch-icon.png
```

## 手元で見る

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## ページのしくみ

ページは `index.html` の中の `<article class="page" id="…">`。URL は `#id`（例：`/#profile`）。
JavaScript がないときは、全部のページが上から順に並ぶ。

ページを足すとき：

1. 左のツリー（`<ul class="tree">`）の、入れたいフォルダに `<a class="file" href="#id">` を足す。前後の順番は、ツリーの上からの順。
2. `<main>` に、同じ `id` の `<article class="page">` を足す。中は、中央の `<section class="lesson card">` と、右の `<aside class="panel">`。
3. 「フォルダの何番目か」「戻る・次へ」「読んだ数」は `main.js` が数えて入れるので、書かなくてよい。先頭の「18 pages」と `0 / 18` の数だけ直す。

工程やステップの図は `<ol class="pipe" data-steps>`。`<li>` を1つずつ進み、右のパネル（`data-step-panel` のついたカード）に、その `<b>` と `<p>` を出す。

- アイコンは `<svg class="i"><use href="#i-名前"/></svg>`。絵は `index.html` の先頭の `<symbol>`。
- CSS・JS を直したら、`index.html` と `404.html` の `?v=` の数字を上げる（古いキャッシュを読ませないため）。

## WORKURU の紹介資料を更新するとき

「06. プロダクト → WORKURU」のページは、ワークルの紹介資料（`workuru/docs/deck/workuru-intro.pptx` を PDF にしたもの）をそのまま見せている。
ワークルの側で資料を作り直したら（`docs/deck/slides.sh`）、こちらで次を流す。

```bash
scripts/sync-workuru-deck.sh            # ../workuru から写す。場所が違うときは引数で渡す
```

`assets/workuru/` を入れ替えて、`index.html` の `<!-- deck:… -->` の目印の間（スライドの一覧・枚数・最初の見出し・PDF の大きさ）を書き直す。
alt は、ワークルの LP（`lp/index.html` の `#deck`）に書いてあるものをそのまま使う。目印の間は手で直さない。

## 共有用の画像を作り直すとき

`assets/img/og.png` は、トップのページを 1200×630 の画面で開いて撮ったもの。見た目を変えたら撮り直す。
