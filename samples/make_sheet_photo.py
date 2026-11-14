"""Writes handwritten-style answers onto a blank REDPEN sheet and fakes a tilted phone photo.
Synthetic test data for the scanner + on-device reading path (clearly not real pupil work).
Usage: python make_sheet_photo.py blank.png out.jpg [answers name seed]
  answers: comma-separated, one per box (default: the sample sheet's B,D,B,Abuja,runned); name and seed are optional."""
import random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ANSWERS = [(62, 16, 'B'), (83, 16, 'D'), (104, 16, 'B'), (125, 18, 'Abuja'), (148, 18, 'runned')]  # (box_y_mm, box_h_mm, text)
NAME = 'Chidi Okafor'

def solve(A, b):
    n = len(b); M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]; M[r] = [a - f * bb for a, bb in zip(M[r], M[c])]
    return [M[i][n] / M[i][i] for i in range(n)]

def perspective(pa, pb):
    A, B = [], []
    for (x, y), (u, v) in zip(pa, pb):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return solve(A, B)

def main(blank, out, seed=7, answers=None, name=None):
    random.seed(seed)
    global ANSWERS, NAME
    if answers: ANSWERS = [(y, h, t) for (y, h, _), t in zip(ANSWERS, answers)]
    if name: NAME = name
    sheet = Image.open(blank).convert('RGB'); W, H = sheet.size; px = W / 210.0
    font = ImageFont.truetype('Caveat.ttf', int(11 * px)); ink = (28, 38, 92, 255)
    for y, h, text in ANSWERS:
        layer = Image.new('RGBA', (int(70 * px), int(h * px)), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((2, 0), text, font=font, fill=ink)
        layer = layer.rotate(random.uniform(-4, 4), resample=Image.BICUBIC)
        sheet.paste(layer, (int((40 + random.uniform(-2, 4)) * px), int((y + h * 0.22) * px)), layer)
    ImageDraw.Draw(sheet).text((50 * px, 33.5 * px), NAME, font=ImageFont.truetype('Caveat.ttf', int(9 * px)), fill=ink)
    table = Image.new('RGB', (int(W * 1.35), int(H * 1.25)), (84, 66, 52))
    table = Image.blend(table, Image.effect_noise(table.size, 18).convert('RGB'), 0.12)
    tw, th = table.size
    dst = [(tw * 0.13, th * 0.07), (tw * 0.86, th * 0.10), (tw * 0.90, th * 0.93), (tw * 0.09, th * 0.90)]
    c = perspective(dst, [(0, 0), (W, 0), (W, H), (0, H)])
    table.paste(sheet.transform(table.size, Image.PERSPECTIVE, c, Image.BICUBIC), (0, 0),
                Image.new('L', sheet.size, 255).transform(table.size, Image.PERSPECTIVE, c, Image.BICUBIC))
    grad = Image.linear_gradient('L').resize(table.size).rotate(35)
    photo = ImageChops.multiply(table, Image.merge('RGB', [grad.point(lambda v: 205 + v // 5)] * 3)).filter(ImageFilter.GaussianBlur(0.8))
    photo.resize((int(photo.width * 0.75), int(photo.height * 0.75)), Image.LANCZOS).save(out, quality=85)

if __name__ == '__main__':
    a = sys.argv
    main(a[1], a[2], seed=int(a[5]) if len(a) > 5 else 7,
         answers=a[3].split(',') if len(a) > 3 else None, name=a[4] if len(a) > 4 else None)
