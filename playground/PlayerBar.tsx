import {
  useCallback,
  useId,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  MediaController,
  MediaControlBar,
  MediaPlayButton,
  MediaMuteButton,
  MediaTimeRange,
  MediaTimeDisplay,
  MediaVolumeRange,
  MediaFullscreenButton,
  MediaPipButton,
  MediaAirplayButton,
  MediaCastButton,
} from "media-chrome/react";
import type { useHlsPlayer } from "../src/index.js";
import { PlayerPanel } from "./PlayerPanel.js";

export type PlaybackSession = ReturnType<typeof useHlsPlayer>;

export function PlayerBar({
  player,
  poster,
  title,
  muted,
  maxHeight,
  onLimit,
  clipStep,
}: {
  player: PlaybackSession;
  poster?: string;
  title: string;
  muted?: boolean;
  maxHeight?: number;
  onLimit: (value: number | undefined) => void;
  clipStep?: ReactNode;
}) {
  const { videoRef, controls, live } = player;
  const controllerId = useId();
  const seekBar = useRef<ComponentRef<typeof MediaTimeRange>>(null);
  const [stage, setStage] = useState<ComponentRef<
    typeof MediaController
  > | null>(null);
  const attachStage = useCallback(
    (node: ComponentRef<typeof MediaController> | null) => {
      const frame = node?.closest<HTMLElement>(".player-frame");
      if (node && frame) node.fullscreenElement = frame;
      setStage(node);
    },
    [],
  );

  return (
    <>
      <MediaController
        className="video-stage"
        id={controllerId}
        ref={attachStage}
        tabIndex={0}
      >
        <video
          slot="media"
          ref={videoRef}
          muted={muted}
          playsInline
          aria-label={title}
          poster={poster}
        />
      </MediaController>
      <MediaControlBar
        className="transport"
        {...{ mediacontroller: controllerId }}
      >
        <MediaTimeRange ref={seekBar} className="transport-seek" />
        <MediaPlayButton />
        {clipStep}
        <MediaMuteButton />
        <MediaTimeDisplay />
        {live.isLive && (
          <button
            className="live-button"
            disabled={!live.canSeekToLive}
            onClick={controls.seekToLive}
            aria-label="Seek to live"
          >
            Live
          </button>
        )}
        <PlayerPanel
          title="Settings"
          side="top"
          align="end"
          anchor={seekBar}
          collisionBoundary={stage}
          className="transport-button"
          trigger={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h9m4 0h3M4 17h3m4 0h9" />
              <circle cx="15" cy="7" r="2" />
              <circle cx="9" cy="17" r="2" />
            </svg>
          }
        >
          <PlayerSettings
            player={player}
            controllerId={controllerId}
            maxHeight={maxHeight}
            onLimit={onLimit}
          />
        </PlayerPanel>
        <MediaFullscreenButton />
      </MediaControlBar>
    </>
  );
}

function PlayerSettings({
  player,
  controllerId,
  maxHeight,
  onLimit,
}: {
  player: PlaybackSession;
  controllerId: string;
  maxHeight?: number;
  onLimit: (value: number | undefined) => void;
}) {
  const { state, controls, quality, audio, subtitles } = player;
  const selectedLevel = quality.levels.find(
    ({ id }) => id === quality.selected,
  );
  const qualitySummary = selectedLevel
    ? selectedLevel.height + "p"
    : maxHeight
      ? "Auto · up to " + maxHeight + "p"
      : "Auto";

  return (
    <div className="preferences">
      <details className="quality-options">
        <summary>
          Quality options
          <span className="setting-value">{qualitySummary}</span>
        </summary>
        <label className="setting-row">
          Quality
          <select
            disabled={!quality.levels.length}
            value={quality.selected ?? "auto"}
            onChange={(e) =>
              controls.setQuality(
                e.target.value === "auto" ? "auto" : Number(e.target.value),
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
        <label className="setting-row">
          Auto resolution limit
          <select
            value={maxHeight ?? ""}
            onChange={(e) =>
              onLimit(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">Stream default</option>
            <option value="180">Prefer up to 180p</option>
            <option value="360">Prefer up to 360p</option>
          </select>
        </label>
      </details>
      <label className="setting-row">
        Audio
        <select
          disabled={!audio.tracks.length}
          value={audio.selected ?? ""}
          onChange={(e) => controls.setAudioTrack(Number(e.target.value))}
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
      <label className="setting-row">
        Captions
        <select
          disabled={!subtitles.tracks.length}
          value={subtitles.selected ?? "off"}
          onChange={(e) =>
            controls.setSubtitleTrack(
              e.target.value === "off" ? "off" : Number(e.target.value),
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
      <label className="setting-row">
        Playback speed
        <select
          value={state.playbackRate}
          onChange={(e) => controls.setPlaybackRate(Number(e.target.value))}
        >
          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </label>
      <div className="setting-row volume-setting">
        <span>Volume</span>
        <MediaVolumeRange
          className="volume-range"
          {...{ mediacontroller: controllerId }}
        />
      </div>
      <div className="device-options" role="group" aria-label="Viewing options">
        <span>Viewing options</span>
        <MediaAirplayButton
          mediaController={controllerId}
          noTooltip
          title="AirPlay"
        />
        <MediaCastButton
          mediaController={controllerId}
          noTooltip
          title="Cast"
        />
        <MediaPipButton
          mediaController={controllerId}
          noTooltip
          title="Picture-in-picture"
        />
      </div>
    </div>
  );
}
