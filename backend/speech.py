"""Prepare and score the Speech in Noise round from Google Speech Commands."""
import argparse
import hashlib
import io
import json
import random
import re
import tarfile
from pathlib import Path

from .audio_stimulus import SAMPLE_RATE, read_audio, rms, write_audio
from .stimulus import ASSETS, DATA

ROOT = ASSETS / "speech"
MANIFEST = ROOT / "scenes.json"
CACHE = DATA / "speech-predictions.json"
MODEL_ID = "openai/whisper-base.en"
REVISION = "911407f4214e0e1d82085af863093ec0b66f9cd6"
MODEL_FILES = ("*.json", "model.safetensors", "merges.txt")
DATASET = "https://huggingface.co/datasets/google/speech_commands"
ARCHIVE_SHA256 = "8f9e1dd79699be3b34552960aa03af1e1c24b4ee014ca28d18d01faca72e1dc0"
CHOICES = ("go", "no", "down", "wow")
LEVELS = (15, 8, 0, -8)
SEED = 52601
FRAME = SAMPLE_RATE // 50
TARGET_RMS = 10 ** (-24 / 20)


def active_frames(samples):
    import numpy as np

    levels = np.sqrt(np.mean(samples.reshape(-1, FRAME) ** 2, axis=1))
    return levels >= max(float(levels.max()) * .14, .005)


def clean_audio(samples):
    import numpy as np

    if len(samples) < SAMPLE_RATE // 2 or np.max(np.abs(samples)) > .97:
        return None
    samples = np.pad(samples, (0, (-len(samples)) % FRAME))
    active = np.flatnonzero(active_frames(samples))
    if len(active) < 7 or rms(samples[np.repeat(active_frames(samples), FRAME)]) < .022:
        return None
    lo, hi = max(0, active[0]-2)*FRAME, (active[-1]+3)*FRAME
    samples = np.pad(samples[lo:hi], (8*FRAME, 8*FRAME))
    fade = FRAME // 2
    samples[:fade] *= np.linspace(0, 1, fade)
    samples[-fade:] *= np.linspace(1, 0, fade)
    return samples * min(TARGET_RMS / rms(samples[np.repeat(active_frames(samples), FRAME)]),
                         .85 / np.max(np.abs(samples)))


def prepare(archive):
    with archive.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != ARCHIVE_SHA256:
            raise ValueError("Expected the Google Speech Commands v0.01 validation archive.")
    rng = random.Random(SEED)
    (ROOT / "clean").mkdir(parents=True, exist_ok=True)
    scenes = []
    used_speakers = set()
    with tarfile.open(archive, "r:gz") as dataset:
        by_word = {word: [] for word in (*CHOICES, "yes")}
        for member in dataset.getmembers():
            parts = Path(member.name).parts
            if member.isfile() and len(parts) == 2 and parts[0] in by_word and parts[1].endswith(".wav"):
                by_word[parts[0]].append(member)
        for entries in by_word.values():
            entries.sort(key=lambda member: member.name)
            rng.shuffle(entries)

        def select(word, clip_id):
            for entry in by_word[word]:
                speaker = Path(entry.name).stem.split("_")[0]
                if speaker in used_speakers:
                    continue
                with dataset.extractfile(entry) as stream:
                    samples = clean_audio(read_audio(io.BytesIO(stream.read())))
                if samples is not None:
                    used_speakers.add(speaker)
                    write_audio(ROOT / "clean" / f"{clip_id}.wav", samples)
                    return entry.name
            raise ValueError(f"No suitable unused recording for {word}")

        practice_source = select("yes", "practice")
        for snr in LEVELS:
            for word in CHOICES:
                clip_id = f"clip-{len(scenes)+1:02d}"
                scenes.append(dict(id=clip_id, answer=word, snr=snr, source=select(word, clip_id)))
    MANIFEST.write_text(json.dumps(dict(choices=CHOICES, source=DATASET,
        practiceSource=practice_source, trials=scenes), indent=2) + "\n", encoding="utf-8")
    mix()


