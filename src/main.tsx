import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { previewModel, previewTrial, type ModelStatus } from "./preview";
import {
  ApiError, getExperiment, getExperimentResult, getModelStatus, getPilotResult,
  startExperiment, startPilot, submitExperimentAnswer, submitPilotAnswer,
  type ExperimentResult, type ExperimentSession, type PilotAnswer, type PilotResult, type PilotSession, type ScoredTrial, type Topic,
} from "./pilot";
import { Results } from "./results";
import { topics } from "./topics";
import { ChangeBlindness } from "./change-blindness";
import { DepthChallenge, DepthResults, depthPreview, type DepthResult } from "./depth";
import { DiagramChallenge, DiagramResults, colorPreview, diagramTopics, gestaltPreview, illusionPreview, isDiagramTopic, type DiagramAnswers, type DiagramTopic } from "./diagram-challenge";
import { FlickerImages } from "./pair-images";
import { SpeechChallenge, SpeechResults, type SpeechAnswers } from "./speech";
import { isToneTopic, toneTopics, type ToneAnswers, type ToneTopic } from "./tone-topics";
import { blankMs, visibleMs } from "./flicker";
import { readResult, readResultValue, saveResult, saveResultValue } from "./result-storage";
import "./styles.css";

const ToneChallenge = lazy(() => import("./tones").then(({ ToneChallenge }) => ({ default: ToneChallenge })));
const ToneResults = lazy(() => import("./tones").then(({ ToneResults }) => ({ default: ToneResults })));
const OverallResults = lazy(() => import("./overall-results").then(({ OverallResults }) => ({ default: OverallResults })));

const pilotKey = "perception-arena-pilot";
const resultsKey = "perception-arena-latest-results";
const depthResultsKey = "perception-arena-depth-results";
const speechResultsKey = "perception-arena-speech-v1-results";
const toneResultsKeys = {
  tones: "perception-arena-tones-v1-results", timbre: "perception-arena-timbre-v1-results", fundamental: "perception-arena-fundamental-v1-results",
};
const toneLabels = { tones: "Pitch and Loudness", timbre: "Same Pitch, Different Timbre", fundamental: "Missing Fundamental" };
const diagramResultsKeys = {
  gestalt: "perception-arena-gestalt-v1-results",
  color: "perception-arena-color-v1-results",
  illusions: "perception-arena-illusions-v1-results",
};
const diagramLabels = { gestalt: "Gestalt", color: "Color", illusions: "Visual Illusions" };
const recognitionTopics = ["occlusion", "blur", "lighting"] as const;
const topicIds = [...recognitionTopics, "change"] as const;
const lightingPreview = new URL("../assets/change/photo-08.jpg", import.meta.url).href;
const activeKeys = {
  occlusion: "perception-arena-experiment",
  blur: "perception-arena-blur",
  lighting: "perception-arena-lighting",
  change: "perception-arena-change",
};
const completedKeys = {
  occlusion: "perception-arena-experiment-result",
  blur: "perception-arena-blur-result",
  lighting: "perception-arena-lighting-result",
  change: "perception-arena-change-result",
  pilot: pilotKey,
};
type ResultView = keyof typeof completedKeys;
type SavedDepth = {
  rounds: { hard?: DepthResult };
};

function readDepthResult(): DepthResult | undefined {
  return readResult<SavedDepth>(depthResultsKey)?.rounds?.hard;
}

function topicReady(model: ModelStatus, topic: Topic) {
  return {
    occlusion: model.experimentReady,
    blur: model.blurReady,
    lighting: model.lightingReady,
    change: model.changeReady,
  }[topic];
}

const pages = [
  { id: "overview", title: "Overview" },
  { id: "trial", title: "Challenge" },
  { id: "results", title: "Results" },
] as const;

