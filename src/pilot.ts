import type { ModelStatus, TrialView } from "./preview";

export const outcomeLabels = {
  both_correct: "Both correct",
  human_only_correct: "Human only correct",
  ai_only_correct: "AI only correct",
  both_wrong: "Both wrong",
};

export interface PilotSession {
  session_id: string;
  trial: ScoredTrial;
}

export type ScoredTrial = TrialView & { trial_id: string; stimulus_id: string; comparisonUrl?: string };
export type Topic = "occlusion" | "blur" | "lighting" | "change";

export interface ExperimentSession {
  session_id: string;
  condition: Topic;
  trial: ScoredTrial | null;
}

export interface LevelResult {
  level: number;
  total: number;
  human_correct: number;
  model_correct: number;
}

export interface ExperimentTrial extends Omit<PilotResult, "session_id" | "difficulty"> {
  trial_id: string;
  level: number;
  condition?: Topic;
  comparisonUrl?: string;
  edit_radius_px?: number;
  scene_title?: string;
  change_description?: string;
  flicker_timing?: { visible_ms: number; blank_ms: number };
  source?: { artist: string; license: string; license_url: string; source_url: string; title: string };
}

export interface ExperimentResult extends Omit<LevelResult, "level"> {
  session_id: string;
  condition: Topic;
  design_version: string;
  model_id: string;
  model_revision: string;
  outcomes: Record<keyof typeof outcomeLabels, number>;
  by_level: LevelResult[];
  trials: ExperimentTrial[];
}

export interface PilotResult {
  session_id: string;
  imageUrl: string;
  difficulty: number;
  ground_truth: string;
  human_choice: string;
  model_choice: string;
  human_correct: boolean;
  model_correct: boolean;
  human_response_ms: number;
  outcome: keyof typeof outcomeLabels;
  model_id: string;
  model_revision: string;
}

export interface PilotAnswer {
  trial_id: string;
  human_choice: string;
  human_confidence_pct: number | null;
  human_response_ms: number;
  flicker_timing?: { visible_ms: number; blank_ms: number };
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/api" + path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(typeof body?.detail === "string" ? body.detail : "The API could not complete the request.", response.status);
  }
  return response.json() as Promise<T>;
}

export const getModelStatus = () => request<ModelStatus>("/health");
export const startPilot = () => request<PilotSession>("/sessions", { method: "POST" });
export const getPilotResult = (id: string) => request<PilotResult>(`/sessions/${id}/results`);
const postAnswer = (answer: PilotAnswer): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
  });

export const submitPilotAnswer = (id: string, answer: PilotAnswer) =>
  request<PilotResult>(`/sessions/${id}/responses`, postAnswer(answer));

const experimentPath = "/experiment/sessions";
export const startExperiment = (topic: Topic) => request<ExperimentSession>(`${experimentPath}?topic=${topic}`, { method: "POST" });
export const getExperiment = (id: string) => request<ExperimentSession>(`${experimentPath}/${id}`);
export const getExperimentResult = (id: string) => request<ExperimentResult>(`${experimentPath}/${id}/results`);
export const submitExperimentAnswer = (id: string, answer: PilotAnswer) =>
  request<ExperimentSession>(`${experimentPath}/${id}/responses`, postAnswer(answer));
