# yuikikuchi.github.io

METASYSTEM のホームページ（https://yuikikuchi.github.io/）。
ページ全体を1枚の「総合結線図」に見立てている。IC（モデル）から出た7本の線がワードマークを縫い、左の余白を下り、各セクションの端子へ入る。スクロールした所まで線に色が入る。

ライブラリもビルドもなし。HTML・CSS・JavaScript をそのまま GitHub Pages が配信する。

```
index.html            本文（文章を直すのはここ）
404.html              見つからないページ
assets/css/style.css  見た目。色・線の太さ・余白の幅は先頭の :root
assets/js/main.js     配線（SVG）・光の粒（canvas）・紹介資料のめくり・プラグ・配色の切り替え
assets/img/og.png     SNS で共有されたときの画像（1200×630）
assets/workuru/       WORKURU の紹介資料（スライドの画像と PDF）。ワークルのリポジトリから写したもの
scripts/sync-workuru-deck.sh   上の資料を写し直して、index.html のスライドの一覧も作り直す
favicon.svg / apple-touch-icon.png
```

## WORKURU の紹介資料を更新するとき

「03 PRODUCT」の欄は、ワークルの紹介資料（`workuru/docs/deck/workuru-intro.pptx` を PDF にしたもの）をそのまま見せている。
ワークルの側で資料を作り直したら（`docs/deck/slides.sh`）、こちらで次を流す。

```bash
scripts/sync-workuru-deck.sh            # ../workuru から写す。場所が違うときは引数で渡す
```

`assets/workuru/` を入れ替えて、`index.html` の `<!-- deck:… -->` の目印の間（スライドの一覧・枚数・最初の見出し・PDF の大きさ）を書き直す。
alt は、ワークルの LP（`lp/index.html` の `#deck`）に書いてあるものをそのまま使う。目印の間は手で直さない。

## 手元で見る

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## 配線のしくみ

線の位置は HTML に書いていない。`main.js` が要素の位置を測って SVG を描き、幅が変わるたびに引き直す。
HTML の側は、次の属性で「どの線がどこへ入るか」だけを書く。

| 属性 | 意味 |
|---|---|
| `data-pin="ctx"` | IC のピン。線の出発点 |
| `data-tap="ctx"` | 幹線から枝を出して、この端子へつなぐ |
| `data-end="ctx"` | 幹線そのものが、この端子で終わる（アースと、最後のコネクタ） |
| `data-live` | 入ってくる線がすべて通電したら、この要素に `is-live` が付く |
| `data-trace="ctx tool"` | マウスを載せている間、この線だけを残す |

線の名前は `gnd`・`hitl`・`mem`・`eval`・`guard`・`tool`・`ctx` の7つ（左からの並び順は `main.js` の `IDS`）。

- 行や箱を足すときは、`.term` に `data-tap` を付ければ線がつながる。
- 色は「信号」にだけ使う。線の色は `style.css` の `--w-*`、暗い配色のときの値はそのすぐ下。
- CSS・JS を直したら、`index.html` と `404.html` の `?v=2` の数字を上げる（古いキャッシュを読ませないため）。

## 共有用の画像を作り直すとき

`assets/img/og.png` は、実際のページを 1200×630 の画面で開き、ヒーローの文章の一部を隠して撮ったもの。ワードマークや色を変えたら撮り直す。
