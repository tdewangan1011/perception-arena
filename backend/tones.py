"""Generate paired tones and measure their pitch and RMS level from the encoded WAVs."""
import json

import numpy as np

from .audio_stimulus import SAMPLE_RATE, read_audio, rms, write_audio
from .stimulus import ASSETS

DIRECTORY = ASSETS / "tones"
TONE_SAMPLES = SAMPLE_RATE * 55 // 100
GAP_SAMPLES = SAMPLE_RATE * 3 // 10
RAMP_SAMPLES = SAMPLE_RATE * 3 // 100
STEADY = slice(RAMP_SAMPLES, TONE_SAMPLES - RAMP_SAMPLES)
PURE = (1,)
COMPLEX = (1, .45, .24)


def synthesize(frequency, level, harmonics):
    phase = np.arange(TONE_SAMPLES) * (2 * np.pi * frequency / SAMPLE_RATE)
    waveform = sum(amplitude * np.sin(order * phase) for order, amplitude in enumerate(harmonics, 1))
    ramp = np.sin(np.linspace(0, np.pi / 2, RAMP_SAMPLES)) ** 2
    waveform[:RAMP_SAMPLES] *= ramp
    waveform[-RAMP_SAMPLES:] *= ramp[::-1]
    return waveform * (10 ** (level / 20) / rms(waveform[STEADY]))


def estimate(samples):
    """Find the first strong repetition and refine its period below one sample."""
    signal = samples[STEADY].astype(np.float64)
    signal -= signal.mean()
    max_lag = SAMPLE_RATE // 150
    frame = signal[:-max_lag-1]
    norm = np.linalg.norm(frame)
    correlations = np.empty(max_lag + 2)
    for lag in range(len(correlations)):
        shifted = signal[lag:lag+len(frame)]
        correlations[lag] = np.dot(frame, shifted) / (norm * np.linalg.norm(shifted))
    peak = next(lag for lag in range(SAMPLE_RATE // 850, max_lag + 1)
                if correlations[lag] > .9 and correlations[lag-1] < correlations[lag] >= correlations[lag+1])
    left, center, right = correlations[peak-1:peak+2]
    period = peak + (left - right) / (2 * (left - 2 * center + right))
    return dict(hz=round(SAMPLE_RATE / period, 2), dbfs=round(20 * np.log10(rms(samples[STEADY])), 2))


def write_sequence(path, frequencies, levels, profiles):
    segments = []
    for hz, level, harmonics in zip(frequencies, levels, profiles, strict=True):
        if segments:
            segments.append(np.zeros(GAP_SAMPLES))
        segments.append(synthesize(hz, level, harmonics))
    write_audio(path, np.concatenate(segments))
    clip = read_audio(str(path))
    stride = TONE_SAMPLES + GAP_SAMPLES
    return [estimate(clip[start:start + TONE_SAMPLES]) for start in range(0, len(clip), stride)]


def main():
    DIRECTORY.mkdir(exist_ok=True)
    write_sequence(DIRECTORY / "practice.wav", (360, 440), (-25, -22), (PURE, PURE))
    trials = []
    # One row per trial: frequency of A, signed B pitch difference in cents, signed B level difference in dB.
    conditions = {
        "pitch": [(235, 18, 5), (425, -23, 5), (320, 26, -5), (570, -19, -5),
                  (210, -150, 4), (440, 130, 4), (270, -95, -4), (620, 110, -4)],
        "loudness": [(260, -175, 1.4), (365, -120, -1.5), (525, 160, 1.6), (300, 145, -1.4),
                     (340, 180, -5), (410, 145, 5), (490, -170, -5), (580, -150, 5)],
    }
    for task, pairs in conditions.items():
        for index, (base_hz, cents, delta_db) in enumerate(pairs):
            clip_id = f"{task}-{index+1:02d}"
            frequencies = (base_hz, base_hz * 2 ** (cents / 1200))
            levels = (-24 - delta_db / 2, -24 + delta_db / 2)
            harmonics = COMPLEX if index in (1, 2, 5, 6) else PURE
            estimates = write_sequence(DIRECTORY / f"{clip_id}.wav", frequencies, levels, (harmonics, harmonics))
            metric, delta = ("hz", cents) if task == "pitch" else ("dbfs", delta_db)
            trials.append(dict(
                id=clip_id, task=task, difficulty="Close" if index < 4 else "Wider",
                waveform="Harmonic complex" if harmonics == COMPLEX else "Sine",
                answer="B" if delta > 0 else "A",
                estimateAnswer="B" if estimates[1][metric] > estimates[0][metric] else "A",
                estimates=estimates,
                tones=[dict(hz=round(hz, 2), dbfs=round(level, 2))
                       for hz, level in zip(frequencies, levels, strict=True)],
                conflicting=cents * delta_db < 0,
            ))
    (DIRECTORY / "scenes.json").write_text(json.dumps(trials, indent=2) + "\n", encoding="utf-8")
    print(f'Estimated {sum(trial["answer"] == trial["estimateAnswer"] for trial in trials)}/{len(trials)} pairs.')


if __name__ == "__main__":
    main()