function currentRoute() {
  const [segment, selected] = location.hash.slice(1).split("/");
  const page = pages.find(({ id }) => segment === id)?.id ?? "overview";
  const topic = topicIds.find((id) => id === selected);
  return { page, topic, pilotSelected: selected === "pilot", changeSelected: selected === "change-blindness", depthSelected: selected === "depth",
    diagramTopic: diagramTopics.find((id) => id === selected), speechSelected: selected === "speech",
    toneTopic: toneTopics.find((id) => id === selected),
    auditorySelected: selected === "auditory", visualSelected: selected === "visual",
    overallSelected: page === "results" && (!selected || selected === "overall") };
}

function Stimulus({ imageUrl, preview = true, square = false, onLoad, onError }: {
  imageUrl: string;
  preview?: boolean;
  square?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}) {
  return (
    <div className={square ? "stimulus square-stimulus" : "stimulus"}>
      <img src={imageUrl} alt="Object recognition stimulus" onLoad={onLoad} onError={onError} />
      {preview && <>
        <span className="mask mask-top" aria-hidden="true" />
        <span className="mask mask-bottom" aria-hidden="true" />
      </>}
    </div>
  );
}

function Overview() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="accent-line" /> A perception experiment</p>
          <h1>Explore how we perceive.</h1>
          <p className="lede">Recognize objects in altered images and pick out words through background noise. See where your answers and the models’ diverge.</p>
          <div className="actions">
            <a className="button primary" href="#trial">Start challenge <span aria-hidden="true">→</span></a>
            <a className="button secondary" href="#results">Preview results</a>
          </div>
        </div>
        <figure className="hero-figure">
          <div className="figure-top"><span><i /> Stimulus preview</span><span>Occlusion</span></div>
          <Stimulus imageUrl={previewTrial.imageUrl} />
          <figcaption><span>Illustrative image</span><span>Four possible answers</span></figcaption>
        </figure>
      </section>
      <section className="overview-topics" aria-labelledby="overview-topics">
        <h2 id="overview-topics">Choose a challenge</h2>
        <div className="science">
          <a className="challenge-card" href="#trial/visual">
            <div className="challenge-copy">
              <h3>Visual challenges</h3>
              <p>Recognize objects with less detail, judge depth, and explore how context affects what you see.</p>
              <span className="challenge-action">Explore visual challenges <span aria-hidden="true">→</span></span>
            </div>
          </a>
          <a className="challenge-card" href="#trial/auditory">
            <div className="challenge-copy">
              <h3>Auditory challenges</h3>
              <p>Pick out words through background noise, compare tones, and listen for a missing fundamental.</p>
              <span className="challenge-action">Explore auditory challenges <span aria-hidden="true">→</span></span>
            </div>
          </a>
        </div>
      </section>
      <section className="overview-instructions" aria-labelledby="how-to-play">
        <h2 id="how-to-play">How to play</h2>
        <p className="lede">Choose a visual or auditory challenge and compare your answers with a model.</p>
        <ol className="instructions">
          <li><div><h3>Visual challenges</h3><p>Keep your screen distance and zoom steady. Follow the prompts for each image or diagram.</p></div></li>
          <li><div><h3>Auditory challenges</h3><p>Use the practice clip to set a comfortable volume. Listen to each clip before answering.</p></div></li>
          <li><div><h3>Review your answers</h3><p>Open Results to compare your completed rounds with the models.</p></div></li>
        </ol>
      </section>
    </>
  );
}

