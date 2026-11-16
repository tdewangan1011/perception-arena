import { useEffect, useRef, useState } from "react";
import { AudioPlayer } from "./audio-player";
import { toneEstimatorName, type ToneTopic, type ToneAnswers } from "./tone-topics";
import definitions from "../assets/tones/scenes.json";
import timbreDefinitions from "../assets/timbre/scenes.json";
import fundamentalDefinitions from "../assets/fundamental/scenes.json";

type Tone = { hz: number; dbfs: number; harmonics?: number[] };
type ToneTrial = {
  id: string;
  task: string;
  difficulty: string;
  answer: string;
  estimateAnswer: string;
  estimates: Tone[];
  tones: Tone[];
  waveform?: string;
  conflicting?: boolean;
  targetWave?: number[];
};
type Choice = "A" | "B";
const choices = ["A", "B"] as const;
const taskNames: Record<string, string> = { pitch: "Pitch", loudness: "Loudness", timbre: "Timbre", fundamental: "Missing Fundamental" };
const rounds = {
  tones: {
    title: "Pitch and Loudness",
    trials: definitions,
    practice: new URL("../assets/tones/practice.wav", import.meta.url).href,
    introduction: "Listen to two tones. Each prompt asks about pitch or loudness. Sometimes the higher note has the lower signal level.",
    example: "Set a comfortable volume here. In this practice pair, B is higher in pitch and has a higher signal level.",
    details: "Sine and harmonic tones",
    start: "Start tone challenge",
    groups: [
      { task: "pitch", difficulty: "Close" }, { task: "pitch", difficulty: "Wider" },
      { task: "loudness", difficulty: "Close" }, { task: "loudness", difficulty: "Wider" },
    ],
  },
  timbre: {
    title: "Same Pitch, Different Timbre",
    trials: timbreDefinitions,
    practice: new URL("../assets/timbre/practice.wav", import.meta.url).href,
    introduction: "Listen to two tones with different harmonic mixes. Decide whether the note itself changed or stayed at the same pitch.",
    example: "Set a comfortable volume here. In this practice pair, the second tone adds harmonics to the same 330 Hz note.",
    details: "Equal signal levels · Subtle and strong changes in timbre",
    start: "Start timbre challenge",
    groups: [{ task: "timbre", difficulty: "Subtle timbre change" }, { task: "timbre", difficulty: "Strong timbre change" }],
  },
  fundamental: {
    title: "Missing Fundamental",
    trials: fundamentalDefinitions,
    practice: new URL("../assets/fundamental/practice.wav", import.meta.url).href,
    introduction: "Hear a complex target tone followed by two pure reference notes. Choose the reference closest to the pitch you hear in the target.",
    example: "Set a comfortable volume. This example plays the target first, then Reference A, then Reference B. A matches the target’s repeat rate of 220 Hz.",
    details: "Nearby and octave-spaced alternatives",
    start: "Start missing fundamental challenge",
    groups: [{ task: "fundamental", difficulty: "Octave choice" }, { task: "fundamental", difficulty: "Nearby choice" }],
  },
} satisfies Record<ToneTopic, { trials: ToneTrial[] } & Record<string, unknown>>;

function clipUrl(topic: ToneTopic, id: string) {
  if (topic === "fundamental") return new URL(`../assets/fundamental/${id}.wav`, import.meta.url).href;
  return topic === "timbre" ? new URL(`../assets/timbre/${id}.wav`, import.meta.url).href
    : new URL(`../assets/tones/${id}.wav`, import.meta.url).href;
}

function choiceLabel(topic: ToneTopic, choice: string) {
  if (topic === "timbre") return choice === "A" ? "Same pitch" : "Different pitch";
  if (topic === "fundamental") return `Reference ${choice}`;
  return choice;
}

