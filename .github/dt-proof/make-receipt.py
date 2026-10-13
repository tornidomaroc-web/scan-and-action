# A photographic-looking receipt for the proof harness: thermal paper on a
# table, slightly turned, with grain, faded print and a soft shadow. Fictional
# merchant data; no TOTAL line (the "Total not printed" case). Items sum to 2,412.50.
import random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

random.seed(7)
W, H = 640, 1180
mono = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 27)
monob = ImageFont.truetype('C:/Windows/Fonts/consolab.ttf', 34)
small = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 22)

paper = Image.new('L', (W, H), 246)
px = paper.load()
for y in range(H):
    for x in range(W):
        px[x, y] = max(0, min(255, 246 - int(6 * (y / H)) + random.randint(-5, 5)))
d = ImageDraw.Draw(paper)
def c(t, y, f=mono):
    w = d.textlength(t, font=f); d.text(((W - w) / 2, y), t, font=f, fill=40)
c('CARREFOUR MARKET', 70, monob)
c('MAARIF  CASABLANCA', 118)
c('Bd Al Massira, 20330', 154, small)
c('12/10/2026   14:06   CAISSE 07', 190, small)
d.text((50, 240), '-' * 34, font=mono, fill=90)
items = [('Machine a cafe', '1249.00'), ('Huile olive 5L x4', '312.00'), ('Dattes Medjool 5kg', '286.50'), ('Safran 50g', '420.00'), ('Huile argan 1L x2', '145.00')]
y = 285
for name, amt in items:
    d.text((50, y), name, font=mono, fill=35); w = d.textlength(amt, font=mono); d.text((W - 50 - w, y), amt, font=mono, fill=35); y += 46
d.text((50, y + 4), '-' * 34, font=mono, fill=90)
y += 56
for line in ['ARTICLES : 9', 'CB  **** 4421', 'MERCI DE VOTRE VISITE']:
    c(line, y, small); y += 40
# A barcode, and the print fading toward the bottom edge.
for i in range(70):
    if random.random() < 0.6:
        x = 120 + i * 6; d.rectangle((x, y + 30, x + random.choice([2, 3, 4]), y + 120), fill=45)
fade = Image.linear_gradient('L').resize((W, H)).point(lambda v: int(v * 0.35))
paper = ImageChops.add(paper, fade)
# Torn top and bottom edges.
mask = Image.new('L', (W, H), 255); md = ImageDraw.Draw(mask)
for x in range(0, W, 8):
    md.polygon([(x, 0), (x + 8, 0), (x + 4, random.randint(3, 10))], fill=0)
    md.polygon([(x, H), (x + 8, H), (x + 4, H - random.randint(3, 10))], fill=0)

rgb = Image.merge('RGB', [paper, paper, paper.point(lambda v: max(0, v - 6))])
table = Image.new('RGB', (900, 1300), (92, 78, 64))
tp = table.load()
for yy in range(1300):
    for xx in range(900):
        g = int(10 * ((xx // 3 + yy // 40) % 7) / 7) + random.randint(-6, 6)
        r, gg, b = tp[xx, yy]; tp[xx, yy] = (r + g, gg + g, b + g)
shadow = Image.new('L', (W, H), 0); shadow.paste(150, (0, 0), mask)
shadow = shadow.rotate(-2.2, expand=True, fillcolor=0).filter(ImageFilter.GaussianBlur(14))
rot = rgb.rotate(-2.2, expand=True, resample=Image.BICUBIC, fillcolor=(0, 0, 0))
rmask = mask.rotate(-2.2, expand=True, fillcolor=0)
ox, oy = (900 - rot.width) // 2, (1300 - rot.height) // 2 + 10
table.paste((30, 22, 16), (ox + 14, oy + 22), shadow)
table.paste(rot, (ox, oy), rmask)
light = Image.radial_gradient('L').resize((900, 1300)).point(lambda v: int(v * 0.35))
table = ImageChops.subtract(table, Image.merge('RGB', [light] * 3))
table = table.filter(ImageFilter.GaussianBlur(0.6))
table.save(sys.argv[1], 'JPEG', quality=78)
print('saved', sys.argv[1])
