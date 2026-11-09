import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { useHlsPlayer } from "../src/index.js";
import "./style.css";

const vod = "/fixtures/master.m3u8";
const liveSource = "/live/stream.m3u8";
const params = new URLSearchParams(location.search);
const noRetry = {
  maxTimeToFirstByteMs: 1000,
  maxLoadTimeMs: 2000,
  timeoutRetry: null,
  errorRetry: null,
};
const testConfig = params.has("fastRecovery")
  ? {
      manifestLoadPolicy: { default: noRetry },
      fragLoadPolicy: { default: noRetry },
      levelLoadPolicy: { default: noRetry },
    }
  : undefined;

function Player() {
  const [src, setSource] = useState<string | null>(
    params.has("live")
      ? liveSource
      : params.has("singleVariant")
        ? "/fixtures/low/index.m3u8"
        : vod,
  );
  const [draft, setDraft] = useState(src ?? "");
  const {
    videoRef,
    state,
    controls,
    quality,
    audio,
    subtitles,
    live,
    metrics,
    error,
  } = useHlsPlayer({
    src,
    metrics: true,
    engine: params.has("native") ? "native" : "auto",
    recovery: testConfig
      ? { baseDelayMs: 100, maxAttempts: 2, attemptTimeoutMs: 5000 }
      : undefined,
    hlsConfig: testConfig,
  });

  return (
    <main>
      <h1>HLS playback playground</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSource(draft);
        }}
      >
        <label htmlFor="stream-url">Manifest URL</label>
        <div className="row">
          <input
            id="stream-url"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit">Load</button>
        </div>
      </form>
      <div className="row">
        <button
          onClick={() => {
            setDraft(vod);
            setSource(vod);
          }}
        >
          VOD fixture
        </button>
        <button
          onClick={() => {
            setDraft(liveSource);
            setSource(liveSource);
          }}
        >
          Live fixture
        </button>
        <button onClick={() => setSource(null)}>Clear</button>
      </div>
      <video ref={videoRef} controls muted playsInline />
      <div className="row">
        <button onClick={() => void controls.play()}>Play stream</button>
        <button onClick={controls.pause}>Pause stream</button>
        <button disabled={!live.canSeekToLive} onClick={controls.seekToLive}>
          Seek to live
        </button>
        <button disabled={state.status !== "error"} onClick={controls.retry}>
          Retry
        </button>
      </div>
      <div className="row">
        <label>
          Quality{" "}
          <select
            disabled={!quality.levels.length}
            value={quality.selected ?? "auto"}
            onChange={(event) =>
              controls.setQuality(
                event.target.value === "auto"
                  ? "auto"
                  : Number(event.target.value),
              )
            }
          >
            <option value="auto">Auto</option>
            {quality.levels.map(({ id, height }) => (
              <option key={id} value={id}>
                {height}p
              </option>
            ))}
          </select>
        </label>
        <label>
          Audio{" "}
          <select
            disabled={!audio.tracks.length}
            value={audio.selected ?? ""}
            onChange={(event) =>
              controls.setAudioTrack(Number(event.target.value))
            }
          >
            <option value="" disabled>
              Default
            </option>
            {audio.tracks.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Subtitles{" "}
          <select
            disabled={!subtitles.tracks.length}
            value={subtitles.selected ?? "off"}
            onChange={(event) =>
              controls.setSubtitleTrack(
                event.target.value === "off"
                  ? "off"
                  : Number(event.target.value),
              )
            }
          >
            <option value="off">Off</option>
            {subtitles.tracks.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p role="status">
        <span data-testid="status">{state.status}</span> ·{" "}
        <span data-testid="engine">{state.engine ?? "no engine"}</span>
      </p>
      {error && (
        <p role="alert" data-testid="error-code">
          {error.code}
        </p>
      )}
      <dl>
        <dt>Current quality</dt>
        <dd data-testid="current-quality">{quality.current ?? "—"}</dd>
        <dt>Live latency estimate</dt>
        <dd data-testid="live-latency">{live.latency?.toFixed(2) ?? "—"}</dd>
        <dt>Recovery</dt>
        <dd data-testid="recovery">{state.recovery?.phase ?? "—"}</dd>
      </dl>
      <details>
        <summary>Playback metrics</summary>
        <pre data-testid="metrics">{JSON.stringify(metrics)}</pre>
      </details>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Player />);