function shuffledTrials(trials: ToneTrial[]) {
  const order = [...trials];
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

function ToneQuestion({ topic, trial, position, total, volume, onVolumeChange, onAnswer }: {
  topic: ToneTopic;
  trial: ToneTrial;
  position: number;
  total: number;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onAnswer: (choice: Choice) => void;
}) {
  const [heard, setHeard] = useState(false);
  const [answer, setAnswer] = useState<Choice>();
  const heading = useRef<HTMLHeadingElement>(null);
  const prompt = { pitch: "Which tone had the higher pitch?", loudness: "Which tone sounded louder?",
    timbre: "Did the pitch change?", fundamental: "Which reference matches the target’s pitch?" }[trial.task];
  const fundamental = topic === "fundamental";

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  return <>
    <div className="trial-heading">
      <p className="eyebrow">{taskNames[trial.task]}</p>
      <span>{fundamental ? "Trial" : "Pair"} {position + 1} of {total}</span>
    </div>
    <progress aria-label="Tone challenge progress" value={position + 1} max={total} />
    <h1 ref={heading} tabIndex={-1}>{prompt}</h1>
    <p className="note">{fundamental ? "Listen for the target, then reference A, then reference B." : "A plays first, then B."}</p>
    <AudioPlayer src={clipUrl(topic, trial.id)} label={fundamental ? "target and reference notes" : "tone pair"} volume={volume} onVolumeChange={onVolumeChange} onEnded={() => setHeard(true)} />
    <form onSubmit={(event) => {
      event.preventDefault();
      if (heard && answer) onAnswer(answer);
    }}>
      <fieldset className="diagram-choices speech-choices" disabled={!heard} aria-label="Tone choices">
        {choices.map((choice) => <label key={choice}>
          <input type="radio" name="tone-answer" checked={answer === choice} onChange={() => setAnswer(choice)} />
          {topic !== "tones" ? choiceLabel(topic, choice) : choice === "A" ? "A · First tone" : "B · Second tone"}
        </label>)}
      </fieldset>
      <button type="submit" className="button primary" disabled={!answer}>
        {position + 1 === total ? "See results" : fundamental ? "Next trial" : "Next pair"}
      </button>
    </form>
  </>;
}

export function ToneChallenge({ topic, onComplete }: { topic: ToneTopic; onComplete: (answers: ToneAnswers) => void }) {
  const round = rounds[topic];
  const { trials } = round;
  const [order] = useState(() => shuffledTrials(trials));
  const [position, setPosition] = useState(-1);
  const [answers, setAnswers] = useState<ToneAnswers>({});
  const [volume, setVolume] = useState(.65);
  const trial = order[position];

  return <section className="depth-page speech-page">
    <a className="back-link" href="#trial/auditory">← Auditory challenges</a>
    {trial ? <ToneQuestion key={trial.id} topic={topic} trial={trial} position={position} total={trials.length} volume={volume} onVolumeChange={setVolume} onAnswer={(answer) => {
      const updated = { ...answers, [trial.id]: answer };
      if (position + 1 === trials.length) onComplete(updated);
      else {
        setAnswers(updated);
        setPosition(position + 1);
      }
    }} /> : <>
      <h1>{round.title}</h1>
      <p className="lede">{round.introduction}</p>
      <div className="speech-practice">
        <h2>Volume check</h2>
        <p className="note">{round.example}</p>
        <AudioPlayer src={round.practice} label={topic === "fundamental" ? "practice sequence" : "practice pair"} volume={volume} onVolumeChange={setVolume} />
      </div>
      <p className="note">{trials.length} {topic === "fundamental" ? "trials" : "pairs"} · {round.details}</p>
      <button className="button primary" type="button" onClick={() => setPosition(0)}>{round.start}</button>
    </>}
  </section>;
}

function HarmonicSpectrum({ tone, count = 5 }: { tone: Tone; count?: number }) {
  if (!tone.harmonics) return null;
  return <div className="harmonic-spectrum" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} aria-label="Relative harmonic amplitudes">
    {Array.from({ length: count }, (_, index) => {
      const amplitude = tone.harmonics?.[index] ?? 0;
      const frequency = Math.round(tone.hz * (index + 1));
      return <div key={index} title={`${frequency} Hz · amplitude ${amplitude}`}>
        <div className="harmonic-track" aria-hidden="true"><i style={{ height: `${100 * amplitude}%` }} /></div>
        <span aria-label={`Harmonic ${index + 1}, ${frequency} hertz, relative amplitude ${amplitude}`}>H{index + 1}</span>
      </div>;
    })}
  </div>;
}

