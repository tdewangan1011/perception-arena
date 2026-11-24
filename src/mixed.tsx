import { useEffect, useRef, useState } from "react";
import { AccuracyChart } from "./accuracy-chart";
import { AnswerComparison } from "./answer-comparison";
import { FlickerImages, PairReview, regionLabels } from "./pair-images";
import { readResult, readResultValue, removeResult, saveDownload, saveResult, saveResultValue } from "./result-storage";

export const mixedResultKey = "perception-arena-mixed-v1-result";
const activeKey = "perception-arena-mixed-active";
const recentKey = "perception-arena-mixed-recent";
const titles: Record<string, string> = {
  occlusion: "Occlusion", blur: "Blur", lighting: "Lighting", change: "Change Detection",
  depth: "Depth", gestalt: "Gestalt", color: "Color", illusions: "Visual Illusions",
};

type Trial = {
  trial_id: string;
  topic: string;
  tier: number | null;
  prompt: string;
  choices: string[];
  imageUrl: string;
  comparisonUrl?: string;
  points?: Record<string, number[]>;
  position: number;
  total: number;
};
type Session = { session_id: string; trial: Trial | null };
type ReviewedTrial = Trial & {
  id: string; source_id: string; condition: string; answer: string; human_choice: string;
  model_choice: string | null; model_id: string; human_correct: boolean; model_correct: boolean;
  explanation?: string; weight: number;
  source?: { title: string; artist: string; source_url: string; license: string; license_url?: string };
};
export type MixedResult = {
  session_id: string; version: string; created_at: string; total: number; composite_score: number;
  human_correct: number; model_correct: number; source_ids: string[]; trials: ReviewedTrial[];
  groups: { topic: string; total: number; human_correct: number; model_correct: number;
    comparison_score: number; highest_tier: number | null }[];
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch("/api/mixed" + path, options);
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(typeof detail?.detail === "string" ? detail.detail : "The mixed challenge could not load.");
  }
  return response.json() as Promise<T>;
}

function MixedImage({ trial, selected, onSelect, ready, onReady }: {
  trial: Trial;
  selected?: string;
  onSelect: (choice: string) => void;
  ready: boolean;
  onReady: () => void;
}) {
  const loaded = useRef(new Set<number>());
  const [startedAt, setStartedAt] = useState<number>();
  const [failed, setFailed] = useState(false);

  function markLoaded(frame: number) {
    loaded.current.add(frame);
    if (!trial.comparisonUrl || loaded.current.size === 2) {
      if (trial.comparisonUrl && startedAt === undefined) setStartedAt(performance.now());
      onReady();
    }
  }
  return <div>
    {trial.comparisonUrl ? <FlickerImages first={trial.imageUrl} second={trial.comparisonUrl}
      startedAt={startedAt} onLoad={markLoaded} onError={() => setFailed(true)}
      onSelect={onSelect} selection={selected} disabled={!ready} /> : <div className="depth-frame mixed-image">
        <img src={trial.imageUrl} alt={trial.topic === "depth" ? "Scene with two marked targets" : "Visual challenge image"}
          onLoad={() => markLoaded(0)} onError={() => setFailed(true)} />
        {trial.points && Object.entries(trial.points).map(([choice, [x, y]]) => <button type="button"
          key={choice} className="depth-marker" style={{ left: `${x}%`, top: `${y}%` }}
          data-label={choice} aria-label={`Select target ${choice}`} aria-pressed={selected === choice}
          onClick={() => onSelect(choice)} disabled={!ready}><span>{choice}</span></button>)}
      </div>}
    {failed && <p role="alert">The image could not load. Reload to resume this trial.</p>}
  </div>;
}

