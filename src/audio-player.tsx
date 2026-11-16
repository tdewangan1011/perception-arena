import { useEffect, useRef, useState } from "react";

export function AudioPlayer({ src, label, volume, onVolumeChange, onEnded }: {
  src: string;
  label: string;
  volume: number;
  onVolumeChange: (volume: number) => void;
  onEnded?: () => void;
}) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const audio = player.current;
    return () => audio?.pause();
  }, []);

  useEffect(() => {
    if (player.current) player.current.volume = volume;
  }, [volume]);

  return <div className="speech-player">
    <audio ref={player} src={src} preload="metadata"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError(true)}
      onEnded={() => { setPlaying(false); setPlayed(true); onEnded?.(); }} />
    <button type="button" className="button secondary" aria-label={`${playing ? "Pause" : played ? "Replay" : "Play"} ${label}`}
      onClick={() => {
        const audio = player.current;
        if (!audio) return;
        if (!audio.paused) audio.pause();
        else {
          setError(false);
          audio.play().catch(() => setError(true));
        }
      }}>{playing ? "Pause clip" : played ? "Replay clip" : "Play clip"}</button>
    <label>Volume <input type="range" min="0" max="1" step=".05" value={volume}
      onChange={(event) => onVolumeChange(event.currentTarget.valueAsNumber)} /></label>
    {error && <p role="alert">The clip could not play. Try playing it again.</p>}
  </div>;
}