function TargetWaveform({ samples }: { samples: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    const { width, height } = context.canvas;
    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#596175";
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();
    context.strokeStyle = "#a7bbff";
    context.lineWidth = 2;
    context.beginPath();
    samples.forEach((sample, index) => {
      const x = index * width / (samples.length - 1);
      const y = height / 2 - sample * height * 2.8;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }, [samples]);

  return <figure className="target-waveform">
    <canvas ref={canvas} width={440} height={104} role="img" aria-label="A 12 millisecond excerpt of the target waveform" />
    <figcaption>Target waveform · 12 ms</figcaption>
  </figure>;
}

export function ToneResults({ topic, answers }: { topic: ToneTopic; answers?: ToneAnswers }) {
  const round = rounds[topic];
  const { trials } = round;
  const timbre = topic === "timbre";
  const fundamental = topic === "fundamental";
  const groupedByTask = topic === "tones";
  const toneNames = fundamental ? ["Target repeat rate", "Reference A", "Reference B"] : ["Tone A", "Tone B"];
  if (!answers) return <section className="depth-page">
    <h1>{round.title}</h1>
    <p>Complete this round to compare your answers with the signal estimator.</p>
    <a className="button primary" href={`#trial/${topic}`}>Open {round.title}</a>
  </section>;

  const review = trials.map((trial: ToneTrial) => ({
    ...trial,
    humanCorrect: answers[trial.id] === trial.answer,
    estimatorCorrect: trial.estimateAnswer === trial.answer,
    disagreed: answers[trial.id] !== trial.estimateAnswer,
  }));
  return <section className="depth-page speech-page">
    <h1>{round.title}</h1>
    <div className="scores depth-scores">
      <article><h2 className="human">You</h2><strong>{review.filter((trial) => trial.humanCorrect).length}/{trials.length}</strong><p>Matches to the signal reference</p></article>
      <article><h2 className="machine">{toneEstimatorName}</h2><strong>{review.filter((trial) => trial.estimatorCorrect).length}/{trials.length}</strong><p>Matches to the signal reference</p></article>
    </div>
    <p className="note speech-method">{fundamental ? <>
      The target repeats at the reference frequency even though the spectrum has no fundamental component (H1). The estimator compares waveform repetition rates. On some targets, strong even harmonics can favor the higher octave. <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11924889/">Read about missing-fundamental pitch</a>.
    </> : timbre ? <>
      Pitch is scored against the generated fundamental frequency. Both tones have the same digital RMS level. The estimator reads the WAV and treats estimates within four cents as the same pitch. The bars show the relative strength of each harmonic. <a href="https://pubmed.ncbi.nlm.nih.gov/560400/">Read about timbre</a>.
    </> : <>
      The estimator analyzes the same WAV you heard. It estimates fundamental frequency from waveform repetition and measures RMS level in dBFS. Loudness is scored against the higher digital signal level. The pitch and playback setup can also affect how loud a tone sounds. <a href="https://pubmed.ncbi.nlm.nih.gov/15376658/">Read about equal loudness</a>.
    </>}</p>
    <section aria-labelledby="tone-breakdown">
      <h2 id="tone-breakdown">{fundamental ? "By reference spacing" : timbre ? "By timbre change" : "By judgment and difference"}</h2>
      <table className="diagram-table">
        <thead><tr>{groupedByTask && <th scope="col">Judgment</th>}<th scope="col">{fundamental ? "Reference spacing" : timbre ? "Timbre change" : "Difference"}</th><th scope="col">You</th><th scope="col">Estimator</th></tr></thead>
        <tbody>{round.groups.map(({ task, difficulty }) => {
          const group = review.filter((trial) => trial.task === task && trial.difficulty === difficulty);
          return <tr key={`${task}-${difficulty}`}>
            {groupedByTask ? <><th scope="row">{taskNames[task]}</th><td>{difficulty}</td></> : <th scope="row">{difficulty}</th>}
            <td>{group.filter((trial) => trial.humanCorrect).length}/{group.length}</td>
            <td>{group.filter((trial) => trial.estimatorCorrect).length}/{group.length}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>
    <section className="depth-review" aria-labelledby="tone-review">
      <h2 id="tone-review">{fundamental ? "Replay the targets and references" : "Replay the tone pairs"}</h2>
      <ul className="depth-summary speech-review" role="list">
        {review.sort((a, b) => Number(b.disagreed) - Number(a.disagreed)).map((trial) => (
          <li key={trial.id} className={trial.disagreed ? "depth-disagreement" : undefined}>
            <div className="depth-card-heading"><h3>{groupedByTask && `${taskNames[trial.task]} · `}{trial.difficulty}</h3>
              {trial.disagreed && <span>Different answers</span>}</div>
            {trial.waveform && <p className="note">{trial.waveform}{trial.conflicting ? " · Higher pitch, lower level" : ""}</p>}
            <dl className="diagram-review-answers">
              <div><dt>You</dt><dd>{choiceLabel(topic, answers[trial.id])}</dd></div>
              <div><dt>Estimator</dt><dd>{choiceLabel(topic, trial.estimateAnswer)}{fundamental && ` · ${trial.estimates[0].hz} Hz`}</dd></div>
              <div><dt>Signal reference</dt><dd>{choiceLabel(topic, trial.answer)}</dd></div>
              {trial.tones.map((tone, index) => <div key={toneNames[index]}>
                <dt>{toneNames[index]}</dt><dd>{tone.hz} Hz{!fundamental && ` · ${tone.dbfs} dBFS`}
                  {(!fundamental || index === 0) && <HarmonicSpectrum tone={tone} count={fundamental ? 8 : 5} />}
                </dd>
              </div>)}
            </dl>
            {trial.targetWave && <TargetWaveform samples={trial.targetWave} />}
            <div className="speech-replays"><audio src={clipUrl(topic, trial.id)} controls preload="none" aria-label={`Replay ${trial.id}`} /></div>
          </li>
        ))}
      </ul>
    </section>
    <a className="button primary" href={`#trial/${topic}`}>Try again</a>
  </section>;
}
