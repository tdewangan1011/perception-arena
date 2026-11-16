import { useEffect, useRef, useState } from "react";
import { AudioPlayer } from "./audio-player";
import { normalizedWord } from "./speech-scoring";
import recordings from "../assets/speech/scenes.json";

type SpeechTrial = (typeof recordings.trials)[number];
export type SpeechAnswers = Record<string, string>;
type Transcripts = Record<string, string>;

export const speechModelName = "Whisper Base (English)";
const words = recordings.choices;
const trials = recordings.trials;
const levels = [...new Set(trials.map(({ snr }) => snr))].sort((a, b) => b - a);
const practice = new URL("../assets/speech/clean/practice.wav", import.meta.url).href;

function noisyAudio(id: string) {
  return new URL(`../assets/speech/noisy/${id}.wav`, import.meta.url).href;
}

function cleanAudio(id: string) {
  return new URL(`../assets/speech/clean/${id}.wav`, import.meta.url).href;
}

function shuffledTrials() {
  const order = [...trials];
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

function noiseLabel(snr: number) {
  return `${snr > 0 ? "+" : ""}${snr} dB`;
}

function ListeningTrial({ trial, position, volume, onVolumeChange, onAnswer }: {
  trial: SpeechTrial;
  position: number;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onAnswer: (answer: string) => void;
}) {
  const [heard, setHeard] = useState(false);
  const [answer, setAnswer] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  return <>
    <div className="trial-heading">
      <p className="eyebrow">Speech in Noise</p>
      <span>Clip {position + 1} of {trials.length}</span>
    </div>
    <progress aria-label="Speech challenge progress" value={position + 1} max={trials.length} />
    <h1 ref={heading} tabIndex={-1}>Which word did you hear?</h1>
    <AudioPlayer src={noisyAudio(trial.id)} label="noisy word clip" volume={volume} onVolumeChange={onVolumeChange}
      onEnded={() => setHeard(true)} />
    <p className="note">{heard ? "Pick the closest word. You can replay the clip." : "Play the clip to unlock the choices."}</p>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (heard && answer) onAnswer(answer);
    }}>
      <fieldset className="diagram-choices speech-choices" disabled={!heard} aria-label="Word choices">
        {words.map((word) => <label key={word} className="spoken-word">
          <input type="radio" name="spoken-word" value={word} checked={answer === word} onChange={() => setAnswer(word)} />
          {word}
        </label>)}
      </fieldset>
      <button type="submit" className="button primary" disabled={!answer}>
        {position + 1 === trials.length ? "See results" : "Next clip"}
      </button>
    </form>
  </>;
}

export function SpeechChallenge({ onComplete }: { onComplete: (answers: SpeechAnswers) => void }) {
  const [order] = useState(shuffledTrials);
  const [position, setPosition] = useState(-1);
  const [answers, setAnswers] = useState<SpeechAnswers>({});
  const [volume, setVolume] = useState(.65);
  const trial = order[position];

  return <section className="depth-page speech-page">
    <a className="back-link" href="#trial/auditory">← Auditory challenges</a>
    {trial ? <ListeningTrial key={trial.id} trial={trial} position={position} volume={volume} onVolumeChange={setVolume} onAnswer={(answer) => {
      const updated = { ...answers, [trial.id]: answer };
      if (position + 1 === trials.length) onComplete(updated);
      else {
        setAnswers(updated);
        setPosition(position + 1);
      }
    }} /> : <>
      <h1>Speech in Noise</h1>
      <p className="lede">Listen to a person say one word through background noise, then choose the word you heard.</p>
      <div className="speech-practice">
        <h2>Volume check</h2>
        <p className="note">Play this clean recording of “yes” and set a comfortable volume.</p>
        <AudioPlayer src={practice} label="clean practice clip saying yes" volume={volume} onVolumeChange={setVolume} />
      </div>
      <p className="note">{trials.length} clips · Four noise levels · Compared with {speechModelName}</p>
      <button className="button primary" type="button" onClick={() => setPosition(0)}>Start listening</button>
    </>}
  </section>;
}

