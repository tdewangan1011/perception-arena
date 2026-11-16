"""Generate equal-level tone pairs that vary harmonic mix and sometimes pitch."""
import json
import math

from .stimulus import ASSETS
from .tones import PURE, write_sequence

DIRECTORY = ASSETS / "timbre"
LEVEL = -24
SAME_PITCH_TOLERANCE_CENTS = 4
MELLOW = (1, .24, .11, .04, .02)
BRIGHT = (1, .72, .54, .41, .33)
ODD = (1, 0, .55, 0, .31)
BALANCED = (1, .45, .25, .18, .09)


def main():
    DIRECTORY.mkdir(exist_ok=True)
    write_sequence(DIRECTORY / "practice.wav", (330, 330), (LEVEL, LEVEL), (PURE, BRIGHT))
    conditions = {
        "Subtle timbre change": [
            (220, 0, MELLOW, BALANCED), (340, 24, BALANCED, MELLOW),
            (392, 0, BALANCED, MELLOW), (276, -31, MELLOW, BALANCED),
            (495, -48, BALANCED, MELLOW), (311, 0, MELLOW, BALANCED),
            (261, 58, MELLOW, BALANCED), (415, 0, BALANCED, MELLOW),
        ],
        "Strong timbre change": [
            (196, 0, PURE, BRIGHT), (294, 26, BRIGHT, PURE),
            (370, 0, ODD, PURE), (262, -35, PURE, ODD),
            (440, 0, BRIGHT, PURE), (329, 55, PURE, BRIGHT),
            (228, 0, ODD, BRIGHT), (415, -57, BRIGHT, ODD),
        ],
    }
    trials = []
    for difficulty, pairs in conditions.items():
        for base, cents, first, second in pairs:
            clip_id = f"timbre-{len(trials)+1:02d}"
            frequencies = (base, base * 2 ** (cents / 1200))
            profiles = (first, second)
            estimates = write_sequence(DIRECTORY / f"{clip_id}.wav", frequencies, (LEVEL, LEVEL), profiles)
            measured_cents = 1200 * math.log2(estimates[1]["hz"] / estimates[0]["hz"])
            trials.append(dict(
                id=clip_id, task="timbre", difficulty=difficulty,
                answer="A" if cents == 0 else "B",
                estimateAnswer="A" if abs(measured_cents) <= SAME_PITCH_TOLERANCE_CENTS else "B",
                estimates=estimates,
                tones=[dict(hz=round(hz, 2), dbfs=LEVEL,
                            harmonics=[round(value / math.sqrt(sum(x*x for x in profile)), 3)
                                       for value in profile])
                       for hz, profile in zip(frequencies, profiles, strict=True)],
            ))
    (DIRECTORY / "scenes.json").write_text(json.dumps(trials, indent=2) + "\n", encoding="utf-8")
    print(f'Matched {sum(trial["answer"] == trial["estimateAnswer"] for trial in trials)}/{len(trials)} pitch references.')


if __name__ == "__main__":
    main()
