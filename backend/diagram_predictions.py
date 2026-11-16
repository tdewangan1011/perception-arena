"""Validate and store model choices for versioned diagram sets."""
import hashlib
import json

from .stimulus import DATA, MODEL_ID, REVISION


def fingerprint(manifest, scenes):
    digest = hashlib.sha256(manifest.read_bytes())
    for scene in scenes:
        digest.update((manifest.parent / f'{scene["id"]}.png').read_bytes())
    return digest.hexdigest()


def load_predictions(manifest, cache):
    try:
        scenes = json.loads(manifest.read_text(encoding="utf-8"))
        report = json.loads(cache.read_text(encoding="utf-8"))
        choices = report["choices"]
        if (report["model_id"] == MODEL_ID and report["revision"] == REVISION
            and report["stimulus_fingerprint"] == fingerprint(manifest, scenes)
            and set(choices) == {scene["id"] for scene in scenes}
            and all(type(value) is int and value in (0, 1) for value in choices.values())):
            return choices
    except (OSError, KeyError, ValueError, TypeError):
        pass
    return None


def write_predictions(manifest, cache, scenes, choices):
    cache.parent.mkdir(exist_ok=True)
    temporary = cache.with_suffix(".tmp")
    temporary.write_text(json.dumps(dict(model_id=MODEL_ID, revision=REVISION,
        stimulus_fingerprint=fingerprint(manifest, scenes), choices=choices), indent=2), encoding="utf-8")
    temporary.replace(cache)
    correct = sum(choices[scene["id"]] == scene["answer"] for scene in scenes)
    print(f"Scored {len(scenes)} diagrams. CLIP matched {correct} reference answers.")


def score_captions(manifest, cache):
    import torch
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor

    torch.set_num_threads(4)
    settings = dict(revision=REVISION, cache_dir=DATA / "model-cache")
    processor = CLIPProcessor.from_pretrained(MODEL_ID, use_fast=False, **settings)
    model = CLIPModel.from_pretrained(MODEL_ID, **settings).eval()
    scenes = json.loads(manifest.read_text(encoding="utf-8"))
    choices = {}
    for scene in scenes:
        with Image.open(manifest.parent / f'{scene["id"]}.png') as image:
            inputs = processor(text=scene["options"], images=image.convert("RGB"), padding=True, return_tensors="pt")
        with torch.inference_mode():
            choices[scene["id"]] = model(**inputs).logits_per_image.argmax().item()
    write_predictions(manifest, cache, scenes, choices)


