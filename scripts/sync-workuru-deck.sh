#!/bin/bash
# WORKURU の紹介資料を、ワークルのリポジトリから写す。index.html のスライドの一覧（枚数・alt・PDF の大きさ）も作り直す。
#   scripts/sync-workuru-deck.sh [ワークルのリポジトリ]     省略すると ../workuru
#
# 写すもの：<ワークル>/lp/assets/deck/ の slide-NN.jpg（幅1600）・slide-NN-800.jpg（幅800）・workuru-intro.pdf
#           → assets/workuru/（前のものは消す）
# 一覧の alt は、<ワークル>/lp/index.html の #deck に書いてあるものをそのまま使う。
# ワークルの側で資料を作り直したら（docs/deck/slides.sh）、これを流してからコミットする。
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=${1:-$ROOT/../workuru}
DECK=$SRC/lp/assets/deck
LP=$SRC/lp/index.html
OUT=$ROOT/assets/workuru

[ -f "$DECK/workuru-intro.pdf" ] || { echo "紹介資料の PDF がありません: $DECK/workuru-intro.pdf" >&2; exit 1; }
[ -f "$LP" ] || { echo "LP がありません: $LP" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"
cp "$DECK"/slide-*.jpg "$DECK/workuru-intro.pdf" "$OUT/"

python3 - "$LP" "$ROOT/index.html" "$OUT" <<'EOF'
import html, os, re, sys

lp_path, page_path, out = sys.argv[1:4]
lp = open(lp_path, encoding='utf-8').read()

slides = []
for fig in re.findall(r'<figure class="deck-slide">.*?</figure>', lp, flags=re.S):
    n = re.search(r'slide-(\d+)\.jpg', fig).group(1)
    alt = html.unescape(re.search(r'alt="([^"]*)"', fig).group(1))
    for f in ('slide-%s.jpg' % n, 'slide-%s-800.jpg' % n):
        if not os.path.exists(os.path.join(out, f)):
            sys.exit('画像がありません: ' + f)
    slides.append((n, alt))
if not slides:
    sys.exit('LP の #deck に、スライドの一覧が見つかりません')

SIZES = '(max-width: 719px) calc(100vw - 110px), (max-width: 1199px) calc(100vw - 250px), 980px'
rows = []
for i, (n, alt) in enumerate(slides):
    rows.append(
        '          <figure class="deck__slide"><a href="assets/workuru/slide-%s.jpg" target="_blank" rel="noopener">'
        '<img src="assets/workuru/slide-%s-800.jpg" srcset="assets/workuru/slide-%s-800.jpg 800w, assets/workuru/slide-%s.jpg 1600w" '
        'sizes="%s" width="1600" height="900" loading="%s" decoding="async" alt="%s"></a></figure>'
        % (n, n, n, n, SIZES, 'eager' if i == 0 else 'lazy', html.escape(alt, quote=True)))

mb = os.path.getsize(os.path.join(out, 'workuru-intro.pdf')) / 1e6
# スライドの下に出す見出し：先頭の「1枚目：」と、末尾のかっこ書きの補足は外す（main.js の titles と同じきまり）
first = re.sub(r'（[^（）]*）$', '', re.sub(r'^\d+枚目[：:]\s*', '', slides[0][1]))

page = open(page_path, encoding='utf-8').read()

def fill(name, body, text):
    pat = re.compile(r'(<!-- deck:%s[^>]*-->)(.*?)(<!-- /deck:%s -->)' % (name, name), re.S)
    if not pat.search(text):
        sys.exit('index.html に <!-- deck:%s --> の目印がありません' % name)
    return pat.sub(lambda m: m.group(1) + body + m.group(3), text)

page = fill('slides', '\n' + '\n'.join(rows) + '\n          ', page)
page = fill('total', str(len(slides)), page)
page = fill('first', html.escape(first), page)
page = fill('meta', '%d枚・%.1fMB' % (len(slides), mb), page)
open(page_path, 'w', encoding='utf-8').write(page)
print('スライド: %d枚 / PDF: %.1fMB' % (len(slides), mb))
EOF
du -sh "$OUT"
