"""Generate missing-fundamental targets followed by two pure-tone references."""
import json
import math

from .stimulus import ASSETS
from .audio_stimulus import SAMPLE_RATE, read_audio
from .tones import PURE, TONE_SAMPLES, write_sequence

DIRECTORY = ASSETS / "fundamental"
LEVEL = -24
LOW_HARMONICS = (0, .65, 1, .7, .45)
HIGH_HARMONICS = (0, 0, 0, .85, 1, .75, .5, .3)
EVEN_WEIGHTED = (0, 1, .16, .57, .11)


def create_clip(clip_id, fundamental, alternate, target_profile, answer):
    references = (fundamental, alternate) if answer == "A" else (alternate, fundamental)
    frequencies = (fundamental, *references)
    profiles = (target_profile, PURE, PURE)
    path = DIRECTORY / f"{clip_id}.wav"
    estimates = write_sequence(path, frequencies, (LEVEL,) * 3, profiles)
    center = TONE_SAMPLES // 2
    target_wave = read_audio(str(path))[center:center + SAMPLE_RATE * 12 // 1000]
    estimate_choice = min(range(2), key=lambda i: abs(math.log2(estimates[i+1]["hz"] / estimates[0]["hz"])))
    return dict(
        id=clip_id, task="fundamental", answer=answer, estimateAnswer="AB"[estimate_choice],
        estimates=estimates, targetWave=[round(float(sample), 4) for sample in target_wave],
        tones=[
            dict(hz=round(hz, 2), dbfs=LEVEL, harmonics=[round(value / math.hypot(*profile), 3) for value in profile])
            for hz, profile in zip(frequencies, profiles, strict=True)
        ],
    )


def main():
    DIRECTORY.mkdir(exist_ok=True)
    create_clip("practice", 220, 330, LOW_HARMONICS, "A")
    conditions = {
        "Octave choice": [
            (196, 1200, LOW_HARMONICS), (246, 1200, EVEN_WEIGHTED),
            (290, 1200, HIGH_HARMONICS), (218, 1200, EVEN_WEIGHTED),
            (310, 1200, LOW_HARMONICS), (274, 1200, HIGH_HARMONICS),
            (224, 1200, EVEN_WEIGHTED), (328, 1200, LOW_HARMONICS),
        ],
        "Nearby choice": [
            (210, -90, LOW_HARMONICS), (264, 104, HIGH_HARMONICS),
            (330, 140, HIGH_HARMONICS), (235, -125, LOW_HARMONICS),
            (280, -82, HIGH_HARMONICS), (315, 115, LOW_HARMONICS),
            (202, 150, LOW_HARMONICS), (252, -105, HIGH_HARMONICS),
        ],
    }
    trials = []
    for group, (difficulty, rows) in enumerate(conditions.items()):
        for index, (fundamental, cents, profile) in enumerate(rows):
            clip_id = f"fundamental-{len(trials)+1:02d}"
            answer = "AB"[(index + group) % 2]
            trial = create_clip(clip_id, fundamental, fundamental * 2 ** (cents / 1200), profile, answer)
            trials.append(dict(trial, difficulty=difficulty))
    (DIRECTORY / "scenes.json").write_text(json.dumps(trials, indent=2) + "\n", encoding="utf-8")
    print(f'Matched {sum(trial["answer"] == trial["estimateAnswer"] for trial in trials)}/{len(trials)} references.')


if __name__ == "__main__":
    main()
