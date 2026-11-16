import { useEffect, useState } from "react";

export const visibleMs = 720;
export const blankMs = 180;
const frameMs = visibleMs + blankMs;

export function useFlickerPhase(startedAt: number | undefined) {
  const [frame, setFrame] = useState<{ startedAt: number; phase: number }>();

  useEffect(() => {
    if (startedAt === undefined) return;
    const start = startedAt;
    let request: number;
    let lastPhase = 0;
    function update(now: number) {
      const elapsed = Math.max(0, now - start);
      const image = Math.floor(elapsed / frameMs) % 2;
      const blank = elapsed % frameMs >= visibleMs;
      const phase = image * 2 + Number(blank);
      if (phase !== lastPhase) {
        lastPhase = phase;
        setFrame({ startedAt: start, phase });
      }
      request = requestAnimationFrame(update);
    }
    request = requestAnimationFrame(update);
    return () => cancelAnimationFrame(request);
  }, [startedAt]);

  return frame && frame.startedAt === startedAt ? frame.phase : 0;
}
