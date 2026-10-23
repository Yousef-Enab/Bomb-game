#!/usr/bin/env python3
"""يحوّل ملفات GIF الأصلية (tools/source) إلى شرائح إطارات PNG بلا أي تغيير في البكسلات،
ويكتب public/sprites.js (أبعاد الإطارات + مدة كل إطار من الـGIF نفسه).
كما يولّد ثلاث أيقونات بسيطة غير مرفقة منك: heart.png و bomb.png و arrow.png (مولَّدة — استبدلها بأصولك متى شئت).
التشغيل:  python3 tools/make_sprites.py   (يحتاج Pillow)"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'tools' / 'source', ROOT / 'public'
DIRS = ['south', 'south-west', 'west', 'north-west', 'north', 'north-east', 'east', 'south-east']


def frames(path):
    im, out, ms = Image.open(path), [], []
    for i in range(im.n_frames):
        im.seek(i)
        out.append(im.convert('RGBA').copy())
        ms.append(im.info.get('duration', 100))
    return out, ms


def sheet(rows, cell, cols):
    """rows: قائمة صفوف، كل صف قائمة إطارات؛ الإطار الأصغر من الخلية يُوسَّط (بلا تحجيم)."""
    s = Image.new('RGBA', (cols * cell[0], len(rows) * cell[1]), (0, 0, 0, 0))
    for r, row in enumerate(rows):
        for c, f in enumerate(row):
            s.paste(f, (c * cell[0] + (cell[0] - f.width) // 2, r * cell[1] + (cell[1] - f.height) // 2))
    return s


def art(rows, pal, scale=1):
    w = len(rows[0]); assert all(len(r) == w for r in rows), 'rows must be equal width'
    im = Image.new('RGBA', (w, len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if pal.get(ch): im.putpixel((x, y), pal[ch] + (255,))
    return im


PAL = dict(X=(42, 26, 18), R=(216, 58, 46), W=(255, 236, 200), E=(88, 70, 70), D=(58, 62, 82), G=(104, 112, 140), F=(120, 80, 40),
           Y=(255, 214, 77), O=(255, 138, 42), S=(150, 100, 50), H=(168, 172, 184), r=(190, 50, 50))
HEART = ['.XXX.XXX.', 'XRRRXRRRX', 'XRWRRRRRX', 'XRRRRRRRX', 'XRRRRRRRX', '.XRRRRRX.', '..XRRRX..', '...XRX...', '....X....']
BOMB = ['................'] * 3 + ['..........F.....', '.........F......', '......XXXX......', '.....XDDDDX.....', '....XDGGDDDX....',
        '...XDGWGDDDDX...', '...XDGGDDDDDX...', '...XDDDDDDDDX...', '...XDDDDDDDDX...', '....XDDDDDDX....', '.....XDDDDX.....', '......XXXX......', '................']
SPARKS = [[(10, 2, 'Y'), (11, 1, 'O'), (9, 1, 'O'), (10, 0, 'O')], [(10, 2, 'O'), (11, 2, 'Y'), (10, 1, 'Y'), (9, 2, 'O')],
          [(10, 2, 'Y'), (11, 3, 'O'), (9, 3, 'O'), (10, 1, 'O'), (12, 2, 'O')]]
ARROW = ['................', 'r.r.........H...', '.rr........HH...', 'rrSSSSSSSSSSHHH.', '.rr........HH...', 'r.r.........H...', '................']


def main():
    meta = {}
    # اللاعبون: 8 اتجاهات × 4 إطارات (64×64)
    pl = [frames(SRC / f'Idle_breathing-idle_{d}.gif') for d in DIRS]
    sheet(pl and [f for f, _ in pl], (64, 64), 4).save(OUT / 'sheet_player.png')
    meta['player'] = dict(url='/sheet_player.png', w=64, h=64, cols=4, rows=8, vis=dict(x=23, y=12, w=18, h=40), foot=51,
                          anim={d: dict(row=i, ms=m) for i, (d, (_, m)) in enumerate(zip(DIRS, pl))})
    # الرامي: reload / idle / shoot (الخلية 80×80؛ إطارات 76×76 تُوسَّط بلا تحجيم)
    ar = {k: frames(SRC / f'Archer_{n}_animation.gif') for k, n in [('reload', 'reloading'), ('idle', 'idle'), ('shoot', 'shooting')]}
    sheet([ar[k][0] for k in ('reload', 'idle', 'shoot')], (80, 80), 9).save(OUT / 'sheet_archer.png')
    meta['archer'] = dict(url='/sheet_archer.png', w=80, h=80, cols=9, rows=3, vis=dict(x=16, y=15, w=48, h=51), foot=65,
                          muzzle=[77, 38], releaseFrame=8, faces='east',
                          anim={k: dict(row=i, ms=ar[k][1]) for i, k in enumerate(('reload', 'idle', 'shoot'))})
    # أيقونات مولَّدة (ليست من أصولك)
    full, empty = art(HEART, PAL), art([r.replace('R', 'E').replace('W', 'E') for r in HEART], PAL)
    h = Image.new('RGBA', (18, 9)); h.paste(full, (0, 0)); h.paste(empty, (9, 0)); h.save(OUT / 'heart.png')
    meta['heart'] = dict(url='/heart.png', w=9, h=9, cols=2, rows=1, generated=True, frames=dict(full=0, empty=1))
    b = Image.new('RGBA', (48, 16))
    for i, sp in enumerate(SPARKS):
        rows = [list(r) for r in BOMB]
        for x, y, c in sp: rows[y][x] = c
        b.paste(art([''.join(r) for r in rows], PAL), (i * 16, 0))
    b.save(OUT / 'bomb.png')
    meta['bomb'] = dict(url='/bomb.png', w=16, h=16, cols=3, rows=1, generated=True, anim=dict(fuse=dict(row=0, ms=[120, 120, 120])))
    art(ARROW, PAL).save(OUT / 'arrow.png')
    meta['arrow'] = dict(url='/arrow.png', w=16, h=7, cols=1, rows=1, generated=True)
    (OUT / 'sprites.js').write_text('// مولَّد بواسطة tools/make_sprites.py — أعد تشغيل السكربت بدل التعديل اليدوي.\nexport const SHEETS = '
                                    + json.dumps(meta, ensure_ascii=False, indent=1) + ';\n', encoding='utf-8')
    print('ok', {k: (v['w'], v['h']) for k, v in meta.items()})


main()
