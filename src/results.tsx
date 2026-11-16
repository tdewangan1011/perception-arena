import type { ExperimentResult, ExperimentTrial, LevelResult, PilotResult, Topic } from "./pilot";
import { AccuracyChart } from "./accuracy-chart";
import { AnswerComparison } from "./answer-comparison";
import { topics } from "./topics";
import { PairReview, regionLabels } from "./pair-images";

const changeLevels = ["No change", "Small", "Medium", "Large"];
const objectChangeLevels = ["No change", "Subtle", "Moderate", "Pronounced"];

function exposureLabel(level: number) {
  return `${level > 0 ? "+" : ""}${level} EV`;
}

function LevelAccuracyChart({ levels, topic, objectChanges }: { levels: LevelResult[]; topic: Topic; objectChanges: boolean }) {
  const { unit, scale } = topics[topic];
  return <AccuracyChart scale={objectChanges ? "Change difficulty" : scale} groups={levels.map((level) => ({
    label: topic === "change" ? (objectChanges ? objectChangeLevels : changeLevels)[level.level]
      : topic === "lighting" ? exposureLabel(level.level) : `${level.level}${unit}`,
    total: level.total,
    humanCorrect: level.human_correct,
    modelCorrect: level.model_correct,
  }))} />;
}

function TrialReveal({ trial, topic }: { trial: ExperimentTrial | PilotResult; topic: Topic }) {
  const source = "source" in trial ? trial.source : undefined;
  const level = "level" in trial ? trial.level : Math.round(trial.difficulty * 100);
  const comparison = "comparisonUrl" in trial ? trial.comparisonUrl : undefined;
  const changedRegion = regionLabels.indexOf(trial.ground_truth);
  const scene = "scene_title" in trial ? trial.scene_title : undefined;
  const description = "change_description" in trial ? trial.change_description : undefined;
  return (
    <article className="reveal-card">
      {comparison ? <>
        {scene && <h3>{scene}</h3>}
        <PairReview first={trial.imageUrl} second={comparison} answer={changedRegion} />
        <p className="note">{(scene ? objectChangeLevels : changeLevels)[level]}{level > 0 && "edit_radius_px" in trial ? ` · ${trial.edit_radius_px} px edit radius` : ""}</p>
        {description && <p>{description}</p>}
      </> : <figure>
        <img src={trial.imageUrl} alt={`Stimulus showing ${trial.ground_truth.toLowerCase()}`} loading="lazy" />
        <figcaption>{topic === "lighting" ? `${exposureLabel(level)} relative to reference`
          : topic === "blur" ? `${level} px Gaussian blur radius` : `${level}% of image area masked`}</figcaption>
      </figure>}
      <dl>
        <div><dt>{comparison ? "Correct answer" : "Correct label"}</dt><dd>{trial.ground_truth}</dd></div>
        <div><dt>Your answer</dt><dd>{trial.human_choice}</dd></div>
        <div><dt>Model answer</dt><dd>{trial.model_choice}</dd></div>
        <div><dt>Response time</dt><dd>{(trial.human_response_ms / 1000).toFixed(2)} s</dd></div>
      </dl>
      {source && <p className="note">
        <a href={source.source_url}>{source.title}</a> by {source.artist}. {comparison
          ? scene ? "Cropped, with one object’s appearance edited." : level ? "Cropped and locally tinted." : "Cropped."
          : `Resized and padded${level ? `, then ${topics[topic].altered}` : ""}.`}{" "}
        {source.license_url ? <a href={source.license_url}>{source.license}</a> : source.license}.
      </p>}
    </article>
  );
}

