# 임장지도 dow 아이콘 생성 스크립트: python3 mobile/scripts/make-icon.py <출력폴더>  (Pillow, Inter ExtraBold 필요)
import math, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 2048
NAVY_TOP, NAVY_BOT = (24, 33, 74), (44, 58, 140)   # 짙은 남색 그라데이션
CORAL = (255, 94, 87)                               # 핀 색 (초록·노랑 제외)
FONT = '/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf'

def background(size):
    im = Image.new('RGB', (size, size))
    px = im.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(NAVY_TOP, NAVY_BOT))
        for x in range(size):
            px[x, y] = c
    # 옅은 등고선 (지형·임장 느낌)
    over = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    cx, cy = size * 0.78, size * 0.86
    for i in range(1, 14):
        r = size * 0.11 * i
        wob = [(cx + (r + size * 0.025 * math.sin(a * 3 + i)) * math.cos(a), cy + (r * 0.8 + size * 0.02 * math.cos(a * 2 + i)) * math.sin(a))
               for a in [k * 2 * math.pi / 180 for k in range(181)]]
        d.line(wob, fill=(255, 255, 255, 22), width=max(2, size // 300))
    im.paste(over, (0, 0), over)
    return im

def pin(draw, cx, cy, r_out, r_in, tip_y, color):
    # 핀 머리(링) + 아래로 뾰족한 꼬리. 꼬리는 원에 접하는 두 접선으로 만듦
    d = tip_y - cy
    a = math.asin(r_out / d)
    tx = r_out * math.cos(a)
    ty = r_out * math.sin(a)
    draw.polygon([(cx - tx, cy + ty), (cx + tx, cy + ty), (cx, tip_y)], fill=color)
    draw.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=color)
    return (cx - r_in, cy - r_in, cx + r_in, cy + r_in)

def make(size=S):
    im = background(size)
    font = ImageFont.truetype(FONT, int(size * 0.40))
    d = ImageDraw.Draw(im)
    # 'o' 크기를 기준으로 핀 크기를 맞춤
    ob = d.textbbox((0, 0), 'o', font=font)
    o_h = ob[3] - ob[1]
    db, wb = d.textbbox((0, 0), 'd', font=font), d.textbbox((0, 0), 'w', font=font)
    gap = size * 0.012
    r_out = o_h * 0.56
    r_in = r_out * 0.46
    pin_w = r_out * 2
    total = (db[2] - db[0]) + gap + pin_w + gap + (wb[2] - wb[0])
    x0 = (size - total) / 2
    baseline_y = size * 0.60           # 글자 바닥선
    top_of_o = baseline_y - o_h
    # d, w 그리기 (bbox 오프셋 보정)
    d.text((x0 - db[0], baseline_y - db[3]), 'd', font=font, fill='white')
    px = x0 + (db[2] - db[0]) + gap
    wx = px + pin_w + gap
    d.text((wx - wb[0], baseline_y - wb[3]), 'w', font=font, fill='white')
    # 핀: 머리는 o 자리, 꼬리는 바닥선 아래로. 별도 레이어에 그리고 가운데 구멍을 뚫어 배경이 비치게 함
    cx, cy = px + r_out, top_of_o + o_h / 2 - o_h * 0.04
    ty = baseline_y + o_h * 0.62
    base = im.convert('RGBA')
    sh = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([cx - r_out * 0.55, ty - r_out * 0.10, cx + r_out * 0.55, ty + r_out * 0.12], fill=(0, 0, 0, 90))
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(size * 0.008)))
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    hole = pin(ld, cx, cy, r_out, r_in, ty, CORAL + (255,))
    ld.ellipse(hole, fill=(0, 0, 0, 0))
    base.alpha_composite(layer)
    return base.convert('RGB')

out = sys.argv[1]
big = make()
big.resize((1024, 1024), Image.LANCZOS).save(f'{out}/dow-1024.png', optimize=True)
