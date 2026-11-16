"""Build and score the photographic change detection round."""
import hashlib
import io
import json
from datetime import datetime, timezone

from .design import SIZE
from .stimulus import DATA, MODEL_ID, REVISION

CHANGE_VERSION = "change-photos-v3"
CHANGE_PREDICTIONS = DATA / "change-predictions.json"
REGIONS = [
    "Upper left", "Upper center", "Upper right",
    "Middle left", "Middle center", "Middle right",
    "Lower left", "Lower center", "Lower right",
]


def region_box(index):
    cell = SIZE // 3
    x, y = (index % 3) * cell, (index // 3) * cell
    return x, y, x + cell, y + cell


def load_change_bank():
    try:
        bank = json.loads(CHANGE_PREDICTIONS.read_text(encoding="utf-8"))
        if len(bank) != 12 or len({trial["base_image_id"] for trial in bank}) != 12:
            return []
        if sorted(trial["level"] for trial in bank) != [1]*4 + [2]*4 + [3]*4:
            return []
        for trial in bank:
            if (
                trial["choices"] != REGIONS or trial["model_choice"] not in REGIONS
                or trial["model_id"] != MODEL_ID or trial["model_revision"] != REVISION
                or trial["condition"] != "change" or trial["design_version"] != CHANGE_VERSION
                or not trial["change_description"]
                or trial["change_type"] not in ("color", "lightness") or trial["ground_truth"] not in REGIONS
            ):
                return []
            for key in ("stimulus_id", "comparison_stimulus_id"):
                digest = trial[key]
                if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
                    return []
                path = DATA / "stimuli" / f"{digest}.png"
                if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                    return []
            if trial["stimulus_id"] == trial["comparison_stimulus_id"]:
                return []
        return bank
    except (OSError, ValueError, KeyError, TypeError):
        return []


def store_png(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    png = buffer.getvalue()
    digest = hashlib.sha256(png).hexdigest()
    path = DATA / "stimuli" / f"{digest}.png"
    if not path.exists() or path.read_bytes() != png:
        temporary = path.with_suffix(".change-tmp")
        temporary.write_bytes(png)
        temporary.replace(path)
    return digest


def main():
    import torch
    import transformers
    from PIL import ImageChops
    from transformers import CLIPModel, CLIPProcessor

    from .change_scenes import PHOTO_DIR, render_pair, source_scenes

    (DATA / "stimuli").mkdir(parents=True, exist_ok=True)
    scenes = source_scenes()
    cache = DATA / "model-cache"
    torch.set_num_threads(4)
    processor = CLIPProcessor.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache, use_fast=False)
    model = CLIPModel.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache).eval()
    predictions = []

    for index, (source, edit) in enumerate(scenes):
        before, after = render_pair(PHOTO_DIR / source["file"], edit)
        difference = ImageChops.difference(before, after).getbbox()
        left, top, right, bottom = region_box(edit["region"])
        if not difference or not (left <= difference[0] < difference[2] <= right and top <= difference[1] < difference[3] <= bottom):
            raise ValueError(f"Change outside its region in {source['scene_title']}: {difference}")
        crops = [frame.crop(region_box(cell)) for frame in (before, after) for cell in range(9)]
        inputs = processor(images=crops, return_tensors="pt")
        with torch.inference_mode():
            embeds = model.get_image_features(**inputs)
            before_features, after_features = embeds.chunk(2)
            distances = (1 - torch.nn.functional.cosine_similarity(before_features, after_features)).clamp_min(0).tolist()
        winner = max(range(9), key=distances.__getitem__)
        predictions.append({
            "condition": "change",
            "design_version": CHANGE_VERSION,
            "base_image_id": source["id"],
            "stimulus_id": store_png(before),
            "comparison_stimulus_id": store_png(after),
            "choices": REGIONS,
            "ground_truth": REGIONS[edit["region"]],
            "level": edit["level"],
            "scene_title": source["scene_title"],
            "changed_object": edit["object"],
            "change_type": edit["type"],
            "change_description": edit["description"],
            "edit_parameters": edit,
            "source": {key: source[key] for key in ("title", "source_url", "artist", "license", "license_url")},
            "model_id": MODEL_ID,
            "model_revision": REVISION,
            "model_choice": REGIONS[winner],
            "comparison_method": "cosine_distance_between_clip_embeddings_of_corresponding_3x3_crops",
            "region_distances": dict(zip(REGIONS, distances, strict=True)),
            "preprocessing": processor.image_processor.to_dict(),
            "inferred_at": datetime.now(timezone.utc).isoformat(),
            "transformers_version": transformers.__version__,
            "torch_version": str(torch.__version__),
        })
        print(f"Scored scene {index + 1}/{len(scenes)}", flush=True)
    temporary = CHANGE_PREDICTIONS.with_suffix(".tmp")
    temporary.write_text(json.dumps(predictions, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(CHANGE_PREDICTIONS)


if __name__ == "__main__":
    main()
