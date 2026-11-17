import { readResult, saveResult } from "./result-storage";

type Prediction = string | 0 | 1;

export async function getSavedPredictions(topic: string, signal: AbortSignal) {
  const key = `perception-arena-predictions-v1-${topic}`;
  const saved = readResult<Record<string, Prediction>>(key);
  if (saved) return saved;
  const response = await fetch(`/api/${topic}/predictions`, { signal });
  if (!response.ok) throw new Error("Comparison unavailable");
  const predictions: Record<string, Prediction> = await response.json();
  if (!predictions || !Object.values(predictions).length || Object.values(predictions).some(
    (value) => topic === "speech" ? typeof value !== "string" : value !== 0 && value !== 1,
  )) throw new Error("Invalid comparison");
  if (!signal.aborted) saveResult(key, predictions);
  return predictions;
}
