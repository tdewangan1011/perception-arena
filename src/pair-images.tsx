import { useState } from "react";
import { useFlickerPhase } from "./flicker";

export const regionLabels = [
  "Upper left", "Upper center", "Upper right",
  "Middle left", "Middle center", "Middle right",
  "Lower left", "Lower center", "Lower right",
];

function RegionGrid({ answer }: { answer?: number }) {
  return <div className="pair-grid" aria-hidden="true">
    {regionLabels.map((region, index) => <span className={index === answer ? "pair-target" : undefined} key={region} />)}
  </div>;
}

export function FlickerImages({ first, second, startedAt, onLoad, onError, onSelect, selection, disabled }: {
  first: string;
  second: string;
  startedAt?: number;
  onLoad: (frame: number) => void;
  onError: () => void;
  onSelect: (region: string) => void;
  selection?: string;
  disabled: boolean;
}) {
  const phase = useFlickerPhase(startedAt);
  const blank = startedAt === undefined || phase % 2 === 1;
  return (
    <figure className="flicker-figure">
      <div className="pair-frame flicker-frame" data-blank={blank}>
        {[first, second].map((url, frame) => (
          <img src={url} alt="" aria-hidden="true" className={blank || phase !== frame * 2 ? "flicker-hidden" : ""}
            onLoad={() => onLoad(frame)} onError={onError} key={frame} />
        ))}
        <div className="pair-grid pair-input-grid" role="group" aria-label="Select the region of the scene that changed">
          {regionLabels.map((region) => (
            <button key={region} type="button" aria-label={region} aria-pressed={selection === region}
              disabled={disabled} onClick={() => onSelect(region)} />
          ))}
        </div>
      </div>
      <figcaption>Alternating views</figcaption>
    </figure>
  );
}

export function PairReview({ first, second, answer }: { first: string; second: string; answer?: number }) {
  const [secondVisible, setSecondVisible] = useState(true);
  return (
    <figure>
      <div className="pair-frame">
        <img src={secondVisible ? second : first} alt={secondVisible ? "Image B" : "Image A"} loading="lazy" />
        <RegionGrid answer={answer} />
      </div>
      <div className="change-toggle" role="group" aria-label="Compare trial images">
        <button className="button secondary" type="button" aria-pressed={!secondVisible} onClick={() => setSecondVisible(false)}>Image A</button>
        <button className="button secondary" type="button" aria-pressed={secondVisible} onClick={() => setSecondVisible(true)}>Image B</button>
      </div>
    </figure>
  );
}
