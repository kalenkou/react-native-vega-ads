"""Renders the demo ad creatives used by the sample VAST and the demo app.

Every frame is drawn here, so the creatives carry no third-party footage,
logos or trademarks. The brands are invented.

Usage: python3 make_ads.py --font Inter.ttf --out DIR
Needs Pillow and an ffmpeg with libx264 and aac on PATH.
"""

import argparse
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FPS = 30

ADS = [
    {
        "id": "kettlo",
        "brand": "KETTLO",
        "line": "Kettlebells that last a lifetime",
        "seconds": 10,
        "colors": ((20, 24, 38), (232, 93, 4)),
        "tone": 220.0,
    },
    {
        "id": "brewnord",
        "brand": "Brewnord",
        "line": "Slow coffee for long evenings",
        "seconds": 15,
        "colors": ((44, 30, 22), (214, 170, 110)),
        "tone": 261.6,
    },
    {
        "id": "voltaro",
        "brand": "VOLTARO",
        "line": "Charge at home. Drive all week.",
        "seconds": 12,
        "colors": ((8, 40, 56), (64, 224, 196)),
        "tone": 329.6,
    },
    {
        "id": "ferntop",
        "brand": "Ferntop",
        "line": "Trail shoes for wet mornings",
        "seconds": 10,
        "colors": ((18, 40, 24), (140, 200, 90)),
        "tone": 293.7,
    },
    {
        "id": "quillary",
        "brand": "QUILLARY",
        "line": "Notebooks that open flat",
        "seconds": 12,
        "colors": ((40, 20, 44), (230, 150, 220)),
        "tone": 246.9,
    },
]

SIZES = [(1920, 1080, 4500), (1280, 720, 2500)]


def font(path, size, weight):
    face = ImageFont.truetype(str(path), size)
    try:
        face.set_variation_by_axes([14, weight])
    except (OSError, ValueError):
        pass
    return face


def draw_frame(ad, width, height, t, fonts):
    dark, accent = ad["colors"]
    image = Image.new("RGB", (width, height), dark)
    draw = ImageDraw.Draw(image)
    scale = height / 1080

    # A slow moving disc, so motion and frame drops are easy to see.
    phase = t / ad["seconds"]
    radius = int(260 * scale)
    cx = int(width * (0.25 + 0.5 * phase))
    cy = int(height * 0.42 + math.sin(phase * math.pi * 2) * 60 * scale)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=tuple(c // 3 + d // 2 for c, d in zip(accent, dark)))

    fade = min(1.0, t / 0.6)
    brand_color = tuple(int(d + (a - d) * fade) for a, d in zip(accent, dark))
    draw.text((width / 2, height * 0.42), ad["brand"], font=fonts["brand"], fill=brand_color, anchor="mm")
    draw.text((width / 2, height * 0.58), ad["line"], font=fonts["line"], fill=(240, 240, 240), anchor="mm")
    draw.text((width / 2, height * 0.92), "Demo ad · invented brand", font=fonts["small"], fill=(150, 150, 150), anchor="mm")

    bar = int(width * min(1.0, t / ad["seconds"]))
    draw.rectangle((0, height - int(10 * scale), bar, height), fill=accent)
    return image


def render(ad, width, height, kbps, font_path, out_dir):
    scale = height / 1080
    fonts = {
        "brand": font(font_path, int(180 * scale), 800),
        "line": font(font_path, int(64 * scale), 500),
        "small": font(font_path, int(30 * scale), 400),
    }
    target = out_dir / f"{ad['id']}_{height}p.mp4"
    seconds = ad["seconds"]
    tone = ad["tone"]
    audio = (
        f"sine=f={tone}:d={seconds}[a];sine=f={tone * 1.5}:d={seconds}[b];"
        f"[a][b]amix=inputs=2,volume=0.25,afade=t=in:d=0.5,afade=t=out:st={seconds - 0.8}:d=0.8"
    )
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{width}x{height}", "-r", str(FPS), "-i", "-",
        "-f", "lavfi", "-i", audio,
        "-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
        "-b:v", f"{kbps}k", "-maxrate", f"{kbps}k", "-bufsize", f"{kbps * 2}k", "-g", str(FPS * 2),
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-shortest", "-movflags", "+faststart", str(target),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    for index in range(seconds * FPS):
        process.stdin.write(draw_frame(ad, width, height, index / FPS, fonts).tobytes())
    process.stdin.close()
    if process.wait() != 0:
        raise SystemExit(f"ffmpeg failed for {target}")
    print(target)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--font", required=True, type=Path, help="TTF font with an open licence, e.g. Inter")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    for ad in ADS:
        for width, height, kbps in SIZES:
            render(ad, width, height, kbps, args.font, args.out)


if __name__ == "__main__":
    main()
