# yuikikuchi.github.io

METASYSTEM（Yui Kikuchi）の実績ポートフォリオ（https://yuikikuchi.github.io/）。
上の帯、左にフォルダのツリー、中央にページ、右に要点、という組み。ツリーでえらんだ1ページだけを出す。

ライブラリもビルドもなし。HTML・CSS・JavaScript をそのまま GitHub Pages が配信する。

```
index.html            全ページの本文（文章を直すのはここ）。アイコンの絵（<symbol>）も先頭にある
404.html              見つからないページ
assets/css/style.css  見た目。色は先頭の :root（墨・生成り・砂、差し色はオレンジと青）
assets/js/main.js     ページの切りかえ・ツリー・進み具合・工程の図・ページの図を動かすしくみ・紹介資料のめくり
assets/js/scenes.js   ページごとの図（等角の絵）。絵の部品と、ページごとの場面
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

## ページの図

どのページにも、内容に合わせた等角（アイソメトリック）の図がある（`<div class="viz" data-viz="ページの id">`）。
絵は `scenes.js` の `SCENES` にページごとに書き、`main.js` の「ページの図」が SVG に描いて動かす。

- 図は「場面」を順に進む。ふつうのページは自動で進み（約3.6秒ごと）、`items` で指定した項目（実績のカードなど）もいっしょに光る。項目を押すと、その場面へ飛ぶ。
- `sync: 'steps'` のページ（対応可能な工程・ご発注までの流れ）は、工程の図（`data-steps`）に合わせて進む。
- 場面ごとに何を出すかは、要素の `data-in`（その場面から出る）・`data-only`（その場面だけ）・`data-solid`（その場面から実線。それまでは設計中の青い破線）・`data-hot`（その場面でオレンジ）・`data-pop`（その場面で出し直す）で決める。
- 座標は `at(横px, 縦px)` で画面の位置からマス目に直せる。箱・台・人・名札・線・流れる点などの部品は `makeLib` にある。
- 狭い画面では、いまの場面のまわりに寄る。「動きを減らす」設定のときは、自動では進まず、動きも止める。
- 対応可能な工程の図の上の成果物の欄は、`<li data-v="2:外部設計|3:外部・詳細">` のように「工程の番号:出す文字」を書く。

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
