export const toneTopics = ["tones", "timbre", "fundamental"] as const;
export type ToneTopic = (typeof toneTopics)[number];
export type ToneAnswers = Record<string, "A" | "B">;
export const toneEstimatorName = "Signal estimator";

export function isToneTopic(value: string | null): value is ToneTopic {
  return toneTopics.some((topic) => topic === value);
}
