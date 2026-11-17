from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
DATA = ROOT / "data"


def review_image_url(digest):
    return f"/api/review-images/{digest}.png"
MODEL_ID = "openai/clip-vit-base-patch32"
REVISION = "3d74acf9a28c67741b2f4f2ea7635f0aaf6f0268"
PROMPT = "a photo of a {}."
CHOICES = ["Bicycle", "Motorcycle", "Scooter", "Wheelchair"]
GROUND_TRUTH = "Bicycle"
MASK_BOX = (192, 204, 408, 484)
MASK_COLOR = (26, 30, 38)
WIDTH, HEIGHT = 600, 504
MASK_FRACTION = ((MASK_BOX[2] - MASK_BOX[0]) * (MASK_BOX[3] - MASK_BOX[1])) / (WIDTH * HEIGHT)
