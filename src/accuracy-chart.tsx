type AccuracyGroup = {
  label: string;
  total: number;
  humanCorrect: number;
  modelCorrect?: number;
  modelTotal?: number;
  href?: string;
};

export function AccuracyChart({ groups, scale, modelLabel = "AI" }: {
  groups: AccuracyGroup[];
  scale: string;
  modelLabel?: string;
}) {
  return (
    <figure className="accuracy" aria-label={`Correct responses by ${scale.toLowerCase()}`}>
      <figcaption>{scale} · correct out of total</figcaption>
      {groups.map(({ label, total, humanCorrect, modelCorrect, modelTotal = total, href }) => (
        <div className="accuracy-row" key={label}>
          <strong>{href ? <a href={href}>{label}</a> : label}</strong>
          <div className="accuracy-bars">
            {([
              ["You", humanCorrect, "human", total],
              [modelLabel, modelCorrect, "machine", modelTotal],
            ] as const).map(([series, correct, style, count]) => (
              <div className={`accuracy-bar ${style}`} key={series}>
                <span>{series}</span>
                <span className="bar-track" aria-hidden="true">
                  {correct !== undefined && count > 0 && <span style={{ width: `${100 * correct / count}%` }} />}
                </span>
                {correct === undefined || !count ? <span aria-label="Score unavailable">—</span> : <span>{correct}/{count}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </figure>
  );
}
