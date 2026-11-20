"""Package a verified release without session data or model weights."""
import argparse
import re
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from . import color, depth, experiment, gestalt, illusions, speech, prepare_mixed
from .change_pairs import CHANGE_PREDICTIONS, load_change_bank
from .main import load_prediction
from .stimulus import ASSETS, DATA, ROOT


def verified_data():
    banks = {topic: experiment.load_bank(topic) for topic in experiment.DESIGNS}
    banks["change"] = load_change_bank()
    reports = {
        prepare_mixed.CACHE: prepare_mixed.load_predictions(),
        depth.CACHE_FILE: depth.load_predictions(),
        gestalt.CACHE: gestalt.load_predictions(),
        color.CACHE: color.load_predictions(),
        illusions.CACHE: illusions.load_predictions(),
        speech.CACHE: speech.load_predictions(),
    }
    missing = [topic for topic, bank in banks.items() if not bank]
    missing += [path.name for path, report in reports.items() if not report]
    if missing:
        raise SystemExit("Prepare missing or stale assets before release: " + ", ".join(missing))

    predictions = [design.predictions for design in experiment.DESIGNS.values()] + [CHANGE_PREDICTIONS, *reports]
    digests = {trial[key] for bank in banks.values() for trial in bank
               for key in ("stimulus_id", "comparison_stimulus_id") if key in trial}
    digests.update(trial["stimulus_id"] for trial in reports[prepare_mixed.CACHE])
    pilot = load_prediction()
    if pilot:
        predictions.append(DATA / "pilot-prediction.json")
        digests.add(pilot["stimulus_id"])

    # Preserve historical review images across releases when they remain in the preparation directory.
    images = {DATA / "stimuli" / f"{digest}.png" for digest in digests}
    images.update(file for file in (DATA / "stimuli").glob("*.png")
                  if re.fullmatch(r"[0-9a-f]{64}", file.stem))
    return predictions + sorted(images)


def build_release(output):
    dist = ROOT / "dist"
    if not (dist / "index.html").is_file():
        raise SystemExit("Run npm run build first.")
    data = verified_data()
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    with ZipFile(temporary, "w", ZIP_DEFLATED, compresslevel=3) as release:
        for path in data:
            release.write(path, path.relative_to(ROOT).as_posix())
        for directory in (ROOT / "backend", ASSETS, dist):
            for path in sorted(directory.rglob("*")):
                relative = path.relative_to(ROOT)
                if path.is_file() and not {"__pycache__", "design-previews"}.intersection(relative.parts):
                    release.write(path, relative.as_posix())
        release.write(ROOT / "Dockerfile.release", "Dockerfile")
        release.write(ROOT / "DEPLOYMENT.md", "DEPLOYMENT.md")
        credits = [ASSETS / "ATTRIBUTION.md", ASSETS / "depth-scenes.json", ASSETS / "change" / "practice-source.json",
                   ASSETS / "speech" / "scenes.json"]
        credits += [ASSETS / folder / "manifest.json" for folder in ("experiment", "blur", "lighting", "change")]
        for path in credits:
            release.write(path, "dist/credits/" + path.relative_to(ASSETS).as_posix())
    temporary.replace(output)
    print(f"Release ready: {output} ({output.stat().st_size / 1024 ** 2:.1f} MiB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "release" / "perception-arena.zip")
    build_release(parser.parse_args().output.resolve())
