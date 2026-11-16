"""Generate and serve relative-depth predictions at the marked photo points."""
import hashlib
import json
import math
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from .stimulus import ASSETS, DATA

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
REVISION = "5426e4f0f36572d16453bbda7a8389317b1bef99"
SCENE_FILE = ASSETS / "depth-scenes.json"
CACHE_FILE = DATA / "depth-predictions.json"
SAMPLE_RADIUS_PX = 3
POINTS = ("A", "B")

router = APIRouter(prefix="/api/depth")


class DepthAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    choice: Literal["A", "B"]


def scene_path(scene_id):
    return ASSETS / "depth" / f"{scene_id}.jpg"


def expected_choice(values):
    if values["A"] == values["B"]:
        return None
    return max(POINTS, key=values.__getitem__)


def load_predictions():
    try:
        scenes = json.loads(SCENE_FILE.read_text(encoding="utf-8"))
        report = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        if (
            report["model_id"] != MODEL_ID or report["model_revision"] != REVISION
            or report["sample_radius_px"] != SAMPLE_RADIUS_PX
        ):
            return None
        verified = {}
        for scene in scenes:
            row = report["scenes"][scene["id"]]
            values = row["relative_inverse_depth"]
            if (
                row["points"] != scene["points"]
                or hashlib.sha256(scene_path(scene["id"]).read_bytes()).hexdigest() != row["image_sha256"]
                or set(values) != set(POINTS)
                or not all(math.isfinite(value) for value in values.values())
                or row["model_choice"] != expected_choice(values)
            ):
                return None
            verified[scene["id"]] = row
        return {**report, "scenes": verified}
    except (OSError, ValueError, KeyError, TypeError):
        return None


@router.post("/scenes/{scene_id}/answer")
def depth_answer(scene_id: str, answer: DepthAnswer, request: Request):
    report = request.app.state.depth_predictions
    if report is None:
        raise HTTPException(503, "Depth predictions are unavailable. Run python -m backend.depth and restart the API.")
    if scene_id not in report["scenes"]:
        raise HTTPException(404, "Depth scene not found.")
    return {
        "scene_id": scene_id,
        "human_choice": answer.choice,
        **report["scenes"][scene_id],
        "model_id": report["model_id"],
        "model_revision": report["model_revision"],
        "sample_radius_px": report["sample_radius_px"],
        "inferred_at": report["inferred_at"],
    }


def main():
    import torch
    import transformers
    from PIL import Image
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    DATA.mkdir(exist_ok=True)
    cache = DATA / "model-cache"
    torch.set_num_threads(4)
    processor = AutoImageProcessor.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache, use_fast=False)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID, revision=REVISION, cache_dir=cache).eval()
    scenes = json.loads(SCENE_FILE.read_text(encoding="utf-8"))
    results = {}
    for scene in scenes:
        path = scene_path(scene["id"])
        with Image.open(path) as photo:
            image = photo.convert("RGB")
        inputs = processor(images=image, return_tensors="pt")
        with torch.inference_mode():
            result = model(**inputs)
            depth = processor.post_process_depth_estimation(result, target_sizes=[(image.height, image.width)])[0]["predicted_depth"]
        values = {}
        for letter, (xp, yp) in scene["points"].items():
            x, y = round((image.width - 1) * xp / 100), round((image.height - 1) * yp / 100)
            radius = SAMPLE_RADIUS_PX
            patch = depth[max(0, y-radius):y+radius+1, max(0, x-radius):x+radius+1]
            values[letter] = float(patch.median())
        results[scene["id"]] = {
            "image_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "points": scene["points"],
            "relative_inverse_depth": values,
            "model_choice": expected_choice(values),
        }
        print(f"Scored {scene['name']}", flush=True)
    report = {
        "model_id": MODEL_ID,
        "model_revision": REVISION,
        "sample_radius_px": SAMPLE_RADIUS_PX,
        "inferred_at": datetime.now(timezone.utc).isoformat(),
        "transformers_version": transformers.__version__,
        "torch_version": str(torch.__version__),
        "scenes": results,
    }
    temporary = CACHE_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    temporary.replace(CACHE_FILE)


if __name__ == "__main__":
    main()
