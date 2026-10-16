"""Export approved ImageGen art. Requires ImageMagick; no generation/API calls.

Run from repo root with the original generated_images directory as argument.
Alpha threshold is an explicit pixel-export cleanup, not a new painting.
"""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
sources = Path(sys.argv[1])
approved = {
    'cass': ('e16efc34-41e4-4da4-9c92-a7772a3e3bd6', '9f2374df-cc04-4303-ae63-a6f425461421'),
    'vera': ('75137fde-2d50-41de-8bf3-a5a1c60f868a', '3e89d64d-94c9-463a-8e68-d7d7a0fda4eb'),
    'kris': ('01c8e697-26f7-4ed3-a1ac-9cc6059b670c', '4c9c060f-28e7-4390-8033-5bc89cc7b4e5'),
    'owner': ('b8942434-52a7-417d-af42-50b1b69efb86', '3c8cf6b6-be85-45f4-a13b-361f6dffd6b5'),
}


def convert(*args):
    subprocess.run(['convert', *map(str, args)], check=True)


manifest = {'version': 1, 'characters': {}}
for character, (master_id, pixel_id) in approved.items():
    out = root / 'public/characters' / character
    out.mkdir(parents=True, exist_ok=True)
    master = sources / f'exec-{master_id}.png'
    pixel = sources / f'exec-{pixel_id}.png'
    # Full-resolution selected master retained; WebP quality is explicitly recorded.
    convert(master, '-strip', '-quality', '95', out / 'master.webp')
    convert(master, '-resize', '768x1152!', '-strip', '-quality', '90', out / 'portrait.webp')
    # All approved masters have a face in this upper-centre crop; inspected per character.
    convert(master, '-crop', '512x512+256+0', '+repage', '-resize', '256x256!',
            '-strip', '-quality', '92', out / 'avatar.webp')
    # Generated alpha includes diffuse halos. Binary alpha at 90% keeps solid
    # character pixels, removes haze, then trim and nearest-neighbour export.
    convert(pixel, '-channel', 'A', '-threshold', '90%', '+channel',
            '-trim', '+repage', '-filter', 'point', '-resize', '40x88',
            '-background', 'none', '-gravity', 'south', '-extent', '48x92',
            '-gravity', 'north', '-extent', '48x96', '-strip', out / 'idle.png')
    manifest['characters'][character] = {
        'master': {'src': f'/characters/{character}/master.webp', 'width': 1024, 'height': 1536,
                   'format': 'webp', 'transparent': False, 'quality': 95},
        'portrait': {'src': f'/characters/{character}/portrait.webp', 'width': 768, 'height': 1152,
                     'format': 'webp', 'transparent': False},
        'avatar': {'src': f'/characters/{character}/avatar.webp', 'width': 256, 'height': 256,
                   'format': 'webp', 'transparent': False},
        'pixel': {'src': f'/characters/{character}/idle.png', 'width': 48, 'height': 96,
                  'format': 'png', 'transparent': True, 'frames': 1, 'columns': 1, 'rows': 1,
                  'direction': 'front-three-quarter', 'baselineY': 92,
                  'sampling': 'nearest-neighbor', 'alpha': 'binary'},
        'fallback': 'initial', 'generatedMaster': f'exec-{master_id}.png',
        'generatedPixel': f'exec-{pixel_id}.png',
    }
(root / 'public/characters/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
