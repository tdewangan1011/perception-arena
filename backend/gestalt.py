"""Build controlled Gestalt illustrations and cache CLIP caption choices."""
import argparse
import json

from .diagram_predictions import load_predictions as load_diagram_predictions, score_captions
from .stimulus import ASSETS, DATA

DIRECTORY = ASSETS / "gestalt"
MANIFEST = DIRECTORY / "scenes.json"
CACHE = DATA / "gestalt-predictions.json"
INK = "#20374b"
BLUE = "#356a91"
RUST = "#b45740"
PAPER = "#f6f3e9"
SIZE = 400


def draw_scenes():
    from PIL import Image, ImageDraw

    DIRECTORY.mkdir(exist_ok=True)
    scenes = []

    def canvas():
        image = Image.new("RGB", (SIZE, SIZE), PAPER)
        return image, ImageDraw.Draw(image)

    def dot(draw, x, y, color=INK, radius=11):
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color)

    def save(image, principle, index, prompt, correct, alternative, explanation):
        slug = principle.lower().replace("ä", "a").replace(" ", "-")
        scene_id = f"{slug}-{index+1}"
        image.save(DIRECTORY / f"{scene_id}.png")
        # Alternate the reference position within each principle.
        options = [correct, alternative] if index % 2 == 0 else [alternative, correct]
        scenes.append(dict(id=scene_id, principle=principle, prompt=prompt, options=options,
                           answer=options.index(correct), explanation=explanation))

    rows = "Horizontal bands of marks"
    columns = "Vertical bands of marks"
    for index in range(3):
        image, draw = canvas()
        near, far = ((22, 57), (29, 59), (39, 54))[index]
        for row in range(6):
            for col in range(6):
                x = 200 + (col - 2.5) * near
                y = 200 + (row - 2.5) * far
                if index == 1:
                    x, y = y, x
                dot(draw, x, y, radius=6)
        save(image, "Proximity", index, "Which grouping stands out?", columns if index == 1 else rows,
             rows if index == 1 else columns, "The smaller gaps pull neighboring marks into bands.")

    for index in range(3):
        image, draw = canvas()
        for row in range(6):
            for col in range(6):
                band = col if index == 1 else row
                x, y = 70 + 52*col, 70 + 52*row
                if index == 2 and band % 2:
                    draw.rectangle((x-9,y-9,x+9,y+9), fill=BLUE)
                else:
                    dot(draw, x, y, BLUE if index == 2 or band % 2 == 0 else RUST, 10)
        save(image, "Similarity", index, "Which grouping stands out?", columns if index == 1 else rows,
             rows if index == 1 else columns, "Marks with the same shape or color group together even though the spacing is equal.")

    shapes = [
        ("A circle", "A square", [(200,78),(322,200),(200,322),(78,200)]),
        ("A triangle", "A diamond", [(200,75),(329,300),(71,300)]),
        ("A diamond", "A circle", [(200,70),(330,200),(200,330),(70,200)]),
    ]
    for index, (correct, alternative, vertices) in enumerate(shapes):
        image, draw = canvas()
        if index == 0:
            for start in (8, 98, 188, 278):
                draw.arc((78,78,322,322), start, start+56, fill=BLUE, width=12)
        else:
            for (x, y), (u, v) in zip(vertices, vertices[1:] + vertices[:1]):
                draw.line((x+.19*(u-x), y+.19*(v-y), x+.81*(u-x), y+.81*(v-y)), fill=BLUE, width=12)
        save(image, "Closure", index, "Which outline do the fragments suggest?", correct, alternative,
             "Your visual system can group separated fragments into a closed outline.")

    for index in range(3):
        image, draw = canvas()
        if index == 2:
            first = [(x, 200 + .003 * (x-200)**2 + .4 * (x-200)) for x in range(45, 356)]
            second = [(x, 200 - .002 * (x-200)**2 - .55 * (x-200)) for x in range(45, 356)]
            draw.line(first, fill=INK, width=12)
            draw.line(second, fill=INK, width=12)
        else:
            draw.line((45,265,355,125),fill=INK,width=12)
            draw.line((45,125,355,265),fill=INK,width=12)
        draw.rounded_rectangle((145,108,255,281),radius=8,fill="#dfded6")
        if index == 1:
            image = image.rotate(90)
        save(image, "Good continuation", index, "How do the strokes most naturally connect behind the block?",
             "Two smooth curves cross behind the block" if index == 2 else "Two straight strokes cross behind the block",
             "Two strokes change direction sharply and turn away from each other",
             "Following each segment's direction connects it to the aligned segment across the gap.")

    for index in range(3):
        image, draw = canvas()
        for offset in (0, 1, 2):
            for other in range(3):
                dot(draw, 85+115*other, 85+115*offset, radius=10)
            if index == 1:
                box = (54+115*offset,53,116+115*offset,347)
            else:
                box = (53,54+115*offset,347,116+115*offset)
            draw.rounded_rectangle(box, radius=28 if index == 2 else 12,
                                   outline=RUST, width=3 if index == 2 else 6)
        save(image, "Common region", index, "Which grouping do the enclosing outlines support?",
             columns if index == 1 else rows, rows if index == 1 else columns,
             "The marks inside each shared boundary are grouped together.")

    for index in range(3):
        image, draw = canvas()
        half = [(200,56),(164,114),(128,109),(145,170),(103,188),
                (139,239),(157,254),(168,318),(200,282)]
        if index == 2:
            half = [(200,72),(153,98),(152,136),(100,150),(125,230),
                    (157,229),(143,315),(200,300)]
        draw.polygon(half+[(400-x,y) for x,y in reversed(half)],fill=BLUE)
        if index == 1:
            image = image.rotate(90)
        save(image, "Symmetry", index, "Which line would split this form into mirror halves?",
             "A horizontal mirror axis" if index == 1 else "A vertical mirror axis",
             "A vertical mirror axis" if index == 1 else "A horizontal mirror axis",
             "The two halves match across the mirror axis, even though the outline has several bends.")

    overlays = [
        ("Two overlapping circles", "Three separate crescent and lens shapes",
         [("ellipse",(55,108,239,292)),("ellipse",(161,108,345,292))]),
        ("Two overlapping squares", "Three separate angular shapes",
         [("rectangle",(68,68,244,244)),("rectangle",(156,156,332,332))]),
        ("A circle overlapping a triangle", "Several separate curved and angular pieces",
         [("ellipse",(65,102,259,296)),("polygon",[(211,72),(347,268),(148,268)])]),
    ]
    for index, (correct, alternative, parts) in enumerate(overlays):
        image, draw = canvas()
        for method, coordinates in parts:
            getattr(draw, method)(coordinates, outline=BLUE, width=9)
        save(image, "Prägnanz", index, "Which description gives the more regular organization of the whole?",
             correct, alternative, "The whole can be organized as overlapping familiar shapes. This illustrates one aspect of Prägnanz.")

    MANIFEST.write_text(json.dumps(scenes, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


def load_predictions():
    return load_diagram_predictions(MANIFEST, CACHE)


def score():
    score_captions(MANIFEST, CACHE)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--draw", action="store_true")
    group.add_argument("--score", action="store_true")
    args = parser.parse_args()
    draw_scenes() if args.draw else score()
