"""16 kHz mono WAV helpers for the auditory challenges."""
import wave

SAMPLE_RATE = 16000


def read_audio(stream):
    import numpy as np

    with wave.open(stream, "rb") as audio:
        if (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) != (SAMPLE_RATE, 1, 2):
            raise ValueError("Expected 16 kHz, mono, 16-bit PCM.")
        return np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768


def write_audio(path, samples):
    import numpy as np

    with wave.open(str(path), "wb") as audio:
        audio.setparams((1, 2, SAMPLE_RATE, 0, "NONE", "not compressed"))
        audio.writeframes(np.rint(samples * 32767).astype("<i2").tobytes())


def rms(samples):
    import numpy as np

    return float(np.sqrt(np.mean(samples ** 2)))


