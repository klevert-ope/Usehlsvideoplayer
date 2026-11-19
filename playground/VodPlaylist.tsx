import { useEffect, useRef, useState } from "react";
import { useHlsPlayer } from "../src/index.js";

const playlist = [
  {
    id: "alternate-tracks",
    title: "Alternate audio and captions",
    src: "/fixtures/master.m3u8",
  },
  {
    id: "cmaf",
    title: "CMAF video",
    src: "/fixtures/cmaf/index.m3u8",
  },
] as const;

const positionKey = (id: string) => `hls-playground:position:${id}`;

function savedPosition(id: string) {
  try {
    const value = Number(sessionStorage.getItem(positionKey(id)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writePosition(id: string, seconds: number | null) {
  try {
    if (seconds === null) sessionStorage.removeItem(positionKey(id));
    else sessionStorage.setItem(positionKey(id), String(seconds));
    return true;
  } catch {
    return false;
  }
}

export function VodPlaylist() {
  const [item, setItem] = useState<(typeof playlist)[number]>(playlist[0]);
  const [notice, setNotice] = useState("");
  const restored = useRef(false);
  const { videoRef, store, state, controls, subtitles, error } = useHlsPlayer({
    src: item.src,
    onEvent(event) {
      if (event.type === "transition" && event.to === "ended") {
        writePosition(item.id, null);
        setNotice("Playback finished.");
      }
    },
  });
  const { duration, currentTime } = state;
  const canSeek = duration !== null && state.seekable.length > 0;
  const canSave = canSeek && currentTime > 0 && currentTime < duration;

  useEffect(() => {
    // Read the store after the hook has applied the selected source.
    const { duration, seekable } = store.getState();
    if (restored.current || duration === null || seekable.length === 0) return;
    restored.current = true;
    const position = savedPosition(item.id);
    if (
      position !== null &&
      position < duration &&
      seekable.some(({ start, end }) => position >= start && position < end) &&
      controls.seek(position)
    ) {
      setNotice("Saved position restored.");
    }
  }, [controls, item.id, state.duration, state.seekable, store]);

  return (
    <main>
      <h1>VOD playlist</h1>
      <label htmlFor="playlist-item">Video</label>{" "}
      <select
        id="playlist-item"
        value={item.id}
        onChange={(event) => {
          const next = playlist.find(({ id }) => id === event.target.value);
          if (!next || next === item) return;
          restored.current = false;
          setNotice("");
          setItem(next);
        }}
      >
        {playlist.map(({ id, title }) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
      <video ref={videoRef} controls playsInline aria-label={item.title} />
      <div className="row">
        <label htmlFor="playlist-captions">Captions</label>
        <select
          id="playlist-captions"
          disabled={subtitles.tracks.length === 0}
          value={subtitles.selected ?? "off"}
          onChange={(event) => {
            const id = event.target.value;
            controls.setSubtitleTrack(id === "off" ? "off" : Number(id));
          }}
        >
          <option value="off">Off</option>
          {subtitles.tracks.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!canSave || state.status === "ended"}
          onClick={() => {
            const saved = writePosition(item.id, currentTime);
            setNotice(
              saved ? "Position saved." : "Position could not be saved.",
            );
          }}
        >
          Save position
        </button>
        <button
          type="button"
          disabled={!canSeek}
          onClick={() => {
            if (!controls.seek(0)) return;
            const cleared = writePosition(item.id, null);
            setNotice(
              cleared
                ? "Position cleared."
                : "Saved position could not be cleared.",
            );
          }}
        >
          Start over
        </button>
      </div>
      <p role="status">
        {state.status === "recovering" ? "Reconnecting to the video." : notice}
      </p>
      {error && state.status === "error" && <p role="alert">{error.message}</p>}
    </main>
  );
}
