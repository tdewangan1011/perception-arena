"""Apply hand-traced material color and tone edits to documentary photos."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

from .design import SIZE
from .stimulus import ASSETS

PHOTO_DIR = ASSETS / "change"


def source_scenes():
    sources = json.loads((PHOTO_DIR / "manifest.json").read_text(encoding="utf-8"))
    edits = json.loads((PHOTO_DIR / "edits.json").read_text(encoding="utf-8"))
    return [(source, edits[source["id"]]) for source in sources]


def trace_mask(polygons, holes):
    scale = 3
    mask = Image.new("L", (scale * SIZE, scale * SIZE))
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon([(x * scale, y * scale) for x, y in polygon], fill=255)
    for polygon in holes:
        draw.polygon([(x * scale, y * scale) for x, y in polygon], fill=0)
    return mask.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def render_pair(path: Path, edit):
    with Image.open(path) as original:
        before = original.convert("RGB")
    if before.size != (SIZE, SIZE):
        raise ValueError("The photo must match the coordinate space of its hand-traced mask.")

    hue, saturation, value = before.convert("HSV").split()
    if edit["type"] == "color":
        hue = hue.point(lambda _: edit["hue"])
        strength = edit["saturation"]
        saturation = saturation.point(lambda original: round(0.25 * original + 0.75 * strength))
    value = value.point(lambda original: min(255, round(original * edit.get("value_factor", 1))))
    edited = Image.merge("HSV", (hue, saturation, value)).convert("RGB")
    return before, Image.composite(edited, before, trace_mask(edit["polygons"], edit.get("holes", [])))