export function SpeechResults({ answers }: { answers?: SpeechAnswers }) {
  const [transcripts, setTranscripts] = useState<Transcripts | null>();
  useEffect(() => {
    if (!answers) return;
    const controller = new AbortController();
    fetch("/api/speech/predictions", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Speech predictions unavailable");
        const values = await response.json() as Transcripts;
        if (!trials.every(({ id }) => typeof values[id] === "string")) throw new Error("Missing speech predictions");
        if (!controller.signal.aborted) setTranscripts(values);
      })
      .catch(() => { if (!controller.signal.aborted) setTranscripts(null); });
    return () => controller.abort();
  }, [answers]);

  if (!answers) return <section className="depth-page">
    <h1>Speech in Noise</h1>
    <p>Complete the auditory round to compare your answers with Whisper.</p>
    <a className="button primary" href="#trial/speech">Open Speech in Noise</a>
  </section>;

  const review = trials.map((trial) => ({
    ...trial,
    humanCorrect: answers[trial.id] === trial.answer,
    modelCorrect: transcripts != null && normalizedWord(transcripts[trial.id]) === trial.answer,
    disagreed: transcripts != null && normalizedWord(transcripts[trial.id]) !== answers[trial.id],
  }));
  return <section className="depth-page speech-page">
    <h1>Speech in Noise</h1>
    <div className="scores depth-scores">
      <article><h2 className="human">You</h2><strong>{review.filter((trial) => trial.humanCorrect).length}/{trials.length}</strong><p>Correct words</p></article>
      <article><h2 className="machine">{speechModelName}</h2>
        <strong>{transcripts ? `${review.filter((trial) => trial.modelCorrect).length}/${trials.length}` : "—"}</strong>
        <p>{transcripts ? "Correct words" : transcripts === undefined ? "Loading comparison…" : "Comparison unavailable"}</p></article>
    </div>
    <p className="note speech-method">Whisper transcribed the same noisy clips without seeing the four choices. A transcript counts when its only word matches the reference, ignoring capitalization and punctuation. Lower signal-to-noise ratios mean more noise relative to speech.</p>
    <section aria-labelledby="speech-breakdown">
      <h2 id="speech-breakdown">By signal-to-noise ratio</h2>
      <table className="diagram-table">
        <thead><tr><th scope="col">SNR</th><th scope="col">You</th><th scope="col">Whisper</th></tr></thead>
        <tbody>{levels.map((snr) => {
          const group = review.filter((trial) => trial.snr === snr);
          return <tr key={snr}><th scope="row">{noiseLabel(snr)}</th>
            <td>{group.filter((trial) => trial.humanCorrect).length}/{group.length}</td>
            <td>{transcripts ? `${group.filter((trial) => trial.modelCorrect).length}/${group.length}` : "—"}</td></tr>;
        })}</tbody>
      </table>
    </section>
    <section className="depth-review" aria-labelledby="speech-review">
      <h2 id="speech-review">Replay the clips</h2>
      <ul className="depth-summary speech-review" role="list">
        {review.sort((a, b) => Number(b.disagreed) - Number(a.disagreed)).map((trial) => (
          <li key={trial.id} className={trial.disagreed ? "depth-disagreement" : undefined}>
            <div className="depth-card-heading"><h3>{noiseLabel(trial.snr)}</h3>{trial.disagreed && <span>Different answers</span>}</div>
            <dl className="diagram-review-answers">
              <div><dt>You</dt><dd>{answers[trial.id]}</dd></div>
              <div><dt>Whisper transcript</dt><dd>{transcripts ? transcripts[trial.id] || "No words transcribed" : "—"}</dd></div>
              <div><dt>Reference</dt><dd>{trial.answer}</dd></div>
            </dl>
            <div className="speech-replays">
              <div><p className="note">Noisy clip</p><audio src={noisyAudio(trial.id)} controls preload="none" aria-label={`Noisy recording of ${trial.answer} at ${noiseLabel(trial.snr)}`} /></div>
              <div><p className="note">Clean clip</p><audio src={cleanAudio(trial.id)} controls preload="none" aria-label={`Clean recording of ${trial.answer}`} /></div>
            </div>
          </li>
        ))}
      </ul>
    </section>
    <p className="note">Voice recordings from <a href={recordings.source}>Google Speech Commands</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a></p>
    <a className="button primary" href="#trial/speech">Try again</a>
  </section>;
}