def mix():
    """Use a stationary masker shaped by the average power spectrum of the speech."""
    import numpy as np

    scenes = load_manifest()["trials"]
    clean = []
    for scene in scenes:
        with (ROOT / "clean" / f'{scene["id"]}.wav').open("rb") as stream:
            clean.append(read_audio(stream))
    fft_length = 512
    window = np.hanning(fft_length)
    power = []
    for samples in clean:
        for start in range(0, len(samples) - fft_length + 1, fft_length // 2):
            spectrum = np.fft.rfft(samples[start:start+fft_length] * window)
            power.append(np.abs(spectrum) ** 2)
    shape = np.sqrt(np.mean(power, axis=0))
    rng = np.random.default_rng(SEED)
    (ROOT / "noisy").mkdir(exist_ok=True)
    for scene, speech in zip(scenes, clean, strict=True):
        noise = rng.standard_normal(len(speech))
        response = np.interp(np.fft.rfftfreq(len(speech)), np.fft.rfftfreq(fft_length), shape)
        noise = np.fft.irfft(np.fft.rfft(noise) * response, n=len(speech))
        ramp = np.linspace(0, 1, 3*FRAME)
        noise[:len(ramp)] *= ramp
        noise[-len(ramp):] *= ramp[::-1]
        active = np.repeat(active_frames(speech), FRAME)
        noise *= rms(speech[active]) / (rms(noise[active]) * 10 ** (scene["snr"] / 20))
        combined = speech + noise
        combined *= min(TARGET_RMS / rms(combined[active]), .85 / np.max(np.abs(combined)))
        write_audio(ROOT / "noisy" / f'{scene["id"]}.wav', combined)


def load_manifest():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def fingerprint(trials):
    result = hashlib.sha256(MANIFEST.read_bytes())
    for scene in trials:
        result.update((ROOT / "noisy" / f'{scene["id"]}.wav').read_bytes())
    return result.hexdigest()


def load_predictions():
    try:
        trials = load_manifest()["trials"]
        report = json.loads(CACHE.read_text(encoding="utf-8"))
        transcripts = report["transcripts"]
        if (
            report["model_id"] == MODEL_ID and report["revision"] == REVISION
            and report["fingerprint"] == fingerprint(trials)
            and set(transcripts) == {scene["id"] for scene in trials}
            and all(isinstance(value, str) for value in transcripts.values())
        ):
            return transcripts
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        pass
    return None


def score():
    import torch
    from huggingface_hub import snapshot_download
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    torch.set_num_threads(4)
    folder = DATA / "model-cache" / "whisper-base.en" / REVISION
    checkpoint = snapshot_download(MODEL_ID, revision=REVISION, local_dir=folder, allow_patterns=MODEL_FILES)
    processor = WhisperProcessor.from_pretrained(checkpoint)
    model = WhisperForConditionalGeneration.from_pretrained(checkpoint).eval()
    trials = load_manifest()["trials"]

    def transcribe(scene, variant):
        with (ROOT / variant / f'{scene["id"]}.wav').open("rb") as stream:
            samples = read_audio(stream)
        inputs = processor(samples, sampling_rate=SAMPLE_RATE, return_tensors="pt", return_attention_mask=True)
        with torch.inference_mode():
            tokens = model.generate(**inputs, max_new_tokens=16, do_sample=False)
        return processor.batch_decode(tokens, skip_special_tokens=True)[0].strip()

    def matches(transcript, word):
        return re.findall(r"[a-z']+", transcript.lower()) == [word]

    transcripts = {scene["id"]: transcribe(scene, "noisy") for scene in trials}
    temp = CACHE.with_suffix(".tmp")
    temp.write_text(json.dumps(dict(model_id=MODEL_ID, revision=REVISION, fingerprint=fingerprint(trials),
                                    transcripts=transcripts), indent=2), encoding="utf-8")
    temp.replace(CACHE)
    for level in LEVELS:
        group = [scene for scene in trials if scene["snr"] == level]
        print(f'{level:+d} dB: {sum(matches(transcripts[s["id"]], s["answer"]) for s in group)}/{len(group)}', flush=True)
    clean_correct = sum(matches(transcribe(scene, "clean"), scene["answer"]) for scene in trials)
    print(f"Clean recordings: {clean_correct}/{len(trials)}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", type=Path, metavar="VALIDATION_ARCHIVE")
    mode.add_argument("--mix", action="store_true")
    mode.add_argument("--score", action="store_true")
    args = parser.parse_args()
    if args.prepare:
        prepare(args.prepare)
    elif args.mix:
        mix()
    else:
        score()
