"""Draw visual illusions and matched controls with known physical geometry."""
import argparse
import json
from math import cos, pi, sin

from .diagram_predictions import load_predictions as load_diagram_predictions, score_captions
from .stimulus import ASSETS, DATA

DIRECTORY = ASSETS / "illusions"
MANIFEST = DIRECTORY / "scenes.json"
CACHE = DATA / "illusions-predictions.json"
PAPER = "#f3efe6"
TARGET = "#225c70"
CONTEXT = "#687b89"


def draw_scenes():
    from PIL import Image, ImageDraw

    DIRECTORY.mkdir(exist_ok=True)
    scenes = []

    def canvas():
        image = Image.new("RGB", (400, 400), PAPER)
        return image, ImageDraw.Draw(image)

    def disk(draw, x, y, radius, color):
        draw.ellipse((x - radius, y - radius, x + radius - 1, y + radius - 1), fill=color)

    def save(image, slug, principle, index, prompt, equal, options, explanation):
        scene_id = f"{slug}-{index + 1}"
        image.save(DIRECTORY / f"{scene_id}.png")
        scenes.append(dict(id=scene_id, principle=principle, prompt=prompt, options=options,
                           answer=int(not equal), explanation=explanation))

    for index, difference in enumerate((0, -4, 0, 4)):
        image, draw = canvas()
        rings = [(61, 24, 5), (49, 9, 9)]
        if index in (1, 2):
            rings.reverse()
        for x, (distance, size, count) in zip((104, 296), rings, strict=True):
            for point in range(count):
                angle = 2 * pi * point / count - pi / 2
                disk(draw, round(x + distance * cos(angle)),
                     round(200 + distance * sin(angle)), size, CONTEXT)
        disk(draw, 104, 200, 30, TARGET)
        disk(draw, 296, 200, 30 + difference, TARGET)
        save(image, "ebbinghaus", "Ebbinghaus", index, "Are the two teal center circles the same diameter?",
             difference == 0, ["The two center circles have the same diameter", "The two center circles have different diameters"],
             f"Left diameter: 60 px. Right diameter: {60 + 2*difference} px. The rings can change how large each center appears.")

    for index, difference in enumerate((0, 12, -12, 0)):
        image, draw = canvas()
        for row, (y, length) in enumerate(((132, 152), (268, 152 + difference))):
            left, right = 200 - length // 2, 200 + length // 2
            direction = 1 if (index + row) % 2 else -1
            for x, dx in ((left, 39 * direction), (right, -39 * direction)):
                draw.line([(x + dx, y - 26), (x, y), (x + dx, y + 26)], fill=CONTEXT, width=7)
            draw.line((left, y, right, y), fill=TARGET, width=9)
        save(image, "muller-lyer", "Müller-Lyer", index, "Are the two teal shafts the same length, excluding the fins?",
             difference == 0, ["The two horizontal shafts are the same length", "The two horizontal shafts are different lengths"],
             f"Top shaft: 152 px. Bottom shaft: {152 + difference} px. The direction of the fins shifts the apparent length.")

    for index, difference in enumerate((14, 0, -14, 0)):
        image, draw = canvas()
        for x_bottom, x_top in ((57, 128), (343, 272)):
            draw.line((x_top, 48, x_bottom, 351), fill=CONTEXT, width=6)
        if index in (1, 2):
            image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            draw = ImageDraw.Draw(image)
        for y, length in ((150, 118), (253, 118 + difference)):
            draw.line((200 - length//2, y, 200 + length//2, y), fill=TARGET, width=10)
        save(image, "ponzo", "Ponzo", index, "Are the two teal bars the same length?",
             difference == 0, ["The two teal bars are the same length", "The two teal bars are different lengths"],
             f"Top bar: 118 px. Bottom bar: {118 + difference} px. Converging rails can make a bar near the narrow end appear longer.")

    for index, difference in enumerate((0, -12, 0, 12)):
        image, draw = canvas()
        # The horizontal and vertical spans meet at a T junction.
        span = (144, 132, 160, 150)[index]
        y, length = (251 if index % 2 == 0 else 149), span + difference
        end = y - length if index % 2 == 0 else y + length
        draw.line((200 - span//2, y, 200 + span//2, y), fill=TARGET, width=8)
        draw.line((200, y, 200, end), fill=TARGET, width=8)
        save(image, "horizontal-vertical", "Horizontal–vertical", index,
             "Is the vertical stroke the same length as the entire horizontal stroke?",
             difference == 0, ["The horizontal and vertical strokes have the same length",
                               "The horizontal and vertical strokes have different lengths"],
             f"Horizontal: {span} px. Vertical: {length} px. Orientation and the T junction can bias apparent length.")

    for index, bend in enumerate((0, 10, -10, 0)):
        image, draw = canvas()
        center_y = (180, 215, 185, 210)[index]
        for offset in range(-144, 145, 24):
            draw.line((27, center_y - offset, 373, center_y + offset), fill="#a2a8a6", width=2)
            draw.line((200 - offset, center_y - 144, 200 + offset, center_y + 144), fill="#a2a8a6", width=2)
        for start, direction in ((141, -1), (259, 1)):
            points = [(start + direction * bend * (1 - ((y - 200) / 147) ** 2), y)
                      for y in range(53, 348)]
            draw.line(points, fill=TARGET, width=8)
        save(image, "hering", "Hering", index, "Are the two teal lines straight or bowed?",
             bend == 0, ["The two teal lines are straight", "The two teal lines are bowed"],
             f"Each line's midpoint shifts {abs(bend)} px sideways from its endpoints. The radiating lines can make even straight lines look bowed.")

    MANIFEST.write_text(json.dumps(scenes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_predictions():
    return load_diagram_predictions(MANIFEST, CACHE)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--draw", action="store_true")
    group.add_argument("--score", action="store_true")
    args = parser.parse_args()
    draw_scenes() if args.draw else score_captions(MANIFEST, CACHE)
