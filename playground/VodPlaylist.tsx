import { useEffect, useRef, useState } from "react";
import { useHlsPlayer } from "../src/index.js";
import { Inspector } from "./Inspector.js";
import { PlayerPanel } from "./PlayerPanel.js";
import { PlayerSurface } from "./PlayerSurface.js";
import { Workspace } from "./Workspace.js";

const playlist = [
  {
    id: "alternate-tracks",
    title: "Alternate audio and captions",
    format: "MPEG transport stream",
    src: "/fixtures/master.m3u8",
    poster: "/monitor-slate.webp",
  },
  {
    id: "cmaf",
    title: "CMAF video",
    format: "Fragmented MP4",
    src: "/fixtures/cmaf/index.m3u8",
    poster: "/cmaf-slate.webp",
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
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState("");
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const restored = useRef(false);
  const [maxHeight, setMaxHeight] = useState<number>();
  const item = playlist[index]!;
  const step = index < playlist.length - 1 ? 1 : -1;
  const stepLabel = step === 1 ? "Next clip" : "Previous clip";

  const player = useHlsPlayer({
    quality: maxHeight === undefined ? undefined : { maxHeight },
    src: item.src,
    onEvent(event) {
      if (event.type === "transition" && event.to === "ended") {
        writePosition(item.id, null);
        setNotice("Playback finished.");
      }
    },
  });
  const { store, state, controls } = player;
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

  function selectClip(next: number) {
    restored.current = false;
    setNotice("");
    setIndex(next);
  }

  return (
    <Workspace playlist>
      <PlayerSurface
        player={player}
        title={item.title}
        maxHeight={maxHeight}
        onLimit={setMaxHeight}
        poster={item.poster}
        notice={
          state.status === "recovering" ? "Reconnecting to the video." : notice
        }
        inspector={<Inspector player={player} manifest={item.src} />}
        clipStep={
          <button
            type="button"
            className="transport-button clip-step"
            onClick={() => selectClip(index + step)}
            aria-label={stepLabel}
            title={stepLabel}
            data-direction={step === 1 ? "next" : "previous"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 5 10 7-10 7zM19 5v14" />
            </svg>
          </button>
        }
        selection={
          <PlayerPanel
            title="Playlist"
            label={"Playlist " + item.title}
            className="panel-trigger selection-trigger"
            open={playlistOpen}
            onOpenChange={setPlaylistOpen}
            trigger={
              <>
                <span className="selection-caption" aria-hidden="true">
                  {index + 1}/{playlist.length}
                </span>
                <span className="selection-value">{item.title}</span>
                <span className="chevron" aria-hidden="true" />
              </>
            }
          >
            <fieldset className="clip-list">
              <legend className="sr-only">Video</legend>
              {playlist.map((clip, clipIndex) => (
                <label className="clip" key={clip.id}>
                  <input
                    type="radio"
                    name="video"
                    checked={index === clipIndex}
                    onChange={() => selectClip(clipIndex)}
                  />
                  <img className="clip-thumb" src={clip.poster} alt="" />
                  <span>
                    {clip.title}
                    <small>{clip.format}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <div
              className="position-actions"
              role="group"
              aria-label="Clip position"
            >
              <button
                type="button"
                disabled={!canSave || state.status === "ended"}
                onClick={() => {
                  const saved = writePosition(item.id, currentTime);
                  setNotice(
                    saved ? "Position saved." : "Position could not be saved.",
                  );
                  setPlaylistOpen(false);
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
                  setPlaylistOpen(false);
                }}
              >
                Start over
              </button>
            </div>
          </PlayerPanel>
        }
      />
    </Workspace>
  );
}