function MixedQuestion({ session, onAnswer }: { session: Session; onAnswer: (choice: string, elapsed: number) => Promise<void> }) {
  const trial = session.trial!;
  const [selection, setSelection] = useState<string>();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const elapsed = useRef<number | undefined>(undefined);
  const pending = useRef<{ choice: string; elapsed: number } | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, []);
  async function submit() {
    if (!selection || !ready || busy) return;
    pending.current ??= { choice: selection, elapsed: Math.round(performance.now() - (elapsed.current ?? performance.now())) };
    setBusy(true);
    setError("");
    try {
      await onAnswer(pending.current.choice, pending.current.elapsed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your answer.");
      setBusy(false);
    }
  }

  return <section className="trial-page mixed-page">
    <a className="back-link" href="#trial/visual">← Visual challenges</a>
    <div className="trial-heading"><p className="eyebrow">{titles[trial.topic]}</p>
      <span>Trial {trial.position} of {trial.total}</span></div>
    <progress value={trial.position} max={trial.total} aria-label="Mixed challenge progress" />
    <div className="mixed-layout">
      <MixedImage trial={trial} ready={ready} selected={selection}
        onSelect={(choice) => { if (!busy && !pending.current) setSelection(choice); }}
        onReady={() => { if (!elapsed.current) elapsed.current = performance.now(); setReady(true); }} />
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p className="note">{trial.tier === null ? "Fixed comparison trial" : `Adaptive difficulty ${trial.tier + 1} of 5`}</p>
        <h1 ref={heading} tabIndex={-1}>{trial.prompt}</h1>
        {trial.topic === "change" && <p className="note">Click the region that changes between the alternating images.</p>}
        <fieldset className="diagram-choices" aria-label="Answer choices" disabled={!ready || busy || !!pending.current}>
          {trial.choices.map((choice) => <label key={choice}>
            <input type="radio" name="mixed-answer" checked={selection === choice} onChange={() => setSelection(choice)} />
            {choice}
          </label>)}
        </fieldset>
        <button type="submit" className="button primary" disabled={!ready || !selection || busy}>
          {busy ? "Saving…" : pending.current ? "Retry saving" : trial.position === trial.total ? "See results" : "Submit answer"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </div>
  </section>;
}

export function MixedChallenge({ onComplete }: { onComplete: (result: MixedResult) => void }) {
  const [session, setSession] = useState<Session>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resumeId, setResumeId] = useState(() => readResultValue(activeKey));

  async function apply(next: Session) {
    saveResultValue(activeKey, next.session_id);
    setResumeId(next.session_id);
    if (next.trial) {
      setSession(next);
      return;
    }
    const result = await request<MixedResult>(`/sessions/${next.session_id}/results`);
    const recent = readResult<string[]>(recentKey) ?? [];
    saveResult(recentKey, [...new Set([...result.source_ids, ...recent])].slice(0, 256));
    removeResult(activeKey);
    onComplete(result);
  }

  async function open(resume: boolean) {
    setError("");
    setBusy(true);
    try {
      const next = resume && resumeId ? await request<Session>(`/sessions/${resumeId}`)
        : await request<Session>("/sessions", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recent_sources: readResult<string[]>(recentKey) ?? [] }) });
      await apply(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The round could not start.");
    } finally {
      setBusy(false);
    }
  }

  if (session?.trial) return <MixedQuestion key={session.trial.trial_id} session={session} onAnswer={async (choice, elapsed) => {
    await apply(await request<Session>(`/sessions/${session.session_id}/responses`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trial_id: session.trial!.trial_id, human_choice: choice, human_response_ms: elapsed }),
    }));
  }} />;

  return <section className="results">
    <a className="back-link" href="#trial/visual">← Visual challenges</a>
    <h1>Mixed Visual Challenge</h1>
    <p className="lede">Answer 32 questions across eight visual topics. Occlusion, blur, lighting, and color adjust in difficulty as you play. The other four topics use fixed questions.</p>
    <ul className="mixed-rules">
      <li>Each topic appears four times. Every source image or question appears once within the round.</li>
      <li>Adaptive topics start at difficulty 2 of 5. A correct answer moves up one level; a miss moves down one.</li>
      <li>You and the comparison models answer the same selected trials. Answers and scores appear after the last trial.</li>
    </ul>
    <div className="actions">
      {resumeId && <button className="button primary" disabled={busy} onClick={() => void open(true)}>Resume mixed challenge</button>}
      <button className={resumeId ? "button secondary" : "button primary"} disabled={busy} onClick={() => void open(false)}>
        {busy ? "Loading…" : resumeId ? "Start a new round" : "Start mixed challenge"}
      </button>
    </div>
    {error && <p role="alert" className="trial-error">{error}</p>}
  </section>;
}

