import { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Popover from "@radix-ui/react-popover";
import { useHlsPlayer } from "../src/index.js";
import type { PlaybackEvent } from "../src/types.js";
import { Inspector } from "./Inspector.js";
import { PlayerPanel } from "./PlayerPanel.js";
import { PlayerSurface } from "./PlayerSurface.js";
import { VodPlaylist } from "./VodPlaylist.js";
import { Workspace } from "./Workspace.js";
import "./style.css";

const vod = "/fixtures/master.m3u8";
const singleVariant = "/fixtures/low/index.m3u8";
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
        ? singleVariant
        : vod,
  );
  const [sourceOpen, setSourceOpen] = useState(false);
  const [draft, setDraft] = useState(src ?? "");
  const [maxHeight, setMaxHeight] = useState<number>();
  const [events, setEvents] = useState<PlaybackEvent[]>([]);
  const token = useRef("expired-demo");
  const demoCount = useRef(0);
  const authenticated = Boolean(src?.startsWith("/auth-fixture/"));
  const demoRequest = useMemo(
    () => ({
      allowedOrigins: [location.origin],
      headers: async (_url: URL, { signal }: { signal: AbortSignal }) => {
        signal.throwIfAborted();
        return { "X-Fixture-Token": token.current };
      },
      refreshAuthentication: async ({ signal }: { signal: AbortSignal }) => {
        signal.throwIfAborted();
        token.current = "renewed-demo";
      },
    }),
    [],
  );
  const player = useHlsPlayer({
    src,
    metrics: true,
    engine: params.has("native") ? "native" : "auto",
    recovery: testConfig
      ? { baseDelayMs: 100, maxAttempts: 2, attemptTimeoutMs: 5000 }
      : undefined,
    hlsConfig: testConfig,
    quality: maxHeight === undefined ? undefined : { maxHeight },
    request: authenticated ? demoRequest : undefined,
    onEvent: (event) =>
      setEvents((previous) => [...previous.slice(-19), event]),
  });

  const sourceName =
    src === vod
      ? "VOD fixture"
      : src === singleVariant
        ? "Single-rendition fixture"
        : src === liveSource
          ? "Live fixture"
          : authenticated
            ? "Credential renewal"
            : src
              ? "Custom manifest"
              : "Select stream";

  return (
    <Workspace>
      <PlayerSurface
        player={player}
        title="HLS stream"
        muted
        poster={
          src === vod || src === singleVariant
            ? "/monitor-slate.webp"
            : undefined
        }
        maxHeight={maxHeight}
        onLimit={setMaxHeight}
        inspector={
          <Inspector
            player={player}
            events={events}
            metrics={src ? player.metrics : null}
          />
        }
        selection={
          <PlayerPanel
            title="Stream source"
            label={"Source " + sourceName}
            className="panel-trigger selection-trigger"
            trigger={
              <>
                <span className="selection-caption" aria-hidden="true">
                  Source
                </span>
                <span className="selection-value">{sourceName}</span>
                <span className="chevron" aria-hidden="true" />
              </>
            }
            open={sourceOpen}
            onOpenChange={setSourceOpen}
          >
            <div className="source-actions">
              {[
                { url: vod, label: "VOD fixture" },
                { url: liveSource, label: "Live fixture" },
              ].map(({ url, label }) => (
                <Popover.Close key={url} asChild>
                  <button
                    type="button"
                    aria-current={src === url ? "true" : undefined}
                    onClick={() => {
                      setDraft(url);
                      setSource(url);
                    }}
                  >
                    {label}
                  </button>
                </Popover.Close>
              ))}
              <Popover.Close asChild>
                <button
                  type="button"
                  aria-current={authenticated ? "true" : undefined}
                  onClick={() => {
                    token.current = "expired-demo";
                    const next =
                      "/auth-fixture/manifest.m3u8?session=" +
                      ++demoCount.current;
                    setDraft(next);
                    setSource(next);
                    setEvents([]);
                  }}
                >
                  Test credential renewal
                </button>
              </Popover.Close>
            </div>
            <details className="custom-source">
              <summary>Custom manifest URL</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const next = draft.trim();
                  if (!next) return;
                  setSource(next);
                  setSourceOpen(false);
                }}
              >
                <label htmlFor="stream-url">Manifest URL</label>
                <div className="source-input">
                  <input
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="url"
                    id="stream-url"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button disabled={!draft.trim()} type="submit">
                    Load
                  </button>
                </div>
              </form>
            </details>
            <Popover.Close asChild>
              <button
                type="button"
                className="clear-source"
                disabled={!src}
                onClick={() => setSource(null)}
              >
                Clear
              </button>
            </Popover.Close>
          </PlayerPanel>
        }
      />
    </Workspace>
  );
}

document.title =
  (params.has("playlist") ? "VOD playlist" : "Playback playground") +
  " · Signal Desk";

createRoot(document.getElementById("root")!).render(
  params.has("playlist") ? <VodPlaylist /> : <Player />,
);
