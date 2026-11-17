import { getSavedPredictions } from "./saved-predictions";
import { useEffect, useRef, useState } from "react";
import { AccuracyChart } from "./accuracy-chart";
import { AnswerComparison } from "./answer-comparison";
import gestaltDefinitions from "../assets/gestalt/scenes.json";
import colorDefinitions from "../assets/color/scenes.json";
import illusionDefinitions from "../assets/illusions/scenes.json";

type Choice = 0 | 1;
export type DiagramAnswers = Record<string, Choice>;
export const diagramTopics = ["gestalt", "color", "illusions"] as const;
export type DiagramTopic = (typeof diagramTopics)[number];

export function isDiagramTopic(value: string | null): value is DiagramTopic {
  return diagramTopics.some((topic) => topic === value);
}

type Scene = {
  id: string;
  principle: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  image: string;
  referenceRgb?: number[];
  candidateRgb?: number[][];
};

const gestaltScenes: Scene[] = gestaltDefinitions.map((scene) => ({
  ...scene,
  image: new URL(`../assets/gestalt/${scene.id}.png`, import.meta.url).href,
}));
const colorScenes: Scene[] = colorDefinitions.map((scene) => ({
  ...scene,
  image: new URL(`../assets/color/${scene.id}.png`, import.meta.url).href,
}));
const illusionScenes: Scene[] = illusionDefinitions.map((scene) => ({
  ...scene,
  image: new URL(`../assets/illusions/${scene.id}.png`, import.meta.url).href,
}));

const rounds = {
  gestalt: {
    name: "Gestalt",
    title: "Gestalt principles",
    scenes: gestaltScenes,
    introduction: "Look at a diagram and choose the description that best fits how its parts group into a whole.",
    details: "Three examples per principle · Compared with CLIP ViT-B/32",
    comparison: "CLIP ranks the same two captions by how well they match the diagram. The reference answers reflect how each diagram was designed.",
    questionImageAlt: "Diagram for this visual grouping question",
    breakdown: "Accuracy by principle",
    categoryLabel: "Principle",
    review: "Review the diagrams",
    reading: <>Read more about <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC3482144/">perceptual grouping</a> and <a href="https://doi.org/10.3758/s13423-023-02344-9">Prägnanz</a>.</>,
  },
  color: {
    name: "Color",
    title: "Color",
    scenes: colorScenes,
    introduction: "Compare the center square in the top tile with the center squares in the two bottom tiles. Pick the exact color match, even if a different surround changes how it looks.",
    details: "Four examples per category · Compared with CLIP ViT-B/32",
    comparison: "CLIP compares visual embeddings of the three tiles, including their surrounds. The reference match has identical sRGB values. Screen settings and room light can affect what you see.",
    questionImageAlt: "One reference tile above two candidate tiles. Compare only the small center squares.",
    breakdown: "Accuracy by color cue",
    categoryLabel: "Color cue",
    review: "Review the color matches",
    reading: <>Read how <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5852948/">surrounding colors affect appearance</a>.</>,
  },
  illusions: {
    name: "Visual Illusions",
    title: "Visual illusions",
    scenes: illusionScenes,
    introduction: "Judge the teal shapes or lines by eye. Some diagrams have physically equal or straight targets, while others have a small real difference or bend.",
    details: "Four examples per illusion · Compared with CLIP ViT-B/32",
    comparison: "CLIP ranks the two answer captions for each diagram. The scores compare both choices with the geometry used to draw the targets.",
    questionImageAlt: "Visual illusion diagram with teal targets",
    breakdown: "Accuracy by illusion",
    categoryLabel: "Illusion",
    review: "Review the illusions",
    reading: <>Read about <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8164370/">individual differences in visual illusions</a>.</>,
  },
} satisfies Record<DiagramTopic, { scenes: Scene[] } & Record<string, unknown>>;

