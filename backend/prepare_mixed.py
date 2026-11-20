"""Prepare expanded recognition and color banks for the mixed visual challenge."""
import hashlib
import io
import json
import random
from datetime import datetime, timezone

from .stimulus import ASSETS, DATA, MODEL_ID, REVISION, PROMPT

CACHE = DATA / "mixed-predictions.json"
VERSION = "mixed-visual-v1"
TIERS = range(5)
LABELS = ("Bicycle", "Motorcycle", "Kick scooter", "Wheelchair")
RECOGNITION = ("occlusion", "blur", "lighting")


def source_fingerprint():
    digest = hashlib.sha256(VERSION.encode())
    for folder in ("experiment", "blur", "lighting"):
        path = ASSETS / folder / "manifest.json"
        digest.update(path.read_bytes())
        for row in json.loads(path.read_text(encoding="utf-8")):
            digest.update((path.parent / row["file"]).read_bytes())
    return digest.hexdigest()


def store_image(image):
    destination = DATA / "stimuli"
    destination.mkdir(exist_ok=True)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    content = buffer.getvalue()
    digest = hashlib.sha256(content).hexdigest()
    path = destination / f"{digest}.png"
    if not path.exists():
        path.write_bytes(content)
    return digest


def load_predictions():
    try:
        report = json.loads(CACHE.read_text(encoding="utf-8"))
        bank = report["trials"]
        if report["version"] != VERSION or report["fingerprint"] != source_fingerprint():
            return []
        if report["model_id"] != MODEL_ID or report["model_revision"] != REVISION:
            return []
        if len(bank) != 780 or len({t["id"] for t in bank}) != len(bank):
            return []
        for trial in bank:
            digest = trial["stimulus_id"]
            if trial["topic"] not in (*RECOGNITION, "color") or trial["tier"] not in TIERS:
                return []
            if trial["answer"] not in trial["choices"] or trial["model_choice"] not in trial["choices"]:
                return []
            path = DATA / "stimuli" / f"{digest}.png"
            if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                return []
        return bank
    except (OSError, ValueError, KeyError, TypeError):
        return []


def generate():
    from PIL import Image, ImageDraw, ImageFilter, ImageOps
    from .color import POSITIONS, TILE_SIZE, lab_from_lch, rgb_from_lab
    from .exposure import exposure_lut

    bank = []
    for folder in ("experiment", "blur", "lighting"):
        for source in json.loads((ASSETS / folder / "manifest.json").read_text(encoding="utf-8")):
            source_id = f'{folder}/{source["id"]}'
            with Image.open(ASSETS / folder / source["file"]) as original:
                image = ImageOps.pad(ImageOps.exif_transpose(original).convert("RGB"), (600, 600),
                                     method=Image.Resampling.LANCZOS, color=(208, 208, 208))
            for topic in RECOGNITION:
                for tier in TIERS:
                    variant = image.copy()
                    condition = "Reference image"
                    if topic == "blur":
                        radius = (0, 3, 7, 14, 26)[tier]
                        variant = variant.filter(ImageFilter.GaussianBlur(radius))
                        condition = f"{radius} px blur"
                    elif topic == "occlusion":
                        percent = (0, 20, 40, 60, 80)[tier]
                        width = percent * 600 // 100
                        if width:
                            rng = random.Random(f"{source_id}:mask")
                            left = rng.randrange(0, 600 - width + 1)
                            variant.paste((26, 30, 38), (left, 0, left + width, 600))
                        condition = f"{percent}% masked"
                    else:
                        polarity = int(hashlib.sha256(source_id.encode()).hexdigest()[:2], 16) % 2
                        ev = ((0, -2, -4, -7, -9), (0, 2, 4, 6, 7))[polarity][tier]
                        variant = variant.point(exposure_lut(ev) * 3)
                        condition = f"{ev:+d} EV"
                    bank.append(dict(id=f"{topic}:{source_id}:{tier}", source_id=source_id, topic=topic,
                        tier=tier, condition=condition, stimulus_id=store_image(variant), answer=source["label"],
                        choices=list(LABELS), prompt="Which object is shown?", model_id=MODEL_ID,
                        source={key: source[key] for key in ("title", "source_url", "artist", "license", "license_url")}))
    for family in range(12):
        hue = (family * 31 + 21) % 360
        lightness = 64 + family % 3 * 3
        target = rgb_from_lab(*lab_from_lch(lightness, 18, hue))
        for tier in TIERS:
            delta = (12, 8, 5, 3, 1.8)[tier]
            other = rgb_from_lab(*lab_from_lch(lightness, 18 + delta, hue))
            answer = (family + tier) % 2
            colors = [target, other] if answer == 0 else [other, target]
            image = Image.new("RGB", (400, 400), "#b9b9b9")
            draw = ImageDraw.Draw(image)
            backgrounds = [rgb_from_lab(50, 0, 0)] * 3
            if family % 2:
                backgrounds[1:] = [rgb_from_lab(*lab_from_lch(65, 25, hue)),
                                   rgb_from_lab(*lab_from_lch(65, 25, hue + 180))]
            for (x, y), background, color in zip(POSITIONS, backgrounds, [target, *colors], strict=True):
                draw.rectangle((x, y, x+TILE_SIZE-1, y+TILE_SIZE-1), fill=background)
                draw.rectangle((x+45, y+45, x+106, y+106), fill=color)
            bank.append(dict(id=f"color:{family}:{tier}", source_id=f"mixed-color-{family}", topic="color",
                tier=tier, condition=f"Chroma difference {delta:g}", stimulus_id=store_image(image),
                answer=("Bottom left", "Bottom right")[answer], choices=["Bottom left", "Bottom right"],
                prompt="Which bottom center square matches the top center square?", model_id=MODEL_ID,
                explanation="The matching center has the same encoded color as the reference. Surrounds can change its appearance."))
    return bank