function Challenge({ scoredTrial, onAnswer }: {
  scoredTrial?: ScoredTrial;
  onAnswer?: (answer: PilotAnswer) => Promise<void>;
}) {
  const trial = scoredTrial ?? previewTrial;
  const experiment = Boolean(scoredTrial && trial.total > 1);
  const comparison = scoredTrial?.comparisonUrl;
  const noChangeChoice = comparison ? trial.choices.find((option) => option === "No change") : undefined;
  const [choice, setChoice] = useState<string>();
  const [confidence, setConfidence] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [flickerStart, setFlickerStart] = useState<number>();
  const revealedAt = useRef(0);
  const loadedFrames = useRef(new Set<number>());
  const pendingAnswer = useRef<PilotAnswer | null>(null);
  const choicesLocked = submitted || !imageReady || Boolean(pendingAnswer.current);

  function markLoaded(frame: number) {
    loadedFrames.current.add(frame);
    if (loadedFrames.current.size !== (comparison ? 2 : 1) || revealedAt.current || (comparison && document.hidden)) return;
    revealedAt.current = performance.now();
    if (comparison) setFlickerStart(revealedAt.current);
    setImageReady(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice || !imageReady || saving || submitted) return;
    if (!scoredTrial || !onAnswer) {
      setSubmitted(true);
      return;
    }
    pendingAnswer.current ??= {
      trial_id: scoredTrial.trial_id,
      human_choice: choice,
      human_confidence_pct: confidence ? Number(confidence) : null,
      human_response_ms: Math.round(performance.now() - revealedAt.current),
      ...(comparison && { flicker_timing: { visible_ms: visibleMs, blank_ms: blankMs } }),
    };
    setSaving(true);
    if (comparison) setFlickerStart(undefined);
    setError("");
    try {
      await onAnswer(pendingAnswer.current);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the answer. Please retry.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!comparison) return;
    function handleVisibility() {
      if (pendingAnswer.current || loadedFrames.current.size !== 2) return;
      if (document.hidden) {
        setFlickerStart(undefined);
        setImageReady(false);
        setChoice(undefined);
        return;
      }
      revealedAt.current = performance.now();
      setFlickerStart(revealedAt.current);
      setImageReady(true);
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [comparison]);

  useEffect(() => {
    function selectWithKey(event: KeyboardEvent) {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey || submitted || !imageReady || pendingAnswer.current ||
          (target instanceof HTMLElement && target.closest("input:not([type=radio]), select, textarea, [contenteditable]"))) return;
      if (comparison ? /^[0-9]$/.test(event.key) : /^[1-4]$/.test(event.key)) {
        const option = event.key === "0" ? noChangeChoice : trial.choices[Number(event.key) - 1];
        if (option) setChoice(option);
      }
    }
    window.addEventListener("keydown", selectWithKey);
    return () => window.removeEventListener("keydown", selectWithKey);
  }, [trial, submitted, imageReady, comparison, noChangeChoice]);

  return (
    <section className="trial-page">
      <div className="trial-heading"><p className="eyebrow">{experiment ? `${trial.block} challenge` : scoredTrial ? "Pilot · Occlusion" : "Example trial · Preview"}</p><span role="status">Trial {trial.position} of {trial.total}</span></div>
      <progress value={trial.position} max={trial.total} aria-label="Trial progress" />
      <div className={comparison ? "pair-trial" : "trial-grid"}>
        {comparison ? <FlickerImages first={trial.imageUrl} second={comparison} startedAt={flickerStart} onLoad={markLoaded}
          onSelect={setChoice} selection={choice} disabled={choicesLocked}
          onError={() => setError("An image failed to load. Reopen the challenge to retry.")} /> : <figure className="hero-figure">
          <Stimulus imageUrl={trial.imageUrl} preview={!scoredTrial} square={experiment} onLoad={() => markLoaded(0)}
            onError={() => setError("The stimulus failed to load. Reopen the challenge to retry.")} />
          {!experiment && <figcaption>{scoredTrial ? "Pilot stimulus" : "Illustrative image"}</figcaption>}
        </figure>}
        <form onSubmit={submit}>
          <h1>{comparison ? "Which region changed?" : "What object is this?"}</h1>
          {comparison && <>
            <p className="pair-instructions">Click the object that changed{noChangeChoice ? ", or choose No change for identical views" : ""}. Keys 1–9 select regions from top left to bottom right.</p>
            <p className="pair-selection" role="status">{choice ? `Selected: ${choice}` : "Select an answer to continue."}</p>
          </>}
          <fieldset disabled={choicesLocked}>
            <legend className="sr-only">Choose one answer</legend>
            {trial.choices.map((option, index) => (comparison && option !== noChangeChoice ? null : (
              <label className="option" key={option}>
                <input type="radio" name="choice" value={option} checked={choice === option} onChange={() => setChoice(option)} />
                <span className="key">{(index + 1) % 10}</span><span>{option}</span>
              </label>
            )))}
            {!comparison && <label className="confidence">Confidence <span>(optional)</span>
              <select name="confidence" value={confidence} onChange={(event) => setConfidence(event.currentTarget.value)}>
                <option value="">Skip</option>
                <option value="25">25%</option><option value="50">50%</option>
                <option value="75">75%</option><option value="100">100%</option>
              </select>
            </label>}
          </fieldset>
          {submitted ? (
            <div className="trial-end">
              <p className="note" role="status">Example complete. Preview responses aren’t saved or scored.</p>
              <a className="button primary" href="#results">Preview results <span aria-hidden="true">→</span></a>
            </div>
          ) : <button className="button primary" type="submit" disabled={!choice || !imageReady || saving}>
            {saving ? "Saving…" : pendingAnswer.current ? "Retry saving" : "Submit answer"} <span aria-hidden="true">→</span>
          </button>}
          {error && <p className="note trial-error" role="alert">{error}</p>}
        </form>
      </div>
    </section>
  );
}

