import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { PlayerBar, type PlaybackSession } from "./PlayerBar.js";
import { PlayerPanel, PlayerPortal, useInspectorDock } from "./PlayerPanel.js";

export function PlayerSurface({
  player,
  title,
  poster,
  muted,
  maxHeight,
  onLimit,
  selection,
  inspector,
  clipStep,
  notice,
}: {
  player: PlaybackSession;
  title: string;
  poster?: string;
  muted?: boolean;
  maxHeight?: number;
  onLimit: (value: number | undefined) => void;
  selection: ReactNode;
  inspector: ReactNode;
  clipStep?: ReactNode;
  notice?: string;
}) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const dock = useInspectorDock();
  const inspectorId = useId();
  const inspectorTrigger = useRef<HTMLButtonElement>(null);
  const inspectorClose = useRef<HTMLButtonElement>(null);
  const { state, controls, quality, error } = player;
  const height = quality.levels.find(
    ({ id }) => id === quality.current,
  )?.height;
  const closeInspector = () => {
    setInspecting(false);
    inspectorTrigger.current?.focus();
  };

  useEffect(() => {
    if (dock && inspecting) inspectorClose.current?.focus();
  }, [dock, inspecting]);

  const inspectorLabel = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
      </svg>
      <span className="inspector-label">Inspector</span>
    </>
  );

  return (
    <PlayerPortal.Provider value={container}>
      <section
        ref={setContainer}
        className="player-frame"
        id="output-monitor"
        aria-label="Output monitor"
      >
        <div className="player-core">
          <div className="monitor-rail">
            {selection}
            <div className="monitor-tools">
              <span
                role="status"
                className="playback-state"
                data-state={state.status}
                data-testid="status"
              >
                {state.status}
              </span>
              {height ? (
                <span className="output-quality">{height}p</span>
              ) : null}
              {dock ? (
                <button
                  ref={inspectorTrigger}
                  className="panel-trigger inspector-trigger"
                  type="button"
                  aria-label="Inspector"
                  aria-expanded={inspecting}
                  aria-controls={inspecting ? inspectorId : undefined}
                  onClick={() => setInspecting(!inspecting)}
                >
                  {inspectorLabel}
                </button>
              ) : (
                <PlayerPanel
                  title="Inspector"
                  trigger={inspectorLabel}
                  className="panel-trigger inspector-trigger"
                  open={inspecting}
                  onOpenChange={setInspecting}
                  align="end"
                  sheetOnTablet
                >
                  {inspector}
                </PlayerPanel>
              )}
            </div>
          </div>
          <PlayerBar
            player={player}
            title={title}
            poster={poster}
            muted={muted}
            maxHeight={maxHeight}
            onLimit={onLimit}
            clipStep={clipStep}
          />
          {notice !== undefined && (
            <p
              role="status"
              data-testid="playlist-notice"
              className="playlist-notice"
            >
              {notice}
            </p>
          )}
          {error && (
            <div className="player-error">
              <p role="alert">
                <strong data-testid="error-code">{error.code}</strong>{" "}
                {error.message}
              </p>
              {state.status === "error" && error.retryable && (
                <button onClick={controls.retry}>Retry</button>
              )}
            </div>
          )}
        </div>
        {dock && inspecting && (
          <aside
            className="inspector-dock"
            id={inspectorId}
            aria-labelledby={inspectorId + "-heading"}
            onKeyDown={(event) => {
              if (event.key === "Escape") closeInspector();
            }}
          >
            <header className="panel-header">
              <h2 id={inspectorId + "-heading"}>Inspector</h2>
              <button
                ref={inspectorClose}
                type="button"
                className="panel-close"
                aria-label="Close Inspector"
                onClick={closeInspector}
              >
                ×
              </button>
            </header>
            <div className="panel-body">{inspector}</div>
          </aside>
        )}
      </section>
    </PlayerPortal.Provider>
  );
}
