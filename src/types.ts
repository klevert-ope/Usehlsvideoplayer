import type { HlsConfig } from "hls.js";

export type PlaybackStatus =
  | "idle"
  | "initialising"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "buffering"
  | "seeking"
  | "recovering"
  | "ended"
  | "error"
  | "destroyed";
export type EngineKind = "hls.js" | "native";
export type ErrorCode =
  | "invalid-source"
  | "unsupported"
  | "setup"
  | "manifest"
  | "network"
  | "segment"
  | "decode"
  | "authentication"
  | "request-policy"
  | "playback-blocked"
  | "unknown";

export interface PlaybackError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly fatal: boolean;
  readonly retryable: boolean;
  readonly engine: EngineKind | null;
  readonly httpStatus?: number;
}

export interface MediaRange {
  readonly start: number;
  readonly end: number;
}

export interface Track {
  readonly id: number;
  readonly label: string;
  readonly language: string | null;
}

export interface QualityLevel {
  readonly id: number;
  readonly bitrate: number;
  readonly width: number;
  readonly height: number;
}

export interface QualityState {
  readonly levels: readonly QualityLevel[];
  readonly mode: "auto" | "manual" | "unavailable";
  readonly selected: number | null;
  readonly current: number | null;
}

export interface TrackState {
  readonly tracks: readonly Track[];
  readonly selected: number | null;
}

export interface LiveState {
  readonly isLive: boolean | null;
  readonly edge: number | null;
  readonly syncPosition: number | null;
  readonly latency: number | null;
  readonly atEdge: boolean;
  readonly canSeekToLive: boolean;
}

export interface RecoveryState {
  readonly attempt: number;
  readonly limit: number;
  readonly phase: "scheduled" | "running" | "recovered" | "exhausted";
  readonly delayMs: number;
}

export interface PlaybackState {
  readonly status: PlaybackStatus;
  readonly engine: EngineKind | null;
  readonly currentTime: number;
  readonly duration: number | null;
  readonly buffered: readonly MediaRange[];
  readonly seekable: readonly MediaRange[];
  readonly muted: boolean;
  readonly volume: number;
  readonly playbackRate: number;
  readonly quality: QualityState;
  readonly audio: TrackState;
  readonly subtitles: TrackState;
  readonly live: LiveState;
  readonly error: PlaybackError | null;
  readonly recovery: RecoveryState | null;
}

export interface PlaybackMetrics {
  readonly startupMs: number | null;
  readonly playingMs: number;
  readonly rebufferMs: number;
  readonly rebufferCount: number;
  readonly rebufferRatio: number;
  readonly droppedFrames: number | null;
  readonly totalFrames: number | null;
  readonly liveLatency: number | null;
}

export interface PlaybackStore {
  readonly getState: () => PlaybackState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getMetrics: () => PlaybackMetrics | null;
  readonly subscribeMetrics: (listener: () => void) => () => void;
}

export type PlaybackEvent =
  | {
      readonly type: "transition";
      readonly from: PlaybackStatus;
      readonly to: PlaybackStatus;
    }
  | { readonly type: "error"; readonly error: PlaybackError }
  | { readonly type: "recovery"; readonly recovery: RecoveryState };

export interface RecoveryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  attemptTimeoutMs?: number;
}

export interface RequestOptions {
  /** Exact HTTP(S) origins trusted to receive stream requests and credentials. */
  allowedOrigins: readonly string[];
  credentials?: RequestCredentials;
  /** Called for each allowed request. The URL can contain secrets. */
  headers?: (url: URL) => HeadersInit | undefined;
}

export interface PlayerOptions {
  autoPlay?: boolean;
  lowLatency?: boolean;
  engine?: "auto" | EngineKind;
  metrics?: boolean;
  recovery?: false | RecoveryOptions;
  request?: RequestOptions;
  /** Trusted application configuration. See SECURITY.md for escape hatches. */
  hlsConfig?: Partial<HlsConfig>;
}

export interface PlaybackControls {
  play(): Promise<boolean>;
  pause(): boolean;
  seek(seconds: number): boolean;
  setMuted(muted: boolean): boolean;
  setVolume(volume: number): boolean;
  setPlaybackRate(rate: number): boolean;
  setQuality(level: number | "auto"): boolean;
  setAudioTrack(id: number): boolean;
  setSubtitleTrack(id: number | "off"): boolean;
  seekToLive(): boolean;
  startLoading(): boolean;
  retry(): boolean;
}

export interface PlaybackController extends PlaybackStore {
  readonly controls: PlaybackControls;
  setSource(
    video: HTMLVideoElement | null,
    src?: string | null,
    options?: PlayerOptions,
  ): void;
  onEvent(listener: (event: PlaybackEvent) => void): () => void;
  destroy(): void;
}