export function MixedResults({ result }: { result?: MixedResult }) {
  if (!result) return <section className="results">
    <h1>Mixed Visual Results</h1><p>Complete a mixed round to see your comparison score.</p>
    <a className="button primary" href="#trial/mixed">Open mixed challenge</a>
  </section>;
  const both = result.trials.filter((trial) => trial.human_correct && trial.model_correct).length;
  return <section className="results">
    <div className="result-heading"><h1>Mixed Visual Results</h1>
      <button className="button secondary" onClick={() => saveDownload("perception-mixed-" + result.session_id + ".json", result)}>Export round</button></div>
    <div className="scores overall-scores">
      <article><h2>Comparison score</h2><strong>{result.composite_score}<small> / 100</small></strong><p>50 is a tie · Higher favors you</p></article>
      <article><h2 className="human">You</h2><strong>{result.human_correct}/{result.total}</strong><p>Correct trials</p></article>
      <article><h2 className="machine">Comparison models</h2><strong>{result.model_correct}/{result.total}</strong><p>Correct on the same trials</p></article>
    </div>
    <div className="results-grid diagram-results-grid">
      <section className="panel diagram-accuracy"><h2>Accuracy by topic</h2>
        <AccuracyChart scale="Visual topic" modelLabel="AI" groups={result.groups.map((group) => ({
          label: titles[group.topic], total: group.total, humanCorrect: group.human_correct, modelCorrect: group.model_correct,
        }))} /></section>
      <AnswerComparison outcomes={{ both_correct: both, human_only_correct: result.human_correct-both,
        ai_only_correct: result.model_correct-both, both_wrong: result.total-result.human_correct-result.model_correct+both }} />
    </div>
    <section className="panel mixed-score-details">
      <h2>How your comparison score works</h2>
      <p>Each topic gets equal weight. Within an adaptive topic, a trial at difficulty 1 has weight 1, up to weight 5 at difficulty 5. Fixed trials have weight 1. A topic score is 50 plus half the difference between your weighted accuracy and the model’s weighted accuracy in percentage points. The composite averages the eight topic scores.</p>
      <p>This is a game score for the trials you played. Difficulty levels describe the image transformations and color differences used here. The levels across topics have not been calibrated against a population.</p>
      <table className="diagram-table"><thead><tr><th scope="col">Topic</th><th scope="col">Highest level played</th><th scope="col">Comparison score</th></tr></thead>
        <tbody>{result.groups.map((group) => <tr key={group.topic}><th scope="row">{titles[group.topic]}</th>
          <td>{group.highest_tier === null ? "Fixed trials" : `${group.highest_tier+1} / 5`}</td><td>{group.comparison_score}</td></tr>)}</tbody>
      </table>
    </section>
    <section className="panel depth-review"><h2>Review your round</h2>
      <ul className="depth-summary" role="list">{[...result.trials].sort((a,b) => Number(b.human_choice!==b.model_choice)-Number(a.human_choice!==a.model_choice)).map((trial) =>
        <li key={trial.trial_id} className={trial.human_choice!==trial.model_choice ? "depth-disagreement" : undefined}>
          {trial.comparisonUrl ? <PairReview first={trial.imageUrl} second={trial.comparisonUrl} answer={regionLabels.indexOf(trial.answer)} />
            : <div className="depth-frame"><img src={trial.imageUrl} loading="lazy" alt={trial.topic === "depth" ? "Depth scene with target markers" : "Completed challenge image"} />
              {trial.points && Object.entries(trial.points).map(([choice,[x,y]]) => <span className="depth-marker depth-review-marker" data-label={choice}
                data-emphasis={choice===trial.answer ? "correct" : undefined} key={choice} style={{left:`${x}%`,top:`${y}%`}}><span>{choice}</span></span>)}
            </div>}
          <div className="depth-card-heading"><h3>{titles[trial.topic]}</h3>
            {trial.human_choice!==trial.model_choice && <span>Different answers</span>}</div>
          <p className="note">{trial.tier===null ? "Fixed trial" : `Level ${trial.tier+1}`} · {trial.condition}</p>
          <dl className="diagram-review-answers"><div><dt>You</dt><dd>{trial.human_choice}</dd></div>
            <div><dt>Model</dt><dd>{trial.model_choice ?? "Tied"}</dd></div><div><dt>Reference</dt><dd>{trial.answer}</dd></div></dl>
          {trial.explanation && <p>{trial.explanation}</p>}
          {trial.source && <p className="note">Photo by {trial.source.artist}. <a href={trial.source.source_url}>{trial.source.license} · Original</a></p>}
        </li>
      )}</ul>
    </section>
    <a className="button primary" href="#trial/mixed">Try another round</a>
  </section>;
}
