import type { ReactNode } from "react";
import { outcomeLabels, type ExperimentResult } from "./pilot";

export function AnswerComparison({ outcomes, children }: {
  outcomes?: ExperimentResult["outcomes"];
  children?: ReactNode;
}) {
  return (
    <article className="panel">
      <h2>How the answers compare</h2>
      <dl>{(Object.keys(outcomeLabels) as (keyof typeof outcomeLabels)[]).map((key) => (
        <div key={key}><dt>{outcomeLabels[key]}</dt><dd>{outcomes?.[key] ?? "—"}</dd></div>
      ))}</dl>
      {children}
    </article>
  );
}