function PerceptionNav({ page, auditory, overall = false }: { page: "trial" | "results"; auditory: boolean; overall?: boolean }) {
  return <nav className="perception-nav" aria-label={page === "trial" ? "Challenge categories" : "Result categories"}>
    {page === "results" && <a href="#results/overall" aria-current={overall ? "page" : undefined}>Overall</a>}
    <a href={`#${page}/visual`} aria-current={!overall && !auditory ? "page" : undefined}>Visual</a>
    <a href={`#${page}/auditory`} aria-current={!overall && auditory ? "page" : undefined}>Auditory</a>
  </nav>;
}

function ChallengePicker({ model, auditory }: { model: ModelStatus; auditory: boolean }) {
  return (
    <section className="challenge-picker">
      <h1>Choose a challenge</h1>
      <PerceptionNav page="trial" auditory={auditory} />
      {auditory ? <div className="challenge-options">
        <a className="challenge-card" href="#trial/speech">
          <div className="challenge-copy">
            <h2>Speech in Noise</h2>
            <p>Pick out words masked by background noise.</p>
            <span className="challenge-action">16 clips · vs. Whisper <span aria-hidden="true">→</span></span>
          </div>
        </a>
        <a className="challenge-card" href="#trial/tones">
          <div className="challenge-copy">
            <h2>Pitch and Loudness</h2>
            <p>Tell which tone is higher in pitch or sounds louder.</p>
            <span className="challenge-action">16 pairs · vs. signal estimator <span aria-hidden="true">→</span></span>
          </div>
        </a>
        <a className="challenge-card" href="#trial/timbre">
          <div className="challenge-copy">
            <h2>Same Pitch, Different Timbre</h2>
            <p>Hear the tone color change and decide whether the note changed too.</p>
            <span className="challenge-action">16 pairs · vs. signal estimator <span aria-hidden="true">→</span></span>
          </div>
        </a>
        <a className="challenge-card" href="#trial/fundamental">
          <div className="challenge-copy">
            <h2>Missing Fundamental</h2>
            <p>Match a pitch when its fundamental frequency is absent.</p>
            <span className="challenge-action">16 trials · vs. signal estimator <span aria-hidden="true">→</span></span>
          </div>
        </a>
      </div> : <div className="challenge-options">
        {recognitionTopics.map((topic) => {
          const { title, description } = topics[topic];
          const resumable = Boolean(sessionStorage.getItem(activeKeys[topic]));
          const ready = topicReady(model, topic);
          return (
            <a className="challenge-card" href={`#trial/${topic}`} key={topic}>
              <div className={`challenge-picture ${topic}`} aria-hidden="true">
                {topic === "lighting" ? <div className="desk-preview"><img src={lightingPreview} alt="" /></div>
                  : <Stimulus imageUrl={previewTrial.imageUrl} preview={topic === "occlusion"} />}
              </div>
              <div className="challenge-copy">
                <h2>{title}</h2>
                <p>{description}</p>
                <span className="challenge-action">{resumable ? "Resume challenge" : ready ? "16 trials" : "View challenge"} <span aria-hidden="true">→</span></span>
              </div>
            </a>
          );
        })}
        <a className="challenge-card" href="#trial/change-blindness">
          <div className="challenge-picture desk-preview" aria-hidden="true"><img src="./change-practice-a.webp" alt="" /></div>
          <div className="challenge-copy">
            <h2>Change blindness</h2>
            <p>Spot what changes when a scene disappears briefly.</p>
            <span className="challenge-action">Flicker exercise and comparison round <span aria-hidden="true">→</span></span>
          </div>
        </a>
        <a className="challenge-card" href="#trial/depth">
          <div className="challenge-picture desk-preview" aria-hidden="true"><img src={depthPreview} alt="" /></div>
          <div className="challenge-copy">
            <h2>Depth</h2>
            <p>Use clues in flat photographs to judge what’s nearer.</p>
            <span className="challenge-action">12-photo hard round · vs. Depth Anything <span aria-hidden="true">→</span></span>
          </div>
        </a>
        <a className="challenge-card" href="#trial/gestalt">
          <div className="challenge-picture desk-preview" aria-hidden="true"><img src={gestaltPreview} alt="" /></div>
          <div className="challenge-copy">
            <h2>Gestalt</h2>
            <p>See how marks, outlines, and shapes group into a whole.</p>
            <span className="challenge-action">21 diagrams · vs. CLIP <span aria-hidden="true">→</span></span>
          </div>
        </a>
        <a className="challenge-card" href="#trial/color">
          <div className="challenge-picture desk-preview" aria-hidden="true"><img src={colorPreview} alt="" /></div>
          <div className="challenge-copy">
            <h2>Color</h2>
            <p>Match subtle colors across different backgrounds.</p>
            <span className="challenge-action">16 diagrams · vs. CLIP <span aria-hidden="true">→</span></span>
          </div>
        </a>
        <a className="challenge-card" href="#trial/illusions">
          <div className="challenge-picture desk-preview" aria-hidden="true"><img src={illusionPreview} alt="" /></div>
          <div className="challenge-copy">
            <h2>Visual Illusions</h2>
            <p>Judge size, length, and curvature when the surrounding shapes can fool your eye.</p>
            <span className="challenge-action">20 diagrams · vs. CLIP <span aria-hidden="true">→</span></span>
          </div>
        </a>
      </div>}
    </section>
  );
}

