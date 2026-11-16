"""Build subtle color-matching diagrams and score them with CLIP image embeddings."""
import argparse
import json
import math

from .diagram_predictions import load_predictions as load_diagram_predictions, write_predictions
from .stimulus import ASSETS, DATA, MODEL_ID, REVISION

DIRECTORY = ASSETS / "color"
MANIFEST = DIRECTORY / "scenes.json"
CACHE = DATA / "color-predictions.json"
TILE_SIZE = 152
POSITIONS = ((124, 28), (34, 214), (214, 214))


def rgb_from_lab(lightness, a, b):
    """Convert D65 CIELAB to 8-bit sRGB, rejecting out-of-gamut inputs."""
    def xyz_component(value):
        return value ** 3 if value > 6 / 29 else (value - 4 / 29) * 3 * (6 / 29) ** 2

    y_base = (lightness + 16) / 116
    x = .95047 * xyz_component(y_base + a / 500)
    y = xyz_component(y_base)
    z = 1.08883 * xyz_component(y_base - b / 200)
    linear = (
        3.2404542*x - 1.5371385*y - .4985314*z,
        -.9692660*x + 1.8760108*y + .0415560*z,
        .0556434*x - .2040259*y + 1.0572252*z,
    )
    if any(value < 0 or value > 1 for value in linear):
        raise ValueError(f"Outside sRGB gamut: {(lightness, a, b)}")
    return tuple(round(255 * (12.92 * value if value <= .0031308
                              else 1.055 * value ** (1 / 2.4) - .055)) for value in linear)


def lab_from_lch(lightness, chroma, hue):
    angle = math.radians(hue)
    return (lightness, chroma * math.cos(angle), chroma * math.sin(angle))


def draw_scenes():
    from PIL import Image, ImageDraw

    DIRECTORY.mkdir(exist_ok=True)
    scenes = []
    palettes = {
        "Hue": ((63, 29, 43, 7), (67, 22, 225, -10), (54, 32, 325, 7), (69, 27, 125, -8)),
        "Chroma": ((62, 25, 266, 4), (64, 31, 154, -4), (52, 24, 20, 5), (73, 35, 82, -5)),
        "Lightness": ((57, 25, 300, 3), (68, 29, 62, -3), (61, 23, 194, 3), (73, 31, 144, -3)),
        "Surround contrast": ((64, 16, 52, 5), (56, 15, 263, -6), (69, 14, 129, 5), (63, 16, 342, -6)),
    }
    explanations = {
        "Hue": "The other center shifts slightly in hue while its lightness and chroma are held fixed in the design.",
        "Chroma": "The other center is slightly more or less vivid. The design varies chroma while holding hue and lightness fixed.",
        "Lightness": "The other center is slightly lighter or darker. The design holds hue and chroma fixed.",
        "Surround contrast": "Different surrounds can change how the centers look. The match is the center with the same encoded color as the reference.",
    }
    for group, (principle, variants) in enumerate(palettes.items()):
        for index, (lightness, chroma, hue, offset) in enumerate(variants):
            target = rgb_from_lab(*lab_from_lch(lightness, chroma, hue))
            if principle == "Hue":
                other_lab = lab_from_lch(lightness, chroma, hue + offset)
            elif principle == "Lightness":
                other_lab = lab_from_lch(lightness + offset, chroma, hue)
            else:
                other_lab = lab_from_lch(lightness, chroma + offset, hue)
            distractor = rgb_from_lab(*other_lab)
            if distractor == target:
                raise ValueError("The two candidate colors must remain distinct after quantization.")

            answer = (index + group) % 2
            centers = [target, distractor] if answer == 0 else [distractor, target]
            neutral = [rgb_from_lab(level, 0, 0) for level in ((47, 78) if index % 2 == 0 else (77, 44))]
            if principle == "Surround contrast":
                surrounds = [
                    neutral[0],
                    rgb_from_lab(*lab_from_lch(63, 25, hue)),
                    rgb_from_lab(*lab_from_lch(63, 25, hue + 180)),
                ]
                if index in (1, 2):
                    surrounds[1:] = surrounds[1:][::-1]
            else:
                surrounds = [neutral[0], neutral[1], neutral[1]]

            diagram = Image.new("RGB", (400, 400), "#b9b9b9")
            draw = ImageDraw.Draw(diagram)
            for (x, y), background, center in zip(POSITIONS, surrounds, [target, *centers], strict=True):
                draw.rectangle((x, y, x + TILE_SIZE - 1, y + TILE_SIZE - 1), fill=background)
                draw.rectangle((x + 45, y + 45, x + 106, y + 106), fill=center)

            scene_id = f'{principle.lower().replace(" ", "-")}-{index+1}'
            diagram.save(DIRECTORY / f"{scene_id}.png")
            scenes.append({
                "id": scene_id,
                "principle": principle,
                "prompt": "Which bottom center square matches the top center square?",
                "options": ["Bottom left", "Bottom right"],
                "answer": answer,
                "explanation": explanations[principle],
                "referenceRgb": target,
                "candidateRgb": centers,
            })
    MANIFEST.write_text(json.dumps(scenes, indent=2) + "\n", encoding="utf-8")


def load_predictions():
    return load_diagram_predictions(MANIFEST, CACHE)


def score():
    import torch
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor

    torch.set_num_threads(4)
    settings = dict(revision=REVISION, cache_dir=DATA / "model-cache")
    processor = CLIPProcessor.from_pretrained(MODEL_ID, use_fast=False, **settings)
    model = CLIPModel.from_pretrained(MODEL_ID, **settings).eval()
    scenes = json.loads(MANIFEST.read_text(encoding="utf-8"))
    choices = {}
    for scene in scenes:
        with Image.open(DIRECTORY / f'{scene["id"]}.png') as diagram:
            tiles = [diagram.crop((x, y, x + TILE_SIZE, y + TILE_SIZE)) for x, y in POSITIONS]
        inputs = processor(images=tiles, return_tensors="pt")
        with torch.inference_mode():
            embeddings = torch.nn.functional.normalize(model.get_image_features(**inputs), dim=-1)
            similarities = embeddings[1:] @ embeddings[0]
            choices[scene["id"]] = similarities.argmax().item()
    write_predictions(MANIFEST, CACHE, scenes, choices)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--draw", action="store_true")
    group.add_argument("--score", action="store_true")
    args = parser.parse_args()
    draw_scenes() if args.draw else score()
