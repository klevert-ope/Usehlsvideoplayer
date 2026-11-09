import Hls from "hls.js";
import { selectEngine } from "./engine-selection.js";
import { classifyHlsError, failure, sourceUrl } from "./errors.js";
import type {
  EngineKind,
  PlaybackError,
  PlayerOptions,
  QualityState,
  RequestOptions,
  TrackState,
} from "./types.js";

export interface EngineFeatures {
  readonly quality?: QualityState;
  readonly audio?: TrackState;
  readonly subtitles?: TrackState;
  readonly live?: {
    readonly isLive: boolean;
    readonly edge: number;
    readonly syncPosition: number | null;
  };
}

export interface EngineContext {
  readonly video: HTMLVideoElement;
  readonly url: URL;
  readonly options: PlayerOptions;
  readonly changed: () => void;
  readonly failed: (error: PlaybackError) => void;
}

export interface PlaybackEngine {
  readonly kind: EngineKind;
  attach(): void;
  destroy(): void;
  features(): EngineFeatures;
  selectQuality?(level: number | "auto"): void;
  selectAudio?(id: number): void;
  selectSubtitle?(id: number | "off"): void;
  startLoading?(): void;
}

export type EngineFactory = (context: EngineContext) => PlaybackEngine | null;

const policyMarker = "HLS_REQUEST_POLICY";