export function Results({ result, topic }: { result?: PilotResult | ExperimentResult; topic: Topic }) {
  const experiment = result && "trials" in result ? result : undefined;
  const pilot = result && !("trials" in result) ? result : undefined;
  const { title } = topics[topic];
  const total = experiment?.total ?? 1;
  const objectChanges = topic === "change" && experiment?.design_version !== "change-pairs-v1";
  const disagreements = experiment?.trials.filter((trial) => trial.human_choice !== trial.model_choice) ?? [];
  const controls = topic === "change" ? experiment?.by_level.find((level) => level.level === 0) : undefined;
  const outcomes = experiment?.outcomes ?? (pilot ? {
    both_correct: Number(pilot.outcome === "both_correct"),
    human_only_correct: Number(pilot.outcome === "human_only_correct"),
    ai_only_correct: Number(pilot.outcome === "ai_only_correct"),
    both_wrong: Number(pilot.outcome === "both_wrong"),
  } : undefined);
  const exportHref = result && `/api/${experiment ? "experiment/" : ""}sessions/${result.session_id}/export`;
  return (
    <section className="results">
      <div className="result-heading">
        {pilot ? <div><p className="eyebrow">Pilot results</p><h1>Perception profile</h1></div>
          : <h1>{topic === "change" ? "Change Detection" : title} Results</h1>}
        {exportHref
          ? <a className="button secondary" href={exportHref} download>Export session</a>
          : <button className="button secondary" disabled>Export session</button>}
      </div>
      {pilot && <p className="lede">One participant, one image, one CLIP prediction. This pilot checks the trial workflow.</p>}
      <div className="scores">
        <article><h2 className="human">You</h2><strong>{result ? `${Number(result.human_correct)}/${total}` : "—"}</strong><p>Correct trials</p></article>
        <article><h2 className="machine">AI model</h2><strong>{result ? `${Number(result.model_correct)}/${total}` : "—"}</strong><p>Correct trials</p></article>
      </div>
      <div className="results-grid">
        <article className="panel">
          <h2>Accuracy by {topic === "change" ? objectChanges ? "difficulty" : "change size" : topic === "lighting" ? "exposure" : title.toLowerCase()}</h2>
          {experiment ? <LevelAccuracyChart levels={experiment.by_level} topic={topic} objectChanges={objectChanges} />
            : pilot ? <p>{Math.round(pilot.difficulty * 100)}% of image area masked · 1 trial</p>
              : <p>Awaiting session data</p>}
        </article>
        <AnswerComparison outcomes={outcomes}>
          {controls && <p>False alarms on identical pairs · You {controls.total - controls.human_correct}/{controls.total}, CLIP {controls.total - controls.model_correct}/{controls.total}</p>}
        </AnswerComparison>
      </div>
      <section className="panel disagreements">
        <h2>{pilot ? "Pilot trial" : "Where answers differ"}</h2>
        {experiment && (disagreements.length
          ? <div className={`disagreement-gallery${topic === "change" ? " pair-gallery" : ""}`}>{disagreements.map((trial) => <TrialReveal key={trial.trial_id} trial={trial} topic={topic} />)}</div>
          : <p>You and CLIP chose the same label on every trial.</p>)}
        {pilot && <div className="disagreement-gallery"><TrialReveal trial={pilot} topic="occlusion" /></div>}
        {!result && <p>Disagreement examples will appear here after the session.</p>}
      </section>
      <details className="panel">
        <summary>What these results can tell us</summary>
        <p>Each level has only a few images. The results describe this participant, this model, and these images. Scene context, label wording, display conditions, and model preprocessing can affect performance.</p>
        {topic === "blur" && <p>Blur radius refers to the 600 × 600 source canvas. This challenge uses different photos from Occlusion, so comparing scores across topics also reflects the photo sets.</p>}
        {topic === "lighting" && <p>0 EV is the reference. The other levels scale the light values of the whole image and clip highlights when needed. Display brightness and room light affect what you can see.{experiment?.design_version === "lighting-v1" && " This earlier session used the Occlusion photo set."}</p>}
        {topic === "change" && <>
          <p>CLIP compares corresponding crops using embedding distances. In the flicker challenge, you see one full image at a time with a blank between views. CLIP receives both frames without an interruption.{controls && " The control pairs are identical."}</p>
          {objectChanges && <p>Difficulty levels describe the intended prominence of the edits. Object size, contrast, and position can all influence how soon you notice a change.</p>}
          {experiment?.trials.some((trial) => !trial.flicker_timing) && <p>This session includes responses from the earlier side-by-side version. The export records timing for responses made with flicker.</p>}
        </>}
        {result && <p>Model revision <code>{result.model_id}@{result.model_revision}</code>.</p>}
        {pilot && <p>Pilot photo by Javier Carro. Cropped, resized, and masked under CC BY-SA 4.0. <a href="https://commons.wikimedia.org/wiki/File:Sporting_bicycle_side_view.JPG">Original photo and license</a></p>}
      </details>
    </section>
  );
}