def main():
    import torch
    import transformers
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor
    from .color import POSITIONS, TILE_SIZE

    torch.set_num_threads(4)
    bank = generate()
    settings = dict(revision=REVISION, cache_dir=DATA / "model-cache")
    processor = CLIPProcessor.from_pretrained(MODEL_ID, use_fast=False, **settings)
    model = CLIPModel.from_pretrained(MODEL_ID, **settings).eval()
    for topic in RECOGNITION:
        entries = [t for t in bank if t["topic"] == topic]
        for start in range(0, len(entries), 16):
            group = entries[start:start+16]
            images = []
            for t in group:
                with Image.open(DATA / "stimuli" / (t["stimulus_id"] + ".png")) as image:
                    images.append(image.convert("RGB"))
            inputs = processor(text=[PROMPT.format(c.lower()) for c in LABELS], images=images, padding=True, return_tensors="pt")
            with torch.inference_mode():
                predictions = model(**inputs).logits_per_image.argmax(dim=1).tolist()
            for trial, choice in zip(group, predictions, strict=True):
                trial["model_choice"] = LABELS[choice]
        print(f"Scored {len(entries)} {topic} trials", flush=True)
    for trial in [t for t in bank if t["topic"] == "color"]:
        with Image.open(DATA / "stimuli" / (trial["stimulus_id"] + ".png")) as image:
            crops = [image.crop((x, y, x+TILE_SIZE, y+TILE_SIZE)) for x, y in POSITIONS]
        with torch.inference_mode():
            embeddings = torch.nn.functional.normalize(model.get_image_features(**processor(images=crops, return_tensors="pt")), dim=-1)
            index = (embeddings[1:] @ embeddings[0]).argmax().item()
        trial["model_choice"] = trial["choices"][index]
    report = dict(version=VERSION, fingerprint=source_fingerprint(), model_id=MODEL_ID, model_revision=REVISION,
                  inferred_at=datetime.now(timezone.utc).isoformat(), torch_version=torch.__version__,
                  transformers_version=transformers.__version__, preprocessing=processor.image_processor.to_dict(),
                  recognition_prompt_template=PROMPT,
                  color_comparison="Cosine similarity of CLIP embeddings for the three tiles including their surrounds",
                  trials=bank)
    temporary = CACHE.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, indent=2), encoding="utf-8")
    temporary.replace(CACHE)
    print(f"Prepared {len(bank)} adaptive trials.", flush=True)


if __name__ == "__main__":
    main()
