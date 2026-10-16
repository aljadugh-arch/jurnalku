#!/usr/bin/env python3
"""
gen-brand-assets.py — regenerate semua aset brand JURNALKU (logo, favicon, ikon PWA)
dari satu sumber PNG bertumpuk: emblem + wordmark + tagline.

Sumber : /home/aljadugh/Downloads/jurnal_logo_transparan.png  (627 x 1254)
Output : public/{logo-jurnalku.png, logo-jurnalku-256.png, logo-lockup.png,
         favicon-64.png, favicon.ico, favicon.svg,
         icon-192.png, icon-512.png, icon-maskable-512.png,
         apple-touch-icon.png, og-image.png}

Catatan teknis:
- Kotak emblem = (34,287)-(514,767) 480x480, diambil dari peta komponen gambar
  (di bawahnya ada baris wordmark "JURNALKU" + tagline yang tidak terbaca pada
  kotak 36px sidebar, jadi tidak dipakai untuk ikon persegi).
- Latar artwork BUKAN putih rata: ada tekstur/glow abu terang (~230-246) berperiode
  ~5px. Karena itu keying pakai MedianFilter(9) dulu supaya teksturnya rata, baru
  threshold luma >= 230 + flood-fill dari tepi; hasilnya siluet bersih tanpa
  melubangi area terang di dalam mark. Dilate 1px membuang fringe latar.
"""
import base64, io, os, struct, sys
from collections import deque
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/aljadugh/Downloads/jurnal_logo_transparan.png'

EMBLEM_BOX = (34, 287, 514, 767)   # 480x480 — mark saja
LOCKUP_BOX = (14, 272, 606, 975)   # seluruh logo (emblem + JURNAL KU + tagline)
BG_LUMA = 230                      # >= ini = latar (setelah median blur)
Lanczos = Image.Resampling.LANCZOS


def cut_background(im: Image.Image) -> Image.Image:
    """Jadikan latar terang jadi transparan; pertahankan RGB asli."""
    im = im.convert('RGB')
    w, h = im.size
    blur = im.filter(ImageFilter.MedianFilter(9)).convert('L').load()

    mask = bytearray(w * h)
    q = deque()

    def bg(x, y):
        return blur[x, y] >= BG_LUMA

    for x in range(w):
        for y in (0, h - 1):
            if bg(x, y) and not mask[y * w + x]:
                mask[y * w + x] = 1; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if bg(x, y) and not mask[y * w + x]:
                mask[y * w + x] = 1; q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not mask[ny * w + nx] and bg(nx, ny):
                mask[ny * w + nx] = 1; q.append((nx, ny))

    grown = bytearray(w * h)                     # dilate 1px -> buang fringe latar
    for y in range(h):
        for x in range(w):
            if mask[y * w + x]:
                for ny in range(max(0, y - 1), min(h, y + 2)):
                    for nx in range(max(0, x - 1), min(w, x + 2)):
                        grown[ny * w + nx] = 1

    alpha = Image.frombytes('L', (w, h), bytes(255 if v == 0 else 0 for v in grown))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out


def square(im, side, scale, bg=(0, 0, 0, 0)):
    """Skala `im` agar memenuhi `scale` x sisi, taruh tengah di kanvas persegi."""
    target = max(1, int(round(side * scale)))
    w, h = im.size
    k = min(target / w, target / h)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    mark = im.resize((nw, nh), Lanczos)
    canvas = Image.new('RGBA', (side, side), bg)
    canvas.paste(mark, ((side - nw) // 2, (side - nh) // 2), mark)
    return canvas


def save(im, name):
    p = os.path.join(PUB, name)
    im.save(p, 'PNG', optimize=True)
    print(f'  {name:24s} {im.size[0]}x{im.size[1]:<4d} {os.path.getsize(p)/1024:8.1f} KB')


def write_ico(sizes_png, name):
    """ICO berisi payload PNG (didukung semua browser modern)."""
    n = len(sizes_png)
    head = struct.pack('<HHH', 0, 1, n)
    entries, blobs, offset = b'', b'', 6 + 16 * n
    for side, data in sizes_png:
        s = 0 if side >= 256 else side
        entries += struct.pack('<BBBBHHII', s, s, 0, 0, 1, 32, len(data), offset)
        blobs += data; offset += len(data)
    p = os.path.join(PUB, name)
    with open(p, 'wb') as f:
        f.write(head + entries + blobs)
    print(f'  {name:24s} {[s for s, _ in sizes_png]}  {os.path.getsize(p)/1024:8.1f} KB')


def write_svg(im256, name):
    buf = io.BytesIO(); im256.save(buf, 'PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    p = os.path.join(PUB, name)
    with open(p, 'w') as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">'
                f'<image width="256" height="256" href="data:image/png;base64,{b64}"/></svg>')
    print(f'  {name:24s} svg 256x256  {os.path.getsize(p)/1024:8.1f} KB')


def main():
    print(f'sumber : {SRC}')
    src = Image.open(SRC).convert('RGB')
    print(f'ukuran : {src.size[0]}x{src.size[1]}')

    emblem = cut_background(src.crop(EMBLEM_BOX))
    print(f'emblem : {emblem.size[0]}x{emblem.size[1]} (latar dibuang)')

    print('ikon persegi, latar transparan (mark 92%):')
    save(square(emblem, 512, 0.92), 'logo-jurnalku.png')
    save(square(emblem, 256, 0.92), 'logo-jurnalku-256.png')
    save(square(emblem, 192, 0.92), 'icon-192.png')
    save(square(emblem, 512, 0.92), 'icon-512.png')
    save(square(emblem, 64, 0.92), 'favicon-64.png')

    print('ikon latar penuh (maskable + apple-touch):')
    save(square(emblem, 512, 0.62, bg=(255, 255, 255, 255)), 'icon-maskable-512.png')
    save(square(emblem, 180, 0.80, bg=(255, 255, 255, 255)), 'apple-touch-icon.png')

    print('favicon.ico + favicon.svg:')
    ico = []
    for s in (16, 32, 48, 64):
        b = io.BytesIO(); square(emblem, s, 0.94).save(b, 'PNG', optimize=True)
        ico.append((s, b.getvalue()))
    write_ico(ico, 'favicon.ico')
    write_svg(square(emblem, 256, 0.94), 'favicon.svg')

    print('lockup penuh + og-image:')
    full = cut_background(src.crop(LOCKUP_BOX))
    save(full, 'logo-lockup.png')
    k = min(520 / full.size[0], 470 / full.size[1])
    nw, nh = max(1, round(full.size[0] * k)), max(1, round(full.size[1] * k))
    mark = full.resize((nw, nh), Lanczos)
    og = Image.new('RGB', (1200, 630), (255, 255, 255))
    og.paste(mark, ((1200 - nw) // 2, (630 - nh) // 2), mark)
    p = os.path.join(PUB, 'og-image.png')
    og.save(p, 'PNG', optimize=True)
    print(f'  {"og-image.png":24s} 1200x630  {os.path.getsize(p)/1024:8.1f} KB (lockup {nw}x{nh})')
    print('selesai.')


if __name__ == '__main__':
    main()