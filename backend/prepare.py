"""Prepare and score the immutable single-trial pilot stimulus."""
import hashlib
import json
from datetime import datetime, timezone

import torch
import transformers
from PIL import Image, ImageOps
from transformers import CLIPModel, CLIPProcessor

from .stimulus import (
    ASSETS, CHOICES, DATA, HEIGHT, MASK_BOX, MASK_COLOR, MASK_FRACTION,
    MODEL_ID, PROMPT, REVISION, WIDTH,
)


def main():
    destination = DATA / "stimuli"
    destination.mkdir(parents=True, exist_ok=True)
    with Image.open(ASSETS / "source-001.jpg") as original:
        stimulus = ImageOps.fit(ImageOps.exif_transpose(original).convert("RGB"), (WIDTH, HEIGHT))
    stimulus.paste(MASK_COLOR, MASK_BOX)
    temporary = destination / "preparing.png"
    stimulus.save(temporary)
    stimulus_id = hashlib.sha256(temporary.read_bytes()).hexdigest()
    path = destination / f"{stimulus_id}.png"
    temporary.replace(path)

    cache = DATA / "model-cache"
    processor = CLIPProcessor.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache, use_fast=False)
    model = CLIPModel.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache).eval()
    prompts = [PROMPT.format(choice.lower()) for choice in CHOICES]
    with Image.open(path) as image:
        inputs = processor(text=prompts, images=image.convert("RGB"), padding=True, return_tensors="pt")
    with torch.inference_mode():
        scores = model(**inputs).logits_per_image[0].tolist()
    prediction = {
        "stimulus_id": stimulus_id,
        "choices": CHOICES,
        "difficulty": MASK_FRACTION,
        "mask_definition": "fraction_of_image_area_masked",
        "mask_box_xyxy_exclusive": MASK_BOX,
        "model_id": MODEL_ID,
        "model_revision": model.config._commit_hash or REVISION,
        "prompt_template": PROMPT,
        "preprocessing": processor.image_processor.to_dict(),
        "transformers_version": transformers.__version__,
        "torch_version": str(torch.__version__),
        "inferred_at": datetime.now(timezone.utc).isoformat(),
        "model_choice": CHOICES[max(range(len(scores)), key=scores.__getitem__)],
        "uncalibrated_logits": dict(zip(CHOICES, scores)),
    }
    temporary_prediction = DATA / "preparing.json"
    temporary_prediction.write_text(json.dumps(prediction, indent=2, allow_nan=False), encoding="utf-8")
    temporary_prediction.replace(DATA / "pilot-prediction.json")
    print(f"Scored {stimulus_id[:12]} with {MODEL_ID}: {prediction['model_choice']}")


if __name__ == "__main__":
    main()