function requestPolicy(policy: RequestOptions, source: URL) {
  const allowed = new Set(policy.allowedOrigins);
  if (
    !allowed.has(source.origin) ||
    [...allowed].some((origin) => {
      const parsed = sourceUrl(origin, source.href);
      return (
        parsed?.origin !== origin ||
        (parsed.protocol !== "https:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
      );
    })
  )
    return null;

  return async (
    { url }: { url: string },
    init: RequestInit,
  ): Promise<Request> => {
    const target = sourceUrl(url, source.href);
    if (!target || !allowed.has(target.origin)) throw new Error(policyMarker);
    try {
      const headers = new Headers(init.headers);
      new Headers(policy.headers?.(new URL(target.href))).forEach(
        (value, name) => headers.set(name, value),
      );
      return new Request(target.href, {
        ...init,
        headers,
        mode: "cors",
        redirect: "error",
        referrerPolicy: "no-referrer",
        credentials: policy.credentials ?? "same-origin",
      });
    } catch {
      throw new Error(policyMarker);
    }
  };
}

function hlsEngine({
  video,
  url,
  options,
  changed,
  failed,
}: EngineContext): PlaybackEngine {
  const policy = options.request;
  const fetchSetup = policy && requestPolicy(policy, url);
  const kind = "hls.js";
  const rejectPolicy = policy && !fetchSetup;
  const defaultLoader = Hls.DefaultConfig.loader;
  const hls = rejectPolicy
    ? null
    : new Hls({
        ...options.hlsConfig,
        ...(options.lowLatency === undefined
          ? {}
          : { lowLatencyMode: options.lowLatency }),
        ...(fetchSetup
          ? {
              loader: defaultLoader,
              fLoader: undefined,
              pLoader: undefined,
              progressive: true,
              fetchSetup,
              xhrSetup: undefined,
              emeEnabled: false,
              enableInterstitialPlayback: false,
            }
          : {}),
        debug: false,
      });
  let active = true;
  let live: EngineFeatures["live"];
  let metadata: EngineFeatures = {};

  function refresh() {
    if (!active || !hls) return;
    const tracks = (
      list: typeof hls.audioTracks,
      index: number,
    ): TrackState => ({
      tracks: list.map(({ name, lang }, id) => ({
        id,
        label: name,
        language: lang || null,
      })),
      selected: index < 0 ? null : index,
    });
    metadata = {
      quality: {
        levels: hls.levels.map(({ bitrate, width, height }, id) => ({
          id,
          bitrate,
          width,
          height,
        })),
        mode: hls.levels.length
          ? hls.autoLevelEnabled
            ? "auto"
            : "manual"
          : "unavailable",
        selected: hls.manualLevel < 0 ? null : hls.manualLevel,
        current: hls.currentLevel < 0 ? null : hls.currentLevel,
      },
      audio: tracks(hls.audioTracks, hls.audioTrack),
      subtitles: tracks(
        hls.subtitleTracks,
        hls.subtitleDisplay ? hls.subtitleTrack : -1,
      ),
      live: live && { ...live, syncPosition: hls.liveSyncPosition },
    };
    changed();
  }

  return {
    kind,
    attach() {
      if (
        !hls ||
        (policy &&
          (!hls.config.progressive || hls.config.loader === defaultLoader))
      ) {
        failed(failure("request-policy", kind));
        return;
      }
      const events = Hls.Events;
      for (const event of [
        events.MANIFEST_PARSED,
        events.LEVELS_UPDATED,
        events.LEVEL_SWITCHED,
        events.AUDIO_TRACKS_UPDATED,
        events.AUDIO_TRACK_SWITCHED,
        events.AUDIO_TRACK_SWITCHING,
        events.SUBTITLE_TRACKS_UPDATED,
        events.SUBTITLE_TRACK_SWITCH,
      ] as const)
        hls.on(event, () => queueMicrotask(refresh));
      hls.on(events.LEVEL_UPDATED, (_event, { details }) => {
        live = { isLive: details.live, edge: details.edge, syncPosition: null };
        queueMicrotask(refresh);
      });
      hls.on(events.ERROR, (_event, data) => {
        if (!active) return;
        const error =
          policy &&
          data.response?.code === 0 &&
          data.response.text === policyMarker
            ? failure("request-policy", kind)
            : classifyHlsError(data);
        failed(error);
      });
      hls.loadSource(url.href);
      if (active) hls.attachMedia(video);
    },
    destroy() {
      active = false;
      hls?.destroy();
    },
    features: () => metadata,
    selectQuality(level) {
      if (!hls) return;
      hls.nextLevel = level === "auto" ? -1 : level;
      refresh();
    },
    selectAudio(id) {
      if (!hls) return;
      hls.audioTrack = id;
      refresh();
    },
    selectSubtitle(id) {
      if (!hls) return;
      hls.subtitleTrack = id === "off" ? -1 : id;
      hls.subtitleDisplay = id !== "off";
      refresh();
    },
    startLoading: () => hls?.startLoad(),
  };
}

function nativeEngine({ video, url, changed }: EngineContext): PlaybackEngine {
  const list = video.textTracks;
  const tracks = () =>
    Array.from(list).filter(
      (track) => track.kind === "subtitles" || track.kind === "captions",
    );
  let subtitles: TrackState | undefined;
  function refresh() {
    const current = tracks();
    const selected = current.findIndex(({ mode }) => mode === "showing");
    subtitles = {
      tracks: current.map(({ label, language }, id) => ({
        id,
        label,
        language: language || null,
      })),
      selected: selected < 0 ? null : selected,
    };
    changed();
  }
  return {
    kind: "native",
    attach() {
      list.addEventListener?.("addtrack", refresh);
      list.addEventListener?.("removetrack", refresh);
      list.addEventListener?.("change", refresh);
      video.src = url.href;
      refresh();
    },
    destroy() {
      list.removeEventListener?.("addtrack", refresh);
      list.removeEventListener?.("removetrack", refresh);
      list.removeEventListener?.("change", refresh);
      if (video.getAttribute("src") === url.href) {
        video.removeAttribute("src");
        video.load();
      }
    },
    features: () => ({ subtitles }),
    selectSubtitle(id) {
      tracks().forEach((track, index) => {
        track.mode = index === id ? "showing" : "disabled";
      });
      refresh();
    },
  };
}

export const browserEngineFactory: EngineFactory = (context) => {
  const { video, options } = context;
  const mode = options.engine ?? "auto";
  const kind = selectEngine(
    mode,
    mode !== "native" && Hls.isSupported(),
    mode !== "hls.js" &&
      Boolean(
        video.canPlayType("application/vnd.apple.mpegurl") ||
        video.canPlayType("application/x-mpegURL"),
      ),
    Boolean(options.request),
  );
  if (kind === "hls.js") return hlsEngine(context);
  if (kind === "native") return nativeEngine(context);
  return null;
};
