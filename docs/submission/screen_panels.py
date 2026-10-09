"""Compose annotated viewport excerpts captured by capture.cjs."""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont

p = argparse.ArgumentParser()
p.add_argument('screens', type=Path)
p.add_argument('--font', type=Path, required=True, help='Path to a TrueType sans font')
a = p.parse_args()
out = Path(__file__).resolve().parents[1] / 'wiki' / 'images'
font = ImageFont.truetype(str(a.font), 25)
small = ImageFont.truetype(str(a.font), 21)
groups = {
    'consumer': [('scr-01','01 / Discover','Browse farms and products'), ('scr-04','02 / Product','Review quality and timing'), ('scr-10','03 / Checkout','Agree to terms and pay')],
    'producer': [('p-scr-22','01 / Dashboard','Review demand and tasks'), ('p-scr-25-sales','02 / Sales settings','Manage periods and supply'), ('p-scr-28-room','03 / Own news room','Write news from the room')],
    'error': [('s-10-noconsent','01 / Missing consent','Complete all four agreements'), ('s-10-stagechanged','02 / Changed terms','Review and confirm again'), ('s-21-rejected','03 / Application rejected','Revise and reapply')],
}
for group, frames in groups.items():
    canvas = Image.new('RGB', (1290, 1020), '#ffffff')
    draw = ImageDraw.Draw(canvas)
    for n,(name,title,caption) in enumerate(frames):
        x = 20 + n * 430
        draw.text((x, 15), title, font=font, fill='#18352d')
        with Image.open(a.screens / (name + '.png')) as source:
            canvas.paste(source.convert('RGB').resize((390,844), Image.Resampling.LANCZOS), (x,65))
        draw.rectangle((x-1,64,x+390,909), outline='#c8d5cf', width=2)
        draw.text((x,928), caption, font=small, fill='#18352d')
        draw.text((x,967), 'Design frame / viewport excerpt', font=small, fill='#697b74')
    canvas.save(out / f'i1-{group}-screens.png', optimize=True)
print('Wrote three annotated screen panels')
