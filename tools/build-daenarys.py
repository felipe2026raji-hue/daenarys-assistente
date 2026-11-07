"""Builds Daenarys' art from the reference sheet (tools/daenarys-sheet.png).

The sheet is 4x3 frames of the same character. This script takes the front idle frame,
cuts off the empty margin, and writes:

    assets/capri/capri-full.png      the sprite the desktop app draws
    assets/capri/capri-cutout.png    the same drawing (kept for the old tools)
    assets/capri/face-*.png          her expressions in the panel
    assets/capri/capri-face.png      her portrait (panel, chip, icon)
    assets/capri/cutin-*.png         close-ups used by her effects
    assets/icons/tray.png            the tray icon
    assets/icons/capri.png           the big icon
    assets/icons/capri.ico           the Windows icon

Run with the project venv that has Pillow:

    python tools/build-daenarys.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / 'tools' / 'daenarys-sheet.png'
ART = ROOT / 'assets' / 'capri'
ICONS = ROOT / 'assets' / 'icons'

COLS, ROWS = 4, 3
FRAME = 'r0c0'          # front idle, eyes open, cape spread
WIDTH, HEIGHT = 440, 460
PAD = 30                # room for the glitch/echo effects, see src/renderer/js/sprite.js
CONTENT_H = 400
BOTTOM = 452
GOLD = (214, 168, 82, 255)
NAVY = (11, 18, 48, 255)
NAVY_2 = (27, 42, 85, 255)
CREAM = (248, 238, 214, 255)
INK = (17, 15, 26, 255)


def tight(image, threshold=16):
    alpha = image.getchannel('A').point(lambda a: 255 if a > threshold else 0)
    box = alpha.getbbox()
    return image.crop(box) if box else image


def frame(name):
    im = Image.open(SHEET).convert('RGBA')
    r, c = int(name[1]), int(name[3])
    cw, ch = im.width // COLS, im.height // ROWS
    cell = im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
    return tight(cell)


def fit_height(image, height):
    k = height / image.height
    return image.resize((max(1, round(image.width * k)), height), Image.LANCZOS)


def portrait(source, name):
    """A square crop of her face, for the panel (58x58 css px)."""
    w, h = source.size
    box = (int(w * 0.30), 0, int(w * 0.70), int(h * 0.42))
    face = source.crop(box)
    side = max(face.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.alpha_composite(face, ((side - face.width) // 2, 0))
    square = square.resize((256, 256), Image.LANCZOS)
    square.save(ART / name, optimize=True)


def cutin(source, name, flip=False):
    """A 360x240 close-up card in her navy and gold."""
    w, h = 360, 240
    card = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    bg = Image.new('RGB', (w, h), NAVY)
    d = ImageDraw.Draw(bg)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=(
            round(NAVY[0] + (NAVY_2[0] - NAVY[0]) * t),
            round(NAVY[1] + (NAVY_2[1] - NAVY[1]) * t),
            round(NAVY[2] + (NAVY_2[2] - NAVY[2]) * t),
            255,
        ))
    # stars and a thin gold frame
    for i in range(26):
        x = (i * 97 + 31) % w
        y = (i * 53 + 17) % h
        r = 1 if i % 4 else 2
        d.ellipse((x - r, y - r, x + r, y + r), fill=(230, 200, 130, 210 if i % 3 else 255))
    d.rectangle((1, 1, w - 2, h - 2), outline=GOLD, width=1)
    card = Image.alpha_composite(card, bg.convert('RGBA'))

    face = source.crop((int(source.width * 0.18), 0, int(source.width * 0.86), int(source.height * 0.56)))
    face = fit_height(face, 300)
    if flip:
        face = face.transpose(Image.FLIP_LEFT_RIGHT)
    card.alpha_composite(face, (w - face.width + 10, h - face.height + 14))

    # fade into the card on the left
    mask = Image.new('L', (w, h), 255)
    md = ImageDraw.Draw(mask)
    for x in range(90):
        md.line([(x, 0), (x, h)], fill=max(0, int(255 * (x / 90))))
    dark = Image.new('RGBA', (w, h), NAVY)
    dark.putalpha(mask.point(lambda a: 200 - int(a * 0.78)))
    card = Image.alpha_composite(card, dark)
    card.save(ART / name, optimize=True)


def icon(source, size=256):
    """A rounded navy tile with her face, so it reads at 16px too."""
    tile = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=NAVY, outline=GOLD, width=max(2, size // 64))
    face = portrait_square(source).resize((size, size), Image.LANCZOS)
    # keep only the middle of the portrait, over the tile
    mask = Image.new('L', (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((size // 12, size // 12, size - size // 12, size - size // 12), radius=size // 6, fill=255)
    tile.paste(face, (0, 0), mask)
    return tile


def portrait_square(source):
    w, h = source.size
    box = (int(w * 0.30), 0, int(w * 0.70), int(h * 0.42))
    face = source.crop(box)
    side = max(face.size)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.alpha_composite(face, ((side - face.width) // 2, 0))
    return square


def main():
    ART.mkdir(parents=True, exist_ok=True)
    ICONS.mkdir(parents=True, exist_ok=True)

    front = frame(FRAME)
    # the sprite: scaled to a fixed height and sat on the bottom of the canvas
    sprite = fit_height(front, CONTENT_H)
    canvas = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    x = (WIDTH - sprite.width) // 2
    y = BOTTOM - sprite.height
    canvas.alpha_composite(sprite, (x, y))
    canvas.save(ART / 'capri-full.png', optimize=True)
    canvas.save(ART / 'capri-cutout.png', optimize=True)
    print('sprite', canvas.size, 'art', sprite.size, 'at', (x, y))

    # expressions: open eyes, closed eyes, wink, side look, wide eyes
    portrait(frame('r0c0'), 'face-calm.png')
    portrait(frame('r0c1'), 'face-look.png')
    portrait(frame('r0c2'), 'face-wide.png')
    portrait(frame('r0c3'), 'face-smug.png')
    portrait(frame('r1c2'), 'face-laugh.png')
    portrait(frame('r2c0'), 'face-aside.png')
    portrait(frame('r2c3'), 'face-many.png')
    portrait(frame('r0c0'), 'capri-face.png')

    # cut-ins (360x240): a few moods, same art
    cutin(frame('r0c0'), 'cutin-grin.png')
    cutin(frame('r1c2'), 'cutin-laugh.png')
    cutin(frame('r0c2'), 'cutin-eyes.png')
    cutin(frame('r0c1'), 'cutin-look.png')
    cutin(frame('r2c3'), 'cutin-many.png', flip=True)

    # icons
    big = icon(frame('r0c0'), 256)
    big.save(ICONS / 'capri.png', optimize=True)
    big.resize((32, 32), Image.LANCZOS).save(ICONS / 'tray.png', optimize=True)
    big.save(ICONS / 'capri.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('icons ok')


if __name__ == '__main__':
    main()
