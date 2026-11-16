import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import definitions from "../assets/depth-scenes.json";

type Choice = "A" | "B";

const scenes = definitions.map((scene) => ({
  ...scene,
  image: new URL(`../assets/depth/${scene.id}.jpg`, import.meta.url).href,
}));
const layeredDepthSource = "https://huggingface.co/datasets/princeton-vl/LayeredDepth";

type Guide = (typeof definitions)[number]["guides"][number];

type DepthPrediction = {
  model_choice: Choice | null;
  relative_inverse_depth: Record<Choice, number>;
};

export const depthModelName = "Depth Anything V2 Small";

async function getPrediction(sceneId: string, choice: Choice): Promise<DepthPrediction> {
  const response = await fetch(`/api/depth/scenes/${sceneId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choice }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Depth prediction unavailable");
  return response.json() as Promise<DepthPrediction>;
}

const choices = ["A", "B"] as const;

function CueGuide({ guide }: { guide: Guide }) {
  const [left, top, width, height] = guide.box;
  return <span className="depth-guide-box" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }} />;
}

export type DepthResult = {
  answers: Choice[];
  predictions: Partial<Record<string, DepthPrediction | "unavailable">>;
};

export function DepthResults({ result }: { result?: DepthResult }) {
  return (
    <section className="results">
      {result ? <DepthSummary result={result} resultsPage /> : <>
        <h1>Depth cues</h1>
        <p>Complete this round to see your score and compare answers with the model.</p>
        <a className="button primary" href="#trial/depth">Open Depth challenge</a>
      </>}
    </section>
  );
}

function DepthSummary({ result: { answers, predictions }, headingRef, resultsPage = false }: {
  result: DepthResult;
  headingRef?: Ref<HTMLHeadingElement>;
  resultsPage?: boolean;
}) {
  const scoredScenes = scenes.filter(({ id }) => typeof predictions[id] === "object");
  const modelCorrect = scoredScenes.filter(({ id, answer }) => {
    const result = predictions[id];
    return typeof result === "object" && result.model_choice === answer;
  }).length;
  const correct = scenes.filter(({ answer }, index) => answers[index] === answer).length;
  const review = scenes.map((item, index) => {
    const model = predictions[item.id];
    const disagreed = typeof model === "object" && model.model_choice !== null && model.model_choice !== answers[index];
    return { item, response: answers[index], model, disagreed };
  });
  const disagreements = review.filter(({ disagreed }) => disagreed).length;

  return <>
    <h1 ref={headingRef} tabIndex={-1}>Depth cues</h1>
    <div className={resultsPage ? "scores" : "scores depth-scores"}>
      <article><h2 className="human">You</h2><strong>{correct}/{scenes.length}</strong><p>Correct choices</p></article>
      <article><h2 className="machine">{depthModelName}</h2>
        <strong>{scoredScenes.length ? `${modelCorrect}/${scoredScenes.length}` : "—"}</strong>
        <p>{scoredScenes.length ? "Correct choices" : "Predictions unavailable"}</p>
      </article>
    </div>
    <p className="note">One scene was selected because the model missed it. The score describes this curated round.</p>
    <section className={resultsPage ? "depth-review panel" : "depth-review"} aria-labelledby="depth-review-title">
      <div className="depth-review-heading">
        <h2 id="depth-review-title">Review the photos</h2>
        <p className="note">{disagreements} {disagreements === 1 ? "disagreement" : "disagreements"}</p>
      </div>
      <ul className="depth-summary" role="list">
        {review.sort((a, b) => Number(b.disagreed) - Number(a.disagreed)).map(({ item, response: chosen, model, disagreed }) => {
          const leftChoice = item.points.A[0] <= item.points.B[0] ? "A" : "B";
          return <li key={item.id} className={disagreed ? "depth-disagreement" : undefined}>
            <div className="depth-frame">
              <img src={item.image} alt={`${item.name} with marked targets A and B`} loading="lazy" />
              {choices.map((choice) => {
                const [x, y] = item.points[choice];
                return <span className="depth-marker depth-review-marker" key={choice}
                  style={{ left: `${x}%`, top: `${y}%` }} data-side={choice === leftChoice ? "left" : "right"}
                  data-emphasis={choice === item.answer ? "correct" : undefined} aria-hidden="true"><span>{choice}</span></span>;
              })}
            </div>
            <div className="depth-card-heading">
              <h3>{item.name}</h3>
              {disagreed && <span>Different answers</span>}
            </div>
            <dl className="depth-card-answers">
              <div><dt>You</dt><dd>{chosen}</dd></div>
              <div><dt>Model</dt><dd>{typeof model === "object" ? model.model_choice ?? "Tied" : "Unavailable"}</dd></div>
              <div><dt>Nearer target</dt><dd>{item.answer}</dd></div>
            </dl>
            <p>{item.explanation}</p>
            {item.selected_model_miss && typeof model === "object" && model.model_choice !== item.answer &&
              <p className="note">Selected example of a model miss.</p>}
          </li>;
        })}
      </ul>
      <p className="note">Photos from <a href={layeredDepthSource}>LayeredDepth</a> · CC0</p>
    </section>
  </>;
}

export function DepthChallenge({ onComplete }: { onComplete: (result: DepthResult) => void }) {
  const [answers, setAnswers] = useState<Choice[]>([]);
  const [predictions, setPredictions] = useState<Partial<Record<string, DepthPrediction | "unavailable">>>({});
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState(0);
  const [loadedScenes, setLoadedScenes] = useState<Set<string>>(() => new Set());
  const [failedScene, setFailedScene] = useState<string>();
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLHeadingElement>(null);
  const scene = scenes[position];
  const response = answers[position];
  const complete = position === scenes.length;
  const ready = Boolean(scene && loadedScenes.has(scene.id));
  const prediction = scene ? predictions[scene.id] : undefined;

  useEffect(() => {
    if (!scene || !response) return;
    let active = true;
    getPrediction(scene.id, response).then(
      (result) => { if (active) setPredictions((current) => ({ ...current, [scene.id]: result })); },
      () => { if (active) setPredictions((current) => ({ ...current, [scene.id]: "unavailable" })); },
    );
    return () => { active = false; };
  }, [scene, response, retry]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [position]);

  useEffect(() => {
    if (response) feedback.current?.focus({ preventScroll: !window.matchMedia("(max-width: 680px)").matches });
  }, [response]);

  useEffect(() => {
    if (!scene || response || !ready) return;
    function onKey(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      const key = event.key.toUpperCase();
      if (key === "A" || key === "B") {
        setAnswers((previous) => previous[position] ? previous : [...previous, key]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [position, ready, response, scene]);

  function choose(choice: Choice) {
    if (ready) setAnswers((previous) => previous[position] ? previous : [...previous, choice]);
  }

  function replay() {
    setAnswers([]);
    setPredictions({});
    setPosition(0);
  }

  const selectedMiss = scene?.selected_model_miss && typeof prediction === "object" && prediction.model_choice !== scene.answer;

  return (
    <section className="depth-page">
      <div className="depth-navigation">
        <a className="back-link" href="#trial">← All challenges</a>
      </div>
      {complete ? <>
        <DepthSummary result={{ answers, predictions }} headingRef={heading} />
        <a className="button secondary" href="#results/depth">Open in Results</a>
        <button className="button primary" type="button" onClick={replay}>Try again</button>
      </> : <>
        <div className="trial-heading">
          <p className="eyebrow">Depth · {scene.name}</p>
          <span>Scene {position + 1} of {scenes.length} · Hard round</span>
        </div>
        <progress value={position + 1} max={scenes.length} aria-label="Depth scene progress" />
        <div className="depth-layout">
          <div className="depth-controls">
            <h1 ref={heading} tabIndex={-1}>{scene.prompt}</h1>
            {failedScene === scene.id && <p role="alert">The photo could not load. Refresh to try again.</p>}
            {response ? <>
              <div className="depth-answer" role="status">
                <p className="eyebrow">{response === scene.answer ? "Correct" : `${scene.answer} is closer`}</p>
                <h2 ref={feedback} tabIndex={-1}>{scene.cue}</h2>
                <p>{scene.explanation}</p>
              </div>
              <div className="depth-model-answer" aria-live="polite">
                <strong className="machine">{depthModelName}</strong>
                {prediction === undefined ? <p>Loading model answer…</p>
                  : prediction === "unavailable" ? <>
                    <p>Prediction unavailable. Make sure the API is running and the Depth model has been prepared.</p>
                    <button className="button secondary" type="button" onClick={() => {
                      setPredictions((current) => ({ ...current, [scene.id]: undefined }));
                      setRetry((count) => count + 1);
                    }}>Retry model answer</button>
                  </> : <p>{prediction.model_choice ? `Chose ${prediction.model_choice} · ${prediction.model_choice === scene.answer ? "Correct" : "Incorrect"}` : "Estimated the two points as tied"}</p>}
                {selectedMiss && typeof prediction === "object" && <p>
                  The model assigned A {prediction.relative_inverse_depth.A.toFixed(2)} and B {prediction.relative_inverse_depth.B.toFixed(2)}.
                  Higher values indicate nearer surfaces in its estimate for this photo.
                </p>}
              </div>
              <button className="button primary" type="button" disabled={prediction === undefined} onClick={() => {
                if (position + 1 === scenes.length) onComplete({ answers, predictions });
                setPosition(position + 1);
              }}>
                {position + 1 === scenes.length ? "See summary" : "Next scene"} <span aria-hidden="true">→</span>
              </button>
            </> : <>
              <p className="note">Select a marker in the photo or press A or B.</p>
              <div className="depth-choice-buttons">
                {choices.map((choice) => <button key={choice} className="button secondary" type="button" disabled={!ready} onClick={() => choose(choice)}>{choice} is closer</button>)}
              </div>
              <p className="note depth-opponent">Your answer is compared with {depthModelName}.</p>
            </>}
          </div>
          <figure className="depth-photo">
            <div className="depth-frame">
              <img src={scene.image} alt={`${scene.name} with two marked targets`} key={scene.id}
                onLoad={() => setLoadedScenes((previous) => new Set([...previous, scene.id]))}
                onError={() => setFailedScene(scene.id)} />
              {response && <div className="depth-guides" aria-hidden="true">
                {scene.guides.map((guide, index) => <CueGuide guide={guide} key={index} />)}
              </div>}
              {ready && choices.map((choice) => {
                const [x, y] = scene.points[choice];
                const style = { left: `${x}%`, top: `${y}%` };
                const emphasis = response ? choice === scene.answer ? "correct" : choice === response ? "miss" : undefined : undefined;
                return <button key={choice} type="button" className="depth-marker" style={style} aria-label={`Choose ${choice}`} data-label={choice}
                  data-emphasis={emphasis} disabled={Boolean(response)} onClick={() => choose(choice)}><span>{choice}</span></button>;
              })}
            </div>
            <figcaption>
              <span>LayeredDepth validation photo · Resized and padded</span>
              <a href={layeredDepthSource}>CC0 · Dataset</a>
            </figcaption>
          </figure>
        </div>
      </>}
      <p className="depth-reading note">The model compares relative depth at the marked points. Reference answers use LayeredDepth annotations or the visible ordering of the marked surfaces.{" "}
        <a href="https://www.sciencedirect.com/science/chapter/edited-volume/pii/B9780122405303500055">Read about how depth cues work together</a>.</p>
    </section>
  );
}

export const depthPreview = scenes[0].image;
