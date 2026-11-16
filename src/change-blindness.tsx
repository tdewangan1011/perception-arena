import { useEffect, useRef, useState } from "react";
import { regionLabels as regions } from "./pair-images";
import { useFlickerPhase } from "./flicker";

type Attempt = { region: number; elapsedMs: number } | { region: null };
const changedRegion = 3;

export function ChangeBlindness() {
  const [startedAt, setStartedAt] = useState<number>();
  const [attempt, setAttempt] = useState<Attempt>();
  const phase = useFlickerPhase(startedAt);
  const [changed, setChanged] = useState(true);
  const [interrupted, setInterrupted] = useState(false);
  const [loadedFrames, setLoadedFrames] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const revealHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (startedAt !== undefined) board.current?.focus({ preventScroll: true });
    if (attempt) revealHeading.current?.focus({ preventScroll: true });
  }, [startedAt, attempt]);

  useEffect(() => {
    if (startedAt === undefined) return;
    function handleVisibility() {
      if (document.hidden) {
        setStartedAt(undefined);
        setInterrupted(true);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [startedAt]);

  function start() {
    setAttempt(undefined);
    setInterrupted(false);
    setStartedAt(performance.now());
  }

  function reveal(region: number | null) {
    if (startedAt === undefined) return;
    setAttempt(region === null ? { region } : { region, elapsedMs: performance.now() - startedAt });
    setStartedAt(undefined);
    setChanged(true);
  }

  const playing = startedAt !== undefined;
  const blank = playing && phase % 2 === 1;
  return (
    <section className="change-page">
      <a className="back-link" href="#trial">← All challenges</a>
      <h1>Change blindness</h1>
      <p className="lede">Two versions of a real kitchen photo alternate with a brief blank. Select the area where you notice a change.</p>
      <a className="button secondary change-pair-link" href="#trial/change">Try the flicker challenge with CLIP <span aria-hidden="true">→</span></a>
      <div className="change-layout">
        <div className="change-board" role="group" aria-label="Kitchen scene divided into nine regions" ref={board} tabIndex={-1}>
          <div className="change-frame" data-blank={blank}>
            {["a", "b"].map((letter) => {
              const showChanged = playing ? phase === 2 : Boolean(attempt && changed);
              return <img src={`./change-practice-${letter}.webp`} alt="" key={letter}
                onLoad={() => setLoadedFrames((total) => total + 1)} onError={() => setLoadFailed(true)}
                className={showChanged === (letter === "b") ? "" : "flicker-hidden"} />;
            })}
          </div>
          <div className="change-grid">
            {regions.map((region, index) => playing
              ? <button type="button" key={region} aria-label={region} onClick={() => reveal(index)} />
              : <span key={region} className={attempt && index === changedRegion ? "change-target"
                  : attempt?.region === index ? "change-miss" : undefined} aria-hidden="true" />)}
          </div>
        </div>
        <div className="change-controls">
          {playing ? <>
            <h2>Where did something change?</h2>
            <p>Click a region or use Tab and Enter to make your guess.</p>
            <button className="button secondary" type="button" onClick={() => reveal(null)}>Reveal change</button>
          </> : attempt ? <>
            <h2 tabIndex={-1} ref={revealHeading}>
              {attempt.region === changedRegion ? "You spotted it" : "Here’s what changed"}
            </h2>
            <p>The small pink cup on the left side of the counter changed to blue.</p>
            {attempt.region !== null && <p>You selected {regions[attempt.region].toLowerCase()} after {(attempt.elapsedMs / 1000).toFixed(1)} seconds.</p>}
            <div className="change-toggle" role="group" aria-label="Compare scene versions">
              <button className="button secondary" type="button" aria-pressed={!changed} onClick={() => setChanged(false)}>Original</button>
              <button className="button secondary" type="button" aria-pressed={changed} onClick={() => setChanged(true)}>Changed</button>
            </div>
            <button className="button secondary" type="button" onClick={start}>Replay scene</button>
          </> : <>
            <h2>Find the change</h2>
            <p>The scene only alternates after you start. Take as long as you need.</p>
            {interrupted && <p role="status">The attempt stopped when you left the tab. Start again when ready.</p>}
            {loadFailed && <p role="alert">The practice photo could not load. Refresh to try again.</p>}
            <button className="button primary" type="button" disabled={loadedFrames < 2} onClick={start}>Start scene</button>
          </>}
        </div>
      </div>
      <section className="change-explanation">
        <h2>Why add a blank?</h2>
        <p>The blank interrupts the local visual signal that normally helps draw attention to a change. This scene illustrates the effect with one example. <a href="https://cim.mcgill.ca/~clark/vmrl/web-content/papers/jjclark_psych_sci_1997.pdf">Read the original flicker experiment</a>.</p>
        <p><a href="https://commons.wikimedia.org/wiki/File:The_Scratch_Kitchen_Interior.jpg">Kitchen photo by Xanadu73</a> under CC0. Cropped and recolored for practice.</p>
      </section>
    </section>
  );
}