export const gestaltPreview = gestaltScenes.find(({ principle }) => principle === "Prägnanz")!.image;
export const colorPreview = colorScenes.find(({ principle }) => principle === "Surround contrast")!.image;
export const illusionPreview = illusionScenes[0].image;

function shuffledTrials(scenes: Scene[], topic: DiagramTopic) {
  const trials = scenes.map((scene) => ({
    ...scene,
    order: (topic === "color" || Math.random() < .5 ? [0, 1] : [1, 0]) as Choice[],
  }));
  for (let index = trials.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [trials[index], trials[other]] = [trials[other], trials[index]];
  }
  return trials;
}

export function DiagramChallenge({ topic, onComplete }: { topic: DiagramTopic; onComplete: (answers: DiagramAnswers) => void }) {
  const round = rounds[topic];
  const { scenes } = round;
  const principles = [...new Set(scenes.map(({ principle }) => principle))];
  const [trials] = useState(() => shuffledTrials(scenes, topic));
  const [answers, setAnswers] = useState<DiagramAnswers>({});
  const [position, setPosition] = useState(-1);
  const [selection, setSelection] = useState<Choice>();
  const heading = useRef<HTMLHeadingElement>(null);
  const scene = trials[position];

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [position]);

  return <section className="depth-page diagram-page">
    <a className="back-link" href="#trial">← All challenges</a>
    {!scene ? <>
      <h1 ref={heading} tabIndex={-1}>{round.title}</h1>
      <p>{round.introduction}</p>
      <p className="note">{scenes.length} diagrams · {round.details}</p>
      <ul className="diagram-categories">{principles.map((name) => <li key={name}>{name}</li>)}</ul>
      <button className="button primary" type="button" onClick={() => setPosition(0)}>Start {round.name} challenge</button>
    </> : <>
      <div className="trial-heading"><p className="eyebrow">{round.name}</p><span>Diagram {position + 1} of {trials.length}</span></div>
      <progress aria-label={`${round.name} challenge progress`} value={position + 1} max={trials.length} />
      <div className="diagram-layout">
        <figure className="diagram-image">
          <img key={scene.id} src={scene.image} width="400" height="400" alt={round.questionImageAlt} />
        </figure>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (selection === undefined) return;
          const updated = { ...answers, [scene.id]: selection };
          if (position + 1 === trials.length) {
            onComplete(updated);
            return;
          }
          setAnswers(updated);
          setSelection(undefined);
          setPosition(position + 1);
        }}>
          <h1 ref={heading} tabIndex={-1}>{scene.prompt}</h1>
          <fieldset aria-label="Answer choices" className="diagram-choices">
            {scene.order.map((option) => <label key={option}>
              <input type="radio" name="diagram-answer" checked={selection === option} onChange={() => setSelection(option)} />
              {scene.options[option]}
            </label>)}
          </fieldset>
          <button type="submit" className="button primary" disabled={selection === undefined}>
            {position + 1 === trials.length ? "See results" : "Next diagram"}
          </button>
        </form>
      </div>
    </>}
  </section>;
}

