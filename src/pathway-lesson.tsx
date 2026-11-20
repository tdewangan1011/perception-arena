import { lazy, Suspense, useState } from "react";
import type { PathwayMode } from "./pathway-data";

const BrainPathway = lazy(() => import("./brain-pathway"));

export function PathwayLesson({ mode, both = false }: { mode: PathwayMode; both?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(mode);

  return <details className="pathway-lesson" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{both ? "Explore the sensory pathways in 3D" : mode === "visual" ? "Explore the visual pathway in 3D" : "Explore the auditory pathway in 3D"}</summary>
    {open && <>
      {both && <div className="pathway-mode-buttons" role="group" aria-label="Sensory pathway">
        {(["visual", "auditory"] as const).map((pathway) => <button type="button" className="button secondary"
          aria-pressed={selected === pathway} key={pathway} onClick={() => setSelected(pathway)}>
          {pathway === "visual" ? "Visual" : "Auditory"}
        </button>)}
      </div>}
      <Suspense fallback={<p className="note" role="status">Loading the brain viewer…</p>}>
        <BrainPathway key={selected} mode={selected} />
      </Suspense>
    </>}
  </details>;
}
