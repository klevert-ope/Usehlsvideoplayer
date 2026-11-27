import type { PlaybackEvent, PlaybackMetrics } from "../src/types.js";
import type { PlaybackSession } from "./PlayerBar.js";

export function Inspector({
  player,
  manifest,
  events,
  metrics,
}: {
  player: PlaybackSession;
  manifest?: string;
  events?: PlaybackEvent[];
  metrics?: PlaybackMetrics | null;
}) {
  const { state, quality, live, subtitles } = player;
  const currentLevel = quality.levels.find(({ id }) => id === quality.current);
  const { duration } = state;

  return (
    <>
      {manifest && (
        <div className="manifest">
          <h3>Selected manifest</h3>
          <code>{manifest}</code>
        </div>
      )}
      <dl className="readouts">
        <div>
          <dt>Playback state</dt>
          <dd>{state.status}</dd>
        </div>
        <div>
          <dt>Playback engine</dt>
          <dd data-testid="engine">{state.engine ?? "No engine"}</dd>
        </div>
        {manifest && duration !== null && Number.isFinite(duration) && (
          <div>
            <dt>Duration</dt>
            <dd>
              {Math.floor(duration / 60)}:
              {String(Math.floor(duration % 60)).padStart(2, "0")}
            </dd>
          </div>
        )}
        {manifest && state.engine && (
          <div>
            <dt>Caption tracks</dt>
            <dd>{subtitles.tracks.length}</dd>
          </div>
        )}
        {quality.current != null && (
          <div>
            <dt>Current quality</dt>
            <dd>
              {currentLevel?.height ? currentLevel.height + "p · " : ""}Level{" "}
              <span data-testid="current-quality">{quality.current}</span>
            </dd>
          </div>
        )}
        {live.isLive && live.latency != null && (
          <div>
            <dt>Live latency</dt>
            <dd>
              <span data-testid="live-latency">{live.latency.toFixed(2)}</span>{" "}
              s
            </dd>
          </div>
        )}
        {state.recovery && (
          <div>
            <dt>Recovery</dt>
            <dd data-testid="recovery">{state.recovery.phase}</dd>
          </div>
        )}
        {metrics?.droppedFrames != null && (
          <div>
            <dt>Dropped frames</dt>
            <dd>{metrics.droppedFrames}</dd>
          </div>
        )}
      </dl>
      <div className="inspection">
        {metrics && (
          <details>
            <summary>Playback metrics</summary>
            <dl className="metric-list">
              {metrics.startupMs != null && (
                <div>
                  <dt>Startup time</dt>
                  <dd>{Math.round(metrics.startupMs)} ms</dd>
                </div>
              )}
              <div>
                <dt>Time playing</dt>
                <dd>{(metrics.playingMs / 1000).toFixed(1)} s</dd>
              </div>
              <div>
                <dt>Rebuffers</dt>
                <dd>{metrics.rebufferCount}</dd>
              </div>
              <div>
                <dt>Time rebuffering</dt>
                <dd>{(metrics.rebufferMs / 1000).toFixed(1)} s</dd>
              </div>
            </dl>
            <details>
              <summary>All metric values</summary>
              <pre data-testid="metrics">
                {JSON.stringify(
                  metrics,
                  (_key, value) => (value === null ? undefined : value),
                  2,
                )}
              </pre>
            </details>
          </details>
        )}
        {events && (
          <details>
            <summary>
              Recovery &amp; playback events{" "}
              <span className="count">{events.length}</span>
            </summary>
            {events.length === 0 ? (
              <p className="empty-log">No events recorded.</p>
            ) : (
              <>
                <ol className="event-log">
                  {events
                    .slice()
                    .reverse()
                    .map((event, index) => (
                      <li key={index}>
                        <b>{event.type}</b>
                        <span>
                          {event.type === "transition"
                            ? event.from + " → " + event.to
                            : event.type === "error"
                              ? event.error.message
                              : event.recovery.phase}
                        </span>
                      </li>
                    ))}
                </ol>
                <details>
                  <summary>Event data</summary>
                  <pre>{JSON.stringify(events, null, 2)}</pre>
                </details>
              </>
            )}
          </details>
        )}
      </div>
    </>
  );
}