export function DiagramResults({ topic, answers }: { topic: DiagramTopic; answers?: DiagramAnswers }) {
  const round = rounds[topic];
  const { scenes } = round;
  const principles = [...new Set(scenes.map(({ principle }) => principle))];
  const [predictions, setPredictions] = useState<DiagramAnswers | null>();
  useEffect(() => {
    if (!answers) return;
    const controller = new AbortController();
    getSavedPredictions(topic, AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]))
      .then((predictions) => {
        const choices = predictions as DiagramAnswers;
        if (!scenes.every(({ id }) => choices[id] === 0 || choices[id] === 1)) {
          throw new Error("Incomplete diagram predictions");
        }
        if (!controller.signal.aborted) setPredictions(choices);
      })
      .catch(() => { if (!controller.signal.aborted) setPredictions(null); });
    return () => controller.abort();
  }, [answers, scenes, topic]);

  if (!answers) return <section className="results">
    <h1>{round.title}</h1>
    <p>Finish the {round.name} challenge to see your results.</p>
    <a href={`#trial/${topic}`} className="button primary">Open {round.name} challenge</a>
  </section>;

  const review = scenes.map((scene) => ({
    ...scene,
    player: answers[scene.id],
    model: predictions?.[scene.id],
    disagreed: predictions != null && predictions[scene.id] !== answers[scene.id],
  }));
  const humanCorrect = review.filter(({ player, answer }) => player === answer).length;
  const modelCorrect = review.filter(({ model, answer }) => model === answer).length;
  const bothCorrect = review.filter(({ player, model, answer }) => player === answer && model === answer).length;
  const outcomes = predictions ? {
    both_correct: bothCorrect,
    human_only_correct: humanCorrect - bothCorrect,
    ai_only_correct: modelCorrect - bothCorrect,
    both_wrong: review.length - humanCorrect - modelCorrect + bothCorrect,
  } : undefined;

  return <section className="results">
    <h1>{round.title}</h1>
    <div className="scores">
      <article><h2 className="human">You</h2><strong>{humanCorrect}/{scenes.length}</strong><p>Reference matches</p></article>
      <article><h2 className="machine">CLIP ViT-B/32</h2><strong>{predictions ? `${modelCorrect}/${scenes.length}` : "—"}</strong>
        <p>{predictions ? "Reference matches" : predictions === undefined ? "Loading comparison…" : "Comparison unavailable"}</p></article>
    </div>
    <p className="note">{round.comparison}</p>
    <div className="results-grid diagram-results-grid">
      <section className="panel diagram-accuracy" aria-labelledby="diagram-breakdown">
        <h2 id="diagram-breakdown">{round.breakdown}</h2>
        <AccuracyChart scale={round.categoryLabel} modelLabel="CLIP" groups={principles.map((label) => {
          const group = review.filter(({ principle }) => principle === label);
          return {
            label,
            total: group.length,
            humanCorrect: group.filter(({ player, answer }) => player === answer).length,
            modelCorrect: predictions ? group.filter(({ model, answer }) => model === answer).length : undefined,
          };
        })} />
      </section>
      <AnswerComparison outcomes={outcomes} />
    </div>
    <section className="depth-review panel" aria-labelledby="diagram-review">
      <h2 id="diagram-review">{round.review}</h2>
      <ul className="depth-summary" role="list">
        {review.sort((a, b) => Number(b.disagreed) - Number(a.disagreed)).map((scene) =>
          <li key={scene.id} className={scene.disagreed ? "depth-disagreement" : undefined}>
            <img className="diagram-review-image" src={scene.image} alt={topic === "gestalt" ? scene.options[scene.answer] : round.questionImageAlt} loading="lazy" />
            <div className="depth-card-heading"><h3>{scene.principle}</h3>{scene.disagreed && <span>Different answers</span>}</div>
            <dl className="diagram-review-answers">
              <div><dt>You</dt><dd>{scene.options[scene.player]}</dd></div>
              <div><dt>CLIP</dt><dd>{scene.model === undefined ? "—" : scene.options[scene.model]}</dd></div>
              <div><dt>Reference</dt><dd>{scene.options[scene.answer]}</dd></div>
            </dl>
            {scene.referenceRgb && scene.candidateRgb && <figure className="color-neutral-preview">
              <figcaption>Centers on the same background</figcaption>
              <div>{[scene.referenceRgb, ...scene.candidateRgb].map((rgb, index) =>
                <span key={index}><i aria-hidden="true" style={{ backgroundColor: `rgb(${rgb.join(",")})` }} />{["Top", "Left", "Right"][index]}</span>
              )}</div>
            </figure>}
            <p>{scene.explanation}</p>
          </li>)}
      </ul>
    </section>
    <p className="note">{round.reading}</p>
    <a className="button primary" href={`#trial/${topic}`}>Try again</a>
  </section>;
}
