"""Stimulus design and balanced assignment for the 16-trial experiment."""
import hashlib
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from .stimulus import ASSETS, DATA

SOURCE_DIR = ASSETS / "experiment"
PREDICTIONS = DATA / "experiment-predictions.json"
LABELS = ("Bicycle", "Motorcycle", "Kick scooter", "Wheelchair")
LEVELS = (0, 20, 40, 60)
SIZE = 600
DESIGN_VERSION = "occlusion-v1"
Topic = Literal["occlusion", "blur", "lighting", "change"]


@dataclass(frozen=True)
class Design:
    sources: Path
    predictions: Path
    levels: tuple[int, ...]
    version: str


DESIGNS = {
    "occlusion": Design(SOURCE_DIR, PREDICTIONS, LEVELS, DESIGN_VERSION),
    "blur": Design(ASSETS / "blur", DATA / "blur-predictions.json", (0, 4, 12, 24), "blur-v1"),
    "lighting": Design(ASSETS / "lighting", DATA / "lighting-predictions.json", (-9, -4, 0, 7), "lighting-v2"),
}


def mask_seed(base_id):
    return int.from_bytes(hashlib.sha256(f"{DESIGN_VERSION}:{base_id}".encode()).digest()[:4])


def mask_box(base_id, level):
    if level == 0:
        return None
    if level not in LEVELS:
        raise ValueError(f"Unsupported occlusion level: {level}")
    rng = random.Random(mask_seed(base_id))
    center_x, center_y = rng.randint(250, 350), rng.randint(260, 340)
    width, height = level * 15 // 2, 480
    left, top = center_x - width // 2, center_y - height // 2
    return left, top, left + width, top + height


def level_metadata(topic, base_id, level):
    if topic == "blur":
        return {"blur_radius_px": level, "blur_filter": "Pillow.ImageFilter.GaussianBlur"}
    if topic == "lighting":
        return {"exposure_ev": level, "linear_rgb_multiplier": 2.0 ** level,
                "exposure_transform": "linear_srgb_scaling_with_clipping"}
    box = mask_box(base_id, level)
    return {
        "difficulty": level / 100,
        "mask_definition": "fraction_of_image_area_masked",
        "mask_seed": mask_seed(base_id),
        "mask_box_xyxy_exclusive": list(box) if box else None,
    }


def assign_trials(bank, seed, levels=LEVELS):
    """Sample one variant per image and one image per label at each level."""
    rng = random.Random(seed)
    selected = []
    for label in LABELS:
        by_image = {}
        for variant in bank:
            if variant["ground_truth"] == label:
                by_image.setdefault(variant["base_image_id"], {})[variant["level"]] = variant
        image_ids = sorted(by_image)
        rng.shuffle(image_ids)
        for image_id, level in zip(image_ids, levels, strict=True):
            variant = by_image[image_id][level]
            choices = list(variant["choices"])
            rng.shuffle(choices)
            selected.append({**variant, "choices": choices})
    rng.shuffle(selected)
    return selected
