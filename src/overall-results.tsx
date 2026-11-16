import { useEffect, useState } from "react";
import { AccuracyChart } from "./accuracy-chart";
import { AnswerComparison } from "./answer-comparison";
import type { DepthResult } from "./depth";
import type { DiagramAnswers, DiagramTopic } from "./diagram-challenge";
import type { ExperimentResult, PilotResult, Topic } from "./pilot";
import type { SpeechAnswers } from "./speech";
import { normalizedWord } from "./speech-scoring";
import type { ToneAnswers, ToneTopic } from "./tone-topics";
import depthScenes from "../assets/depth-scenes.json";
import gestaltScenes from "../assets/gestalt/scenes.json";
import colorScenes from "../assets/color/scenes.json";
import illusionScenes from "../assets/illusions/scenes.json";
import speechScenes from "../assets/speech/scenes.json";
import toneScenes from "../assets/tones/scenes.json";
import timbreScenes from "../assets/timbre/scenes.json";
import fundamentalScenes from "../assets/fundamental/scenes.json";

const diagramRounds = {
  gestalt: { label: "Gestalt", scenes: gestaltScenes },
  color: { label: "Color", scenes: colorScenes },
  illusions: { label: "Visual Illusions", scenes: illusionScenes },
};
const toneRounds = {
  tones: { label: "Pitch and Loudness", scenes: toneScenes },
  timbre: { label: "Same Pitch, Different Timbre", scenes: timbreScenes },
  fundamental: { label: "Missing Fundamental", scenes: fundamentalScenes },
};
const experiments = { occlusion: "Occlusion", blur: "Blur", lighting: "Lighting", change: "Change Detection" };
type RemoteTopic = DiagramTopic | "speech";
type Round = {
  id: string;
  label: string;
  model: string;
  auditory?: boolean;
  pilot?: boolean;
  trials: { human: boolean; model?: boolean }[];
};
type SummaryProps = {
  profiles: Partial<Record<Topic | "pilot", PilotResult | ExperimentResult>>;
  profilesLoading: boolean;
  profilesUnavailable: number;
  depthResult?: DepthResult;
  diagramAnswers: Partial<Record<DiagramTopic, DiagramAnswers>>;
  speechAnswers?: SpeechAnswers;
  toneAnswers: Partial<Record<ToneTopic, ToneAnswers>>;
};

function roundStats(round: Round) {
  const paired = round.trials.filter(({ model }) => model !== undefined);
  const pairedHuman = paired.filter(({ human }) => human).length;
  const pairedModel = paired.filter(({ model }) => model).length;
  return {
    ...round,
    total: round.trials.length,
    humanCorrect: round.trials.filter(({ human }) => human).length,
    modelCorrect: paired.length ? pairedModel : undefined,
    modelTotal: paired.length,
    gap: paired.length ? (pairedHuman - pairedModel) / paired.length : undefined,
    href: `#results/${round.id}`,
  };
}

function percent(correct: number, total: number) {
  return Math.round(100 * correct / total);
}