function ChallengePage({ model, topic, onComplete }: {
  model: ModelStatus;
  topic: Topic;
  onComplete: (result: PilotResult | ExperimentResult) => void;
}) {
  const experimentKey = activeKeys[topic];
  const ready = topicReady(model, topic);
  const trialCount = topic === "change" ? 12 : 16;
  const pilotReady = topic === "occlusion" && model.pilotReady;
  const [session, setSession] = useState<ExperimentSession>();
  const [pilot, setPilot] = useState<PilotSession>();
  const [starting, setStarting] = useState(false);
  const [resumeId, setResumeId] = useState(() => sessionStorage.getItem(experimentKey));
  const [error, setError] = useState("");

  async function useSession(next: ExperimentSession) {
    if (next.trial) {
      setSession(next);
    } else {
      const result = await getExperimentResult(next.session_id);
      sessionStorage.removeItem(experimentKey);
      onComplete(result);
    }
  }

  async function open(mode: "experiment" | "pilot" | "resume") {
    setStarting(true);
    setError("");
    try {
      if (mode === "pilot") {
        setPilot(await startPilot());
      } else {
        const next = mode === "resume" && resumeId ? await getExperiment(resumeId) : await startExperiment(topic);
        sessionStorage.setItem(experimentKey, next.session_id);
        setResumeId(next.session_id);
        await useSession(next);
      }
    } catch (failure) {
      if (mode === "resume" && failure instanceof ApiError && failure.status === 404) {
        sessionStorage.removeItem(experimentKey);
        setResumeId(null);
      }
      setError(failure instanceof Error ? failure.message : "Could not open the challenge.");
    } finally {
      setStarting(false);
    }
  }

  if (session?.trial) return <Challenge key={session.trial.trial_id} scoredTrial={session.trial} onAnswer={async (answer) => {
    await useSession(await submitExperimentAnswer(session.session_id, answer));
  }} />;
  if (pilot) return <Challenge scoredTrial={pilot.trial} onAnswer={async (answer) => {
    onComplete(await submitPilotAnswer(pilot.session_id, answer));
  }} />;
  if (model.state === "loading") return <p className="inner" role="status">Checking model readiness…</p>;
  if (!ready && !pilotReady && !resumeId) return (
    <section className="inner">
      <a className="back-link" href="#trial">← All challenges</a>
      <h1>{topics[topic].title}</h1>
      <p className="lede">CLIP predictions for this challenge are unavailable.</p>
      <p className="note">Run <code>python -m {topic === "change" ? "backend.change_pairs" : `backend.prepare_experiment --topic ${topic}`}</code> and restart the API.</p>
      {topic === "occlusion" && <Challenge />}
    </section>
  );
  return (
    <section className="inner">
      <a className="back-link" href="#trial">← All challenges</a>
      <h1>{topics[topic].title}</h1>
      <p className="lede">{resumeId
        ? "Your submitted answers are saved. Continue from the next unanswered image."
        : ready
          ? topic === "change"
            ? "Watch 12 real-world scenes alternate with a brief blank. Click the object that changes. CLIP scores the corresponding crops from both frames. Results appear after the last answer."
            : `${topics[topic].question} Identify 16 objects and see your results after the last answer.`
          : "You and CLIP will classify the same masked image. Timing starts when the image loads."}</p>
      <div className="actions">
        {resumeId && <button className="button primary" type="button" disabled={starting} onClick={() => void open("resume")}>
          {starting ? "Opening…" : "Resume challenge"}
        </button>}
        {ready && <button className={resumeId ? "button secondary" : "button primary"} type="button" disabled={starting} onClick={() => void open("experiment")}>
          {resumeId ? "Start new challenge" : `Start ${trialCount}-trial challenge`}
        </button>}
        {pilotReady && !resumeId && <button className={ready ? "button secondary" : "button primary"} type="button" disabled={starting} onClick={() => void open("pilot")}>
          {ready ? "Try one-image pilot" : "Reveal pilot stimulus"}
        </button>}
      </div>
      {error && <p className="note trial-error" role="alert">{error}</p>}
    </section>
  );
}

