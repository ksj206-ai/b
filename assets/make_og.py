# -*- coding: utf-8 -*-
"""배포 메타용 이미지 생성 — og 카드 · 앱 아이콘 · 파비콘.

색은 앱의 토큰 그대로다(css/app.css):
  --skypanel: linear-gradient(160deg,#2c3468,#4b5497)   별자리 판, 라이트/다크 공통
  --star:     #fff4d2                                    별빛
  --accent-2: #aab2e8                                    별자리 선
문구도 앱이 스스로 말하는 것만 쓴다(index.html 배너).

실행 — 저장소 루트에서 `python assets/make_og.py` (Pillow 필요). 결과물은 8개:
  assets/og.png · assets/icon-192.png · assets/icon-512.png · assets/icon-maskable-512.png
  apple-touch-icon.png · favicon.ico   (favicon.svg는 손으로 쓴 벡터라 여기서 안 만든다)

앱은 이 파일을 실행하지 않는다. 그림을 손으로 만들면 앱 이름이나 톤이 바뀔 때 무엇을
어떻게 만들었는지 아무도 모르는 png만 남는다 — 재생성 가능한 상태로 두는 게 목적이다.
별자리 좌표·잔별 배치는 시드를 박아 두어 다시 돌려도 같은 그림이 나온다.
"""
import math, random
from PIL import Image, ImageDraw, ImageFont

SKY_TOP = (44, 52, 104)      # #2c3468
SKY_BOT = (75, 84, 151)      # #4b5497
STAR    = (255, 244, 210)    # #fff4d2
LINE    = (170, 178, 232)    # #aab2e8
SUB     = (185, 193, 234)

FONT_B = "C:/Windows/Fonts/malgunbd.ttf"
FONT_R = "C:/Windows/Fonts/malgun.ttf"


def sky(w, h, angle_deg=160):
    """CSS linear-gradient(160deg, top, bottom)와 같은 방향의 배경."""
    a = math.radians(angle_deg)
    dx, dy = math.sin(a), -math.cos(a)          # CSS 각도 규약(위쪽이 0°, 시계방향)
    im = Image.new("RGB", (w, h))
    px = im.load()
    lo = min(0, dx * (w - 1)) + min(0, dy * (h - 1))
    hi = max(0, dx * (w - 1)) + max(0, dy * (h - 1))
    span = (hi - lo) or 1
    for y in range(h):
        base = dy * y
        for x in range(w):
            t = (dx * x + base - lo) / span
            px[x, y] = tuple(round(SKY_TOP[i] + (SKY_BOT[i] - SKY_TOP[i]) * t) for i in range(3))
    return im


def dot(d, x, y, r, color, alpha=255):
    d.ellipse([x - r, y - r, x + r, y + r], fill=color + (alpha,))


def sparkle(d, x, y, r, color, alpha=255, waist=0.30):
    """네 갈래 별 — 배너의 ✦와 같은 모양."""
    w = r * waist
    d.polygon([(x, y - r), (x + w, y - w), (x + r, y),
               (x + w, y + w), (x, y + r), (x - w, y + w),
               (x - r, y), (x - w, y - w)], fill=color + (alpha,))


def starfield(d, w, h, n, seed, avoid=()):
    """흩뿌린 잔별. 시드를 고정해 다시 돌려도 같은 그림이 나온다."""
    rnd = random.Random(seed)
    for _ in range(n):
        x, y = rnd.uniform(0, w), rnd.uniform(0, h)
        if any(bx0 <= x <= bx1 and by0 <= y <= by1 for bx0, by0, bx1, by1 in avoid):
            continue
        r = rnd.choice([1.0, 1.2, 1.5, 1.8, 2.4])
        dot(d, x, y, r, STAR, alpha=rnd.randint(70, 210))


def constellation(d, pts, node_r, line_w, alpha_line=120):
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        d.line([x0, y0, x1, y1], fill=LINE + (alpha_line,), width=line_w)
    for i, (x, y) in enumerate(pts):
        r = node_r * (1.5 if i in (0, len(pts) - 1) else 1.0)
        sparkle(d, x, y, r * 2.1, STAR, 235)
        dot(d, x, y, r * 0.55, (255, 255, 255), 255)


# ── ① og 카드 1200×630 ────────────────────────────────────────────────
W, H = 1200, 630
og = sky(W, H).convert("RGBA")
layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)

starfield(d, W, H, 150, seed=20260908, avoid=[(60, 300, 700, 470)])
# 별자리 하나 — 워드마크 위쪽에 얹어 "운동하면 별이 켜진다"를 그대로 보여준다
constellation(d, [(150, 205), (268, 150), (392, 196), (508, 138), (596, 214)],
              node_r=7, line_w=2)

cat = Image.open("assets/cat-idle.png").convert("RGBA")
cat = cat.crop(cat.getchannel("A").getbbox())
ch = 430
cat = cat.resize((round(cat.width * ch / cat.height), ch), Image.LANCZOS)
layer.alpha_composite(cat, (W - cat.width - 96, H - ch - 70))

fb = ImageFont.truetype(FONT_B, 92)
fr = ImageFont.truetype(FONT_R, 33)
d.text((150, 300), "오늘의 별자리", font=fb, fill=STAR + (255,))
d.text((156, 418), "하루 1분 손목 웰니스 · 별 모으기", font=fr, fill=SUB + (255,))

og = Image.alpha_composite(og, layer).convert("RGB")
og.save("assets/og.png", optimize=True)
print("assets/og.png", og.size)


# ── ② 앱 아이콘 · 파비콘 ──────────────────────────────────────────────
def icon(size, pad_ratio=0.0, radius_ratio=0.22):
    """밤하늘 판 위의 별 하나 + 잔별 둘. 4배로 그려 축소한다(안티에일리어싱)."""
    S = size * 4
    base = sky(S, S, 160).convert("RGBA")
    if radius_ratio:                     # 둥근 사각형 마스크
        m = Image.new("L", (S, S), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * radius_ratio, fill=255)
        base.putalpha(m)
    lay = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(lay)
    c = S / 2
    k = 1 - pad_ratio                    # maskable 안전 영역
    sparkle(dd, c, c * 0.97, S * 0.30 * k, STAR, 255)
    dot(dd, c - S * 0.27 * k, c + S * 0.26 * k, S * 0.048 * k, STAR, 220)
    dot(dd, c + S * 0.25 * k, c - S * 0.24 * k, S * 0.036 * k, STAR, 190)
    dot(dd, c + S * 0.29 * k, c + S * 0.30 * k, S * 0.028 * k, STAR, 150)
    out = Image.alpha_composite(base, lay)
    return out.resize((size, size), Image.LANCZOS)


icon(192).save("assets/icon-192.png", optimize=True)
icon(512).save("assets/icon-512.png", optimize=True)
# maskable — 원형으로 잘려도 글리프가 안 잘리게 안쪽 20%를 비운다
icon(512, pad_ratio=0.22, radius_ratio=0).save("assets/icon-maskable-512.png", optimize=True)
# iOS 홈 화면 — 투명을 검게 칠하므로 알파 없이, 모서리는 iOS가 깎는다
icon(180, radius_ratio=0).convert("RGB").save("apple-touch-icon.png", optimize=True)
icon(64, radius_ratio=0.18).save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print("아이콘 5종 완료")