export function OverallResults({
  profiles, profilesLoading, profilesUnavailable, depthResult, diagramAnswers, speechAnswers, toneAnswers,
}: SummaryProps) {
  const requested = [
    ...(Object.keys(diagramRounds) as DiagramTopic[]).filter((id) => diagramAnswers[id]),
    ...(speechAnswers ? ["speech" as const] : []),
  ].join(",");
  const [remote, setRemote] = useState<Partial<Record<RemoteTopic, Record<string, unknown> | null>>>({});
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    for (const id of requested.split(",") as RemoteTopic[]) {
      fetch(`/api/${id}/predictions`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) })
        .then(async (response) => {
          if (!response.ok) throw new Error("Comparison unavailable");
          const data = await response.json() as Record<string, unknown>;
          if (!controller.signal.aborted) setRemote((current) => ({ ...current, [id]: data }));
        })
        .catch(() => {
          if (!controller.signal.aborted) setRemote((current) => ({ ...current, [id]: null }));
        });
    }
    return () => controller.abort();
  }, [requested]);

  const rounds: Round[] = [];
  for (const id of Object.keys(experiments) as Topic[]) {
    const profile = profiles[id];
    if (profile && "trials" in profile) {
      rounds.push({ id, label: experiments[id], model: "CLIP", trials: profile.trials.map((trial) => ({
        human: trial.human_correct, model: trial.model_correct,
      })) });
    }
  }
  if (depthResult) {
    rounds.push({ id: "depth", label: "Depth", model: "Depth Anything", trials: depthScenes.flatMap((scene, index) => {
      const answer = depthResult.answers[index];
      if (answer !== "A" && answer !== "B") return [];
      const model = depthResult.predictions[scene.id];
      return [{ human: answer === scene.answer, model: typeof model === "object" ? model.model_choice === scene.answer : undefined }];
    }) });
  }
  for (const id of Object.keys(diagramRounds) as DiagramTopic[]) {
    const answers = diagramAnswers[id];
    if (!answers) continue;
    const { label, scenes } = diagramRounds[id];
    rounds.push({ id, label, model: "CLIP", trials: scenes.flatMap((scene) => {
      const answer = answers[scene.id];
      if (answer !== 0 && answer !== 1) return [];
      const model = remote[id]?.[scene.id];
      return [{ human: answer === scene.answer, model: model === 0 || model === 1 ? model === scene.answer : undefined }];
    }) });
  }
  const pilot = profiles.pilot;
  if (pilot && !("trials" in pilot)) {
    rounds.push({ id: "pilot", label: "Occlusion pilot", model: "CLIP", pilot: true,
      trials: [{ human: pilot.human_correct, model: pilot.model_correct }] });
  }
  if (speechAnswers) {
    rounds.push({ id: "speech", label: "Speech in Noise", model: "Whisper", auditory: true, trials: speechScenes.trials.flatMap((scene) => {
      const answer = speechAnswers[scene.id];
      if (!speechScenes.choices.includes(answer)) return [];
      const transcript = remote.speech?.[scene.id];
      return [{ human: answer === scene.answer, model: typeof transcript === "string" ? normalizedWord(transcript) === scene.answer : undefined }];
    }) });
  }
  for (const id of Object.keys(toneRounds) as ToneTopic[]) {
    const answers = toneAnswers[id];
    if (!answers) continue;
    const { label, scenes } = toneRounds[id];
    rounds.push({ id, label, model: "signal estimator", auditory: true, trials: scenes.flatMap((scene) => {
      const answer = answers[scene.id];
      if (answer !== "A" && answer !== "B") return [];
      return [{ human: answer === scene.answer, model: scene.estimateAnswer === scene.answer }];
    }) });
  }

  const stats = rounds.filter(({ trials }) => trials.length).map(roundStats);
  const visual = stats.filter(({ auditory }) => !auditory);
  const auditory = stats.filter((round) => round.auditory);
  const trials = stats.flatMap((round) => round.trials);
  const paired = trials.filter(({ model }) => model !== undefined);
  const humanTotal = trials.filter(({ human }) => human).length;
  const modelTotal = paired.filter(({ model }) => model).length;
  const bothCorrect = paired.filter(({ human, model }) => human && model).length;
  const humanOnly = paired.filter(({ human, model }) => human && !model).length;
  const outcomes = paired.length ? {
    both_correct: bothCorrect, human_only_correct: humanOnly,
    ai_only_correct: modelTotal - bothCorrect, both_wrong: paired.length - modelTotal - humanOnly,
  } : undefined;

  const scoredRounds = stats.filter(({ pilot }) => !pilot);
  const ranked = [...scoredRounds].sort((a, b) => b.humanCorrect / b.total - a.humanCorrect / a.total);
  const best = ranked[0];
  const bestTies = best ? ranked.filter((round) => round.humanCorrect * best.total === best.humanCorrect * round.total) : [];
  const fullComparisons = scoredRounds.filter((round) => round.modelTotal === round.total);
  const advantages = [...fullComparisons].sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0));
  const humanEdge = advantages.find((round) => (round.gap ?? 0) > 0);
  const modelEdge = advantages.at(-1);
  const loading = profilesLoading || (requested && requested.split(",").some((id) => remote[id as RemoteTopic] === undefined));
  const cueChanges = (["occlusion", "blur", "lighting"] as const).flatMap((id) => {
    const result = profiles[id];
    if (!result || !("by_level" in result)) return [];
    const baseline = result.by_level.find(({ level }) => level === 0);
    const altered = result.by_level.filter(({ level }) => level !== 0).sort((a, b) => a.human_correct / a.total - b.human_correct / b.total)[0];
    if (!baseline?.total || !altered?.total) return [];
    const condition = id === "occlusion" ? `${altered.level}% masking`
      : id === "blur" ? `${altered.level} px blur` : `${altered.level > 0 ? "+" : ""}${altered.level} EV`;
    return [{ id, label: experiments[id], from: baseline.human_correct / baseline.total,
      to: altered.human_correct / altered.total, condition }];
  });
  const largestDrop = cueChanges.sort((a, b) => (b.from - b.to) - (a.from - a.to))[0];

  return <section className="results overall-results">
    <h1>Overall Results</h1>
    <p className="lede">Your latest completed round in each challenge, with visual and auditory scores side by side.</p>
    {loading && <p className="note" role="status">Loading saved scores and comparisons…</p>}
    {profilesUnavailable > 0 && <p className="note">Some saved results could not be loaded from the API.</p>}
    {!stats.length ? <section className="panel overall-empty">
      <h2>{loading ? "Loading completed rounds" : "Your results will appear here"}</h2>
      {!loading && <p>Complete a visual or auditory challenge to see your scores and comparisons.</p>}
      <div className="actions">
        <a className="button secondary" href="#trial/visual">Visual challenges</a>
        <a className="button secondary" href="#trial/auditory">Auditory challenges</a>
      </div>
    </section> : <>
      <div className="scores overall-scores">
        <article><h2>Completed rounds</h2><strong>{stats.length}</strong><p>{visual.length} visual · {auditory.length} auditory</p></article>
        <article><h2 className="human">Your accuracy</h2><strong>{percent(humanTotal, trials.length)}%</strong><p>{humanTotal}/{trials.length} correct across completed trials</p></article>
        <article><h2>Head-to-head</h2><strong>{paired.length ? `${percent(bothCorrect + humanOnly, paired.length)}% / ${percent(modelTotal, paired.length)}%` : "—"}</strong>
          <p>{paired.length ? `You / comparison systems on ${paired.length} shared trials` : "No paired scores available"}</p></article>
      </div>
      <div className="results-grid overall-grid">
        <section className="panel">
          <h2>What stands out</h2>
          <ul className="overall-insights">
            {best && <li><strong>Highest accuracy</strong><p>
              {bestTies.length > 1 ? `${bestTies.length} rounds tied at ${percent(best.humanCorrect, best.total)}%, including ` : ""}
              <a href={best.href}>{best.label}</a>{bestTies.length === 1 ? ` with ${best.humanCorrect}/${best.total} correct (${percent(best.humanCorrect, best.total)}%).` : "."}
            </p></li>}
            {humanEdge && <li><strong>Largest lead for you</strong><p><a href={humanEdge.href}>{humanEdge.label}</a> by {percent(humanEdge.gap ?? 0, 1)} percentage points over {humanEdge.model}.</p></li>}
            {modelEdge && (modelEdge.gap ?? 0) < 0 && <li><strong>Largest lead for the comparison system</strong><p><a href={modelEdge.href}>{modelEdge.label}</a> by {percent(-(modelEdge.gap ?? 0), 1)} percentage points for {modelEdge.model}.</p></li>}
            {fullComparisons.length > 0 && advantages.every(({ gap }) => gap === 0) && <li><strong>Same accuracy</strong><p>You and the comparison systems tied on every fully comparable round.</p></li>}
            {largestDrop && largestDrop.from > largestDrop.to && <li><strong>Largest drop from an unaltered image condition</strong><p>
              <a href={`#results/${largestDrop.id}`}>{largestDrop.label}</a> went from {percent(largestDrop.from, 1)}% on the reference trials to {percent(largestDrop.to, 1)}% at {largestDrop.condition}.
            </p></li>}
            {!best && <li><p>Complete a full challenge to see which scores stand out.</p></li>}
          </ul>
        </section>
        <AnswerComparison outcomes={outcomes}>
          {paired.length > 0 && <p>Counts include the {paired.length} trials with both answers available.</p>}
        </AnswerComparison>
      </div>
      <div className="results-grid overall-grid overall-breakdowns">
        {([["Visual", visual], ["Auditory", auditory]] as const).map(([group, entries]) => (
          <section key={group} className="panel">
            <h2>{group} accuracy</h2>
            {entries.length ? <AccuracyChart groups={entries} scale={`${group} challenge`} modelLabel="Model" />
              : <p>Complete a {group.toLowerCase()} challenge to see its score here.</p>}
          </section>
        ))}
      </div>
      <p className="note overall-context">Comparison systems include CLIP, Depth Anything, Whisper, and the tone signal estimator. The topic charts show the number of scored responses for each bar. These scores reflect the completed rounds and their settings. Differences in challenge design and difficulty affect comparisons across topics.</p>
    </>}
  </section>;
}