function profileStorageKey(view: ResultView) {
  return `perception-arena-completed-v1-${view}`;
}

function App() {
  const [{ page, topic, pilotSelected, changeSelected, depthSelected, diagramTopic, speechSelected, toneTopic, auditorySelected, visualSelected, overallSelected }, setRoute] = useState(currentRoute);
  const [model, setModel] = useState<ModelStatus>({ name: "CLIP", state: "loading" });
  const [profiles, setProfiles] = useState<Partial<Record<ResultView, PilotResult | ExperimentResult>>>(() => {
    const saved: Partial<Record<ResultView, PilotResult | ExperimentResult>> = {};
    for (const view of [...topicIds, "pilot"] as const) {
      const profile = readResult<PilotResult | ExperimentResult>(profileStorageKey(view));
      if (profile) saved[view] = profile;
    }
    return saved;
  });
  const [profilesLoading, setProfilesLoading] = useState(() => ([...topicIds, "pilot"] as const).some((view) => !profiles[view] && sessionStorage.getItem(completedKeys[view])));
  const [profilesUnavailable, setProfilesUnavailable] = useState(0);
  const [depthResult, setDepthResult] = useState(readDepthResult);
  const [speechAnswers, setSpeechAnswers] = useState(() => readResult<SpeechAnswers>(speechResultsKey));
  const [toneAnswers, setToneAnswers] = useState<Partial<Record<ToneTopic, ToneAnswers>>>(() => ({
    tones: readResult<ToneAnswers>(toneResultsKeys.tones),
    timbre: readResult<ToneAnswers>(toneResultsKeys.timbre),
    fundamental: readResult<ToneAnswers>(toneResultsKeys.fundamental),
  }));
  const [diagramAnswers, setDiagramAnswers] = useState<Partial<Record<DiagramTopic, DiagramAnswers>>>(() => {
    const savedRounds: Partial<Record<DiagramTopic, DiagramAnswers>> = {};
    for (const id of diagramTopics) {
      const saved = readResult<DiagramAnswers>(diagramResultsKeys[id]);
      if (saved) savedRounds[id] = saved;
    }
    return savedRounds;
  });
  const [latest, setLatest] = useState<ResultView | "depth" | "speech" | ToneTopic | DiagramTopic>(() => {
    const saved = readResultValue(resultsKey);
    if (saved === "blur" || saved === "occlusion" || saved === "lighting" || saved === "change" || saved === "pilot" || saved === "depth" || saved === "speech" || isToneTopic(saved) || isDiagramTopic(saved)) return saved;
    return saved === "experiment" || !profiles.pilot && !sessionStorage.getItem(pilotKey) ? "occlusion" : "pilot";
  });
  const latestAuditory = latest === "speech" || isToneTopic(latest);
  const selectedView = toneTopic ?? (speechSelected ? "speech" : auditorySelected ? (latestAuditory ? latest : "speech")
    : diagramTopic ?? (depthSelected ? "depth" : pilotSelected ? "pilot" : topic ?? (visualSelected && latestAuditory ? "occlusion" : latest)));
  const auditoryResults = selectedView === "speech" || isToneTopic(selectedView);
  useEffect(() => {
    let active = true;
    getModelStatus().then(
      (status) => { if (active) setModel(status); },
      () => { if (active) setModel(previewModel); },
    );
    return () => { active = false; };
  }, [page]);

  useEffect(() => {
    const pending = [];
    for (const view of [...topicIds, "pilot"] as const) {
      const id = sessionStorage.getItem(completedKeys[view]);
      if (!id || profiles[view]) continue;
      const request = view === "pilot" ? getPilotResult(id) : getExperimentResult(id);
      pending.push(request.then((saved) => {
        if (readResult<PilotResult | ExperimentResult>(profileStorageKey(view))) return;
        saveResult(profileStorageKey(view), saved);
        setProfiles((current) => current[view] ? current : { ...current, [view]: saved });
      }));
    }
    Promise.allSettled(pending).then((results) => {
      setProfilesUnavailable(results.filter((result) => result.status === "rejected").length);
      setProfilesLoading(false);
    });
  }, []);

  function completeSession(completed: PilotResult | ExperimentResult) {
    const view = "trials" in completed ? completed.condition : "pilot";
    saveResult(profileStorageKey(view), completed);
    saveResultValue(resultsKey, view);
    setLatest(view);
    setProfiles((current) => ({ ...current, [view]: completed }));
    location.hash = `results/${view}`;
  }

  function completeDepth(result: DepthResult) {
    const saved: SavedDepth = { rounds: { hard: result } };
    saveResult(depthResultsKey, saved);
    saveResultValue(resultsKey, "depth");
    setDepthResult(result);
    setLatest("depth");
  }

  function completeDiagram(id: DiagramTopic, answers: DiagramAnswers) {
    saveResult(diagramResultsKeys[id], answers);
    saveResultValue(resultsKey, id);
    setDiagramAnswers((current) => ({ ...current, [id]: answers }));
    setLatest(id);
    location.hash = `results/${id}`;
  }

  function completeSpeech(answers: SpeechAnswers) {
    saveResult(speechResultsKey, answers);
    saveResultValue(resultsKey, "speech");
    setSpeechAnswers(answers);
    setLatest("speech");
    location.hash = "results/speech";
  }

  function completeTones(id: ToneTopic, answers: ToneAnswers) {
    saveResult(toneResultsKeys[id], answers);
    saveResultValue(resultsKey, id);
    setToneAnswers((current) => ({ ...current, [id]: answers }));
    setLatest(id);
    location.hash = `results/${id}`;
  }

  useEffect(() => {
    function navigate() {
      setRoute(currentRoute());
      document.getElementById("main")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main" onClick={(event) => {
        event.preventDefault();
        document.getElementById("main")?.focus();
      }}>Skip to content</a>
      <header className="site-header">
        <div className="header-content">
          <a href="#overview" className="brand"><span className="brand-mark" aria-hidden="true" />Perception Arena</a>
          <nav aria-label="Main navigation">
            {pages.map(({ id, title }) => <a key={id} href={"#" + id} aria-current={page === id ? "page" : undefined}>{title}</a>)}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {page === "overview" && <Overview />}
        {page === "trial" && (toneTopic ? <Suspense fallback={<p className="note" role="status">Loading tones…</p>}>
          <ToneChallenge key={toneTopic} topic={toneTopic} onComplete={(answers) => completeTones(toneTopic, answers)} />
        </Suspense>
          : speechSelected ? <SpeechChallenge onComplete={completeSpeech} />
          : diagramTopic ? <DiagramChallenge key={diagramTopic} topic={diagramTopic} onComplete={(answers) => completeDiagram(diagramTopic, answers)} />
          : changeSelected ? <ChangeBlindness /> : depthSelected ? <DepthChallenge onComplete={completeDepth} /> : topic
          ? <ChallengePage key={topic} topic={topic} model={model} onComplete={completeSession} />
          : <ChallengePicker model={model} auditory={auditorySelected} />)}
        {page === "results" && <>
          <PerceptionNav page="results" auditory={auditoryResults} overall={overallSelected} />
          {!overallSelected && (auditoryResults ? <nav className="result-tabs" aria-label="Auditory results by topic">
            <a href="#results/speech" aria-current={selectedView === "speech" ? "page" : undefined}>Speech in Noise</a>
            {toneTopics.map((id) => <a key={id} href={`#results/${id}`} aria-current={selectedView === id ? "page" : undefined}>{toneLabels[id]}</a>)}
          </nav> : <nav className="result-tabs" aria-label="Visual results by topic">
            {topicIds.map((id) => <a href={`#results/${id}`} aria-current={selectedView === id ? "page" : undefined} key={id}>{topics[id].title}</a>)}
            <a href="#results/depth" aria-current={selectedView === "depth" ? "page" : undefined}>Depth</a>
            {diagramTopics.map((id) => <a href={`#results/${id}`} aria-current={selectedView === id ? "page" : undefined} key={id}>{diagramLabels[id]}</a>)}
            {profiles.pilot && <a href="#results/pilot" aria-current={selectedView === "pilot" ? "page" : undefined}>Pilot</a>}
          </nav>)}
          {overallSelected ? <Suspense fallback={<p className="note" role="status">Loading overall results…</p>}>
            <OverallResults profiles={profiles} profilesLoading={profilesLoading} profilesUnavailable={profilesUnavailable} depthResult={depthResult}
              diagramAnswers={diagramAnswers} speechAnswers={speechAnswers} toneAnswers={toneAnswers} />
          </Suspense> : isToneTopic(selectedView) ? <Suspense fallback={<p className="note" role="status">Loading results…</p>}>
            <ToneResults topic={selectedView} answers={toneAnswers[selectedView]} />
          </Suspense>
            : selectedView === "speech" ? <SpeechResults answers={speechAnswers} />
            : selectedView === "depth" ? <DepthResults result={depthResult} />
            : isDiagramTopic(selectedView) ? <DiagramResults key={selectedView} topic={selectedView} answers={diagramAnswers[selectedView]} />
            : <Results result={profiles[selectedView]} topic={selectedView === "pilot" ? "occlusion" : selectedView} />}
        </>}
      </main>
      <footer><span>Sensation &amp; Perception · Course project</span><a href="./about-data.html">Data &amp; credits</a></footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
