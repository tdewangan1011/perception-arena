"""Generate and precompute all 64 variants for the balanced experiment."""
import argparse
import hashlib
import io
import json
from datetime import datetime, timezone

import torch
import transformers
from PIL import Image, ImageFilter, ImageOps
from transformers import CLIPModel, CLIPProcessor

from .design import DESIGNS, LABELS, SIZE, level_metadata
from .exposure import exposure_lut
from .stimulus import DATA, MASK_COLOR, MODEL_ID, PROMPT, REVISION


def prepare_source(source, destination, topic):
    design = DESIGNS[topic]
    source_bytes = (design.sources / source["file"]).read_bytes()
    source_sha256 = hashlib.sha256(source_bytes).hexdigest()
    with Image.open(io.BytesIO(source_bytes)) as original:
        image = ImageOps.pad(
            ImageOps.exif_transpose(original).convert("RGB"), (SIZE, SIZE),
            method=Image.Resampling.LANCZOS, color=(208, 208, 208),
        )
    variants = []
    for level in design.levels:
        variant = image.copy()
        metadata = level_metadata(topic, source["id"], level)
        if topic == "blur" and level:
            variant = variant.filter(ImageFilter.GaussianBlur(radius=level))
        if topic == "lighting" and level:
            variant = variant.point(exposure_lut(level) * 3)
        if metadata.get("mask_box_xyxy_exclusive"):
            variant.paste(MASK_COLOR, tuple(metadata["mask_box_xyxy_exclusive"]))
        buffer = io.BytesIO()
        variant.save(buffer, format="PNG")
        png = buffer.getvalue()
        stimulus_id = hashlib.sha256(png).hexdigest()
        path = destination / f"{stimulus_id}.png"
        if not path.exists() or path.read_bytes() != png:
            temporary = path.with_suffix(".tmp")
            temporary.write_bytes(png)
            temporary.replace(path)
        variants.append({
            "stimulus_id": stimulus_id,
            "base_image_id": source["id"],
            "source_sha256": source_sha256,
            "ground_truth": source["label"],
            "choices": list(LABELS),
            "level": level,
            "condition": topic,
            **metadata,
            "source": {key: source[key] for key in ("title", "source_url", "artist", "license", "license_url")},
        })
    return variants


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", choices=DESIGNS, default="occlusion")
    topic = parser.parse_args().topic
    design = DESIGNS[topic]
    destination = DATA / "stimuli"
    destination.mkdir(parents=True, exist_ok=True)
    sources = json.loads((design.sources / "manifest.json").read_text(encoding="utf-8"))
    if len({source["id"] for source in sources}) != len(sources) or any(
        sum(source["label"] == label for source in sources) != len(design.levels) for label in LABELS
    ) or len(sources) != len(LABELS) * len(design.levels):
        raise ValueError("Expected four unique source images per category.")

    cache = DATA / "model-cache"
    torch.set_num_threads(4)
    processor = CLIPProcessor.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache, use_fast=False)
    model = CLIPModel.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache).eval()
    provenance = {
        "design_version": design.version,
        "model_id": MODEL_ID,
        "model_revision": REVISION,
        "prompt_template": PROMPT,
        "preprocessing": processor.image_processor.to_dict(),
        "transformers_version": transformers.__version__,
        "torch_version": str(torch.__version__),
    }
    prompts = [PROMPT.format(choice.lower()) for choice in LABELS]
    predictions = []
    for source in sources:
        variants = prepare_source(source, destination, topic)
        images = []
        for variant in variants:
            with Image.open(destination / f'{variant["stimulus_id"]}.png') as stimulus:
                images.append(stimulus.convert("RGB"))
        inputs = processor(text=prompts, images=images, padding=True, return_tensors="pt")
        with torch.inference_mode():
            rows = model(**inputs).logits_per_image.tolist()
        inferred_at = datetime.now(timezone.utc).isoformat()
        for variant, scores in zip(variants, rows, strict=True):
            predictions.append({
                **variant, **provenance,
                "inferred_at": inferred_at,
                "model_choice": LABELS[max(range(len(scores)), key=scores.__getitem__)],
                "uncalibrated_logits": dict(zip(LABELS, scores, strict=True)),
            })
        print(f"Scored four levels for {source['id']}", flush=True)
    temporary = design.predictions.with_suffix(".tmp")
    temporary.write_text(json.dumps(predictions, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(design.predictions)


if __name__ == "__main__":
    main()
