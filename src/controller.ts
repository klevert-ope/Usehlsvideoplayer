import {
  browserEngineFactory,
  type EngineFactory,
  type PlaybackEngine,
} from "./engines.js";
import { classifyMediaError, failure, sourceUrl } from "./errors.js";
import { createMetrics } from "./metrics.js";
import { canTransition, initialState } from "./state.js";
import type {
  MediaRange,
  PlaybackController,
  PlaybackError,
  PlaybackEvent,
  PlaybackMetrics,
  PlaybackState,
  PlayerOptions,
  RecoveryState,
} from "./types.js";

interface Source {
  video: HTMLVideoElement;
  url: URL;
  options: PlayerOptions;
  attempt: number;
  wantsPlay: boolean;
  loadRequested: boolean;
  resumeAt: number | null;
  timer?: ReturnType<typeof setTimeout>;
  metricsTimer?: ReturnType<typeof setInterval>;
  metrics?: ReturnType<typeof createMetrics>;
  session?: Session;
}

interface Session {
  engine?: PlaybackEngine;
  removeListeners?: () => void;
  lastSample: number;
  ready: boolean;
  active: boolean;
  playRequest: number;
}

// The two package formats can be loaded into the same realm. Create their
// shared weak registry lazily and hold a claim until teardown returns.
const ownershipKey = Symbol.for("usehlsvideoplayer.mediaOwners.v2");
function getMediaOwners() {
  const realm = globalThis as typeof globalThis & {
    [ownershipKey]?: WeakMap<HTMLVideoElement, Source>;
  };
  return (realm[ownershipKey] ??= new WeakMap());
}

function ranges(
  list: TimeRanges,
  old: readonly MediaRange[],
): readonly MediaRange[] {
  const result = Array.from({ length: list.length }, (_, index) => ({
    start: list.start(index),
    end: list.end(index),
  }));
  return result.length === old.length &&
    result.every(
      ({ start, end }, index) =>
        start === old[index]?.start && end === old[index]?.end,
    )
    ? old
    : result;
}

function clampSeek(
  seconds: number,
  seekable: readonly MediaRange[],
  duration: number | null,
): number | null {
  if (!Number.isFinite(seconds)) return null;
  if (!seekable.length)
    return duration === null ? null : Math.min(duration, Math.max(0, seconds));
  let closest = seekable[0]!.start;
  for (const { start, end } of seekable) {
    const candidate = Math.max(start, Math.min(end, seconds));
    if (Math.abs(candidate - seconds) < Math.abs(closest - seconds))
      closest = candidate;
  }
  return closest;
}

function bounded(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

export function createPlaybackController(
  factory: EngineFactory = browserEngineFactory,
): PlaybackController {
  let state = initialState();
  let metrics: PlaybackMetrics | null = null;
  let source: Source | undefined;
  let revision = 0;
  let destroyed = false;
  let adapterDepth = 0;
  let pendingSource: (() => void) | undefined;
  let pendingDestroy = false;
  let mutationQueued = false;
  const subscribers = new Set<() => void>();
  const metricSubscribers = new Set<() => void>();
  const events = new Set<(event: PlaybackEvent) => void>();

  function inAdapter<T>(action: () => T): T {
    adapterDepth++;
    try {
      return action();
    } finally {
      adapterDepth--;
    }
  }

  function queueMutation() {
    if (mutationQueued) return;
    mutationQueued = true;
    queueMicrotask(() => {
      mutationQueued = false;
      const next = pendingSource;
      pendingSource = undefined;
      if (pendingDestroy) destroy();
      else next?.();
    });
  }

  function subscribe<T>(listeners: Set<T>, listener: T): () => void {
    if (destroyed) return () => {};
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function notify<T>(
    listeners: Set<(value: T) => void>,
    value: T,
    current: () => boolean,
  ) {
    for (const listener of [...listeners]) {
      if (!current()) break;
      if (listeners.has(listener)) {
        try {
          listener(value);
        } catch {
          /* An observer cannot interrupt playback or teardown. */
        }
      }
    }
  }

  function emit(event: PlaybackEvent) {
    const current = revision;
    notify(events, event, () => revision === current);
  }

  function publish(next: PlaybackState) {
    const previous = state;
    if (!canTransition(previous.status, next.status)) return;
    if (
      Object.keys(next).every((key) =>
        Object.is(
          next[key as keyof PlaybackState],
          previous[key as keyof PlaybackState],
        ),
      )
    )
      return;
    state = next;
    if (previous.status !== next.status) {
      source?.metrics?.update(next.status);
      emit({ type: "transition", from: previous.status, to: next.status });
    }
    notify(subscribers, undefined, () => state === next);
  }

  function publishMetrics(next: PlaybackMetrics | null) {
    if (metrics === next) return;
    metrics = next;
    notify(metricSubscribers, undefined, () => metrics === next);
  }

  function stopSession(owner: Source) {
    const session = owner.session;
    owner.session = undefined;
    if (!session) return;
    session.active = false;
    session.removeListeners?.();
    try {
      inAdapter(() => session.engine?.destroy());
    } catch {
      /* Upstream teardown errors must not escape. */
    }
  }

  function release(owner: Source) {
    clearTimeout(owner.timer);
    clearInterval(owner.metricsTimer);
    try {
      stopSession(owner);
    } finally {
      relinquish(owner);
    }
  }

  function relinquish(owner: Source) {
    const owners = getMediaOwners();
    if (owners.get(owner.video) === owner) owners.delete(owner.video);
  }

  function active(owner: Source, session: Session): boolean {
    return (
      !destroyed &&
      !pendingDestroy &&
      !pendingSource &&
      source === owner &&
      owner.session === session &&
      session.active
    );
  }

  function sample(
    owner: Source,
    session: Session,
    status = state.status,
    patch: Partial<PlaybackState> = {},
  ) {
    if (!active(owner, session)) return;
    const { video } = owner;
    const features = inAdapter(() => session.engine?.features());
    if (!active(owner, session)) return;
    const seekable = ranges(video.seekable, state.seekable);
    const lastRange = seekable[seekable.length - 1];
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const isLive =
      features?.live?.isLive ??
      (video.duration === Infinity ? true : duration === null ? null : false);
    const edge = isLive
      ? (features?.live?.edge ?? lastRange?.end ?? null)
      : null;
    const sync = isLive
      ? (features?.live?.syncPosition ??
        (lastRange ? Math.max(lastRange.start, lastRange.end - 0.1) : null))
      : null;
    const latency =
      edge === null ? null : Math.max(0, edge - video.currentTime);
    const live = {
      isLive,
      edge,
      syncPosition: sync,
      latency,
      atEdge: sync !== null && video.currentTime >= sync - 2,
      canSeekToLive: sync !== null && seekable.length > 0,
    };
    const sameLive = Object.keys(live).every(
      (key) =>
        live[key as keyof typeof live] === state.live[key as keyof typeof live],
    );
    publish({
      ...state,
      ...patch,
      status,
      duration,
      seekable,
      currentTime: video.currentTime,
      engine: session.engine?.kind ?? state.engine,
      buffered: ranges(video.buffered, state.buffered),
      muted: video.muted,
      volume: video.volume,
      playbackRate: video.playbackRate,
      quality: features?.quality ?? state.quality,
      audio: features?.audio ?? state.audio,
      subtitles: features?.subtitles ?? state.subtitles,
      live: sameLive ? state.live : live,
    });
  }

  function recoveryState(
    owner: Source,
    phase: RecoveryState["phase"],
    limit: number,
    delayMs = 0,
  ): RecoveryState {
    return { attempt: owner.attempt, limit, phase, delayMs };
  }

  function fail(owner: Source, error: PlaybackError) {
    if (source !== owner || destroyed) return;
    if (!error.fatal) {
      emit({ type: "error", error });
      return;
    }
    clearTimeout(owner.timer);
    const config = owner.options.recovery;
    const limit = config === false ? 0 : bounded(config?.maxAttempts, 2, 0, 5);
    const video = owner.video;
    if (owner.session?.ready) owner.resumeAt = video.currentTime;
    stopSession(owner);
    if (source !== owner || destroyed || pendingDestroy || pendingSource)
      return;
    if (error.retryable && owner.attempt < limit) {
      owner.attempt++;
      const base = bounded(
        config === false ? undefined : config?.baseDelayMs,
        500,
        0,
        30_000,
      );
      const max = bounded(
        config === false ? undefined : config?.maxDelayMs,
        5000,
        0,
        60_000,
      );
      const delay = Math.min(
        max,
        Math.round(
          base * 2 ** (owner.attempt - 1) * (0.75 + Math.random() * 0.5),
        ),
      );
      const recovery = recoveryState(owner, "scheduled", limit, delay);
      owner.timer = setTimeout(() => {
        if (source !== owner || destroyed) return;
        const running = recoveryState(owner, "running", limit);
        publish({ ...state, recovery: running });
        if (source !== owner || destroyed) return;
        emit({ type: "recovery", recovery: running });
        if (source !== owner || destroyed) return;
        startSession(owner, true);
      }, delay);
      publish({ ...state, status: "recovering", error, recovery });
      if (source === owner) emit({ type: "recovery", recovery });
    } else {
      relinquish(owner);
      clearInterval(owner.metricsTimer);
      const recovery =
        owner.attempt > 0 ? recoveryState(owner, "exhausted", limit) : null;
      publish({ ...state, status: "error", error, recovery });
      if (source === owner && owner.metrics)
        publishMetrics(owner.metrics.read(state.live.latency));
      if (source === owner && recovery) emit({ type: "recovery", recovery });
    }
    if (source === owner) emit({ type: "error", error });
  }

  async function play(owner: Source, session: Session): Promise<boolean> {
    owner.wantsPlay = true;
    const request = ++session.playRequest;
    try {
      await owner.video.play();
      return active(owner, session) && session.playRequest === request;
    } catch (cause) {
      if (active(owner, session) && session.playRequest === request) {
        const name =
          cause instanceof Object && "name" in cause ? cause.name : "";
        if (name === "AbortError") return false;
        owner.wantsPlay = false;
        const error = failure(
          name === "NotAllowedError" ? "playback-blocked" : "unknown",
          session.engine?.kind ?? null,
          false,
          false,
        );
        publish({ ...state, error });
        if (active(owner, session)) emit({ type: "error", error });
      }
      return false;
    }
  }

  function startSession(owner: Source, recovering: boolean) {
    const { video, url, options } = owner;
    const session: Session = {
      lastSample: -Infinity,
      ready: false,
      active: true,
      playRequest: 0,
    };
    owner.session = session;
    const report = (error: PlaybackError) =>
      queueMicrotask(() => {
        if (active(owner, session)) fail(owner, error);
      });
    try {
      const engine = inAdapter(() =>
        factory({
          video,
          url,
          options,
          changed: () => {
            if (session.engine) sample(owner, session);
          },
          failed: report,
        }),
      );
      if (!active(owner, session)) {
        inAdapter(() => engine?.destroy());
        return;
      }
      if (!engine) {
        fail(owner, failure("unsupported", null));
        return;
      }
      session.engine = engine;
      function ready() {
        if (!active(owner, session) || session.ready) return;
        session.ready = true;
        clearTimeout(owner.timer);
        if (owner.resumeAt !== null) {
          const position = clampSeek(
            owner.resumeAt,
            ranges(video.seekable, []),
            Number.isFinite(video.duration) ? video.duration : null,
          );
          if (position !== null) video.currentTime = position;
          owner.resumeAt = null;
        }
        const recovery =
          recovering && state.recovery
            ? recoveryState(owner, "recovered", state.recovery.limit)
            : state.recovery;
        const status =
          state.status === "loading" ||
          state.status === "recovering" ||
          (state.status === "buffering" && video.paused)
            ? "ready"
            : state.status;
        sample(owner, session, status, { error: null, recovery });
        if (!active(owner, session)) return;
        if (recovering && recovery) emit({ type: "recovery", recovery });
        if (active(owner, session) && owner.wantsPlay && video.paused)
          void play(owner, session);
      }
      const handlers: Record<string, () => void> = {
        canplay: () => {
          if (video.readyState >= 3) ready();
        },
        playing: () => {
          if (!active(owner, session) || video.paused) return;
          ready();
          if (!active(owner, session)) return;
          owner.wantsPlay = true;
          sample(owner, session, "playing", { error: null });
        },
        play: () => {
          if (active(owner, session) && !video.paused) owner.wantsPlay = true;
        },
        pause: () => {
          if (!active(owner, session) || !video.paused || video.ended) return;
          if (session.ready) {
            owner.wantsPlay = false;
            sample(owner, session, "paused");
          }
        },
        waiting: () => {
          if (!video.paused && !video.seeking && state.status !== "recovering")
            sample(owner, session, "buffering");
        },
        stalled: () => {
          if (video.readyState < 3) handlers.waiting?.();
        },
        seeking: () => {
          if (session.ready && video.seeking) sample(owner, session, "seeking");
        },
        seeked: () => {
          if (session.ready && !video.seeking)
            sample(
              owner,
              session,
              video.ended
                ? "ended"
                : video.paused
                  ? "paused"
                  : video.readyState >= 3
                    ? "playing"
                    : "buffering",
            );
        },
        ended: () => {
          if (!active(owner, session) || !video.ended) return;
          owner.wantsPlay = false;
          sample(owner, session, "ended");
        },
        error: () => {
          if (video.error && video.error.code !== 1)
            report(classifyMediaError(video.error.code, engine.kind));
        },
        timeupdate: () => {
          const now = performance.now();
          if (now - session.lastSample >= 250) {
            session.lastSample = now;
            sample(owner, session);
          }
        },
      };
      for (const name of [
        "progress",
        "loadedmetadata",
        "durationchange",
        "volumechange",
        "ratechange",
      ]) {
        handlers[name] = () => sample(owner, session);
      }
      const listeners = Object.entries(handlers);
      session.removeListeners = () => {
        for (const [name, handler] of listeners)
          video.removeEventListener(name, handler);
      };
      for (const [name, handler] of listeners)
        video.addEventListener(name, handler);
      publish({
        ...initialState(recovering ? "recovering" : "loading"),
        engine: engine.kind,
        error: state.error,
        recovery: state.recovery,
        muted: video.muted,
        volume: video.volume,
        playbackRate: video.playbackRate,
      });
      if (!active(owner, session)) return;
      if (recovering) {
        const timeout =
          options.recovery === false
            ? undefined
            : options.recovery?.attemptTimeoutMs;
        owner.timer = setTimeout(
          () => {
            if (active(owner, session))
              fail(owner, failure("network", engine.kind, true));
          },
          bounded(timeout, 30_000, 1, 120_000),
        );
      }
      inAdapter(() => engine.attach());
      if (active(owner, session) && recovering && owner.loadRequested)
        inAdapter(() => engine.startLoading?.());
    } catch {
      if (active(owner, session))
        fail(owner, failure("setup", session.engine?.kind ?? null));
    }
  }

  function setSource(
    video: HTMLVideoElement | null,
    src?: string | null,
    options: PlayerOptions = {},
  ) {
    if (destroyed || pendingDestroy) return;
    if (adapterDepth) {
      pendingSource = () => setSource(video, src, options);
      queueMutation();
      return;
    }
    pendingSource = undefined;
    const current = ++revision;
    const previous = source;
    source = undefined;
    if (previous) release(previous);
    if (revision !== current) return;
    if (state.status !== "idle") publish(initialState());
    if (revision !== current) return;
    publishMetrics(null);
    if (
      revision !== current ||
      pendingDestroy ||
      pendingSource ||
      !video ||
      !src
    )
      return;
    publish(initialState("initialising"));
    if (revision !== current) return;
    const url = sourceUrl(src, video.ownerDocument.baseURI);
    if (!url || !src.trim()) {
      const error = failure("invalid-source", null);
      publish({ ...state, status: "error", error });
      if (revision === current) emit({ type: "error", error });
      return;
    }
    const owner: Source = {
      video,
      url,
      options: {
        ...options,
        hlsConfig: options.hlsConfig && { ...options.hlsConfig },
        recovery: options.recovery && { ...options.recovery },
        request: options.request && {
          ...options.request,
          allowedOrigins: [...options.request.allowedOrigins],
        },
      },
      attempt: 0,
      wantsPlay: options.autoPlay ?? false,
      loadRequested: false,
      resumeAt: null,
    };
    source = owner;
    const mediaOwners = getMediaOwners();
    if (mediaOwners.has(video)) {
      fail(owner, failure("setup", null));
      return;
    }
    mediaOwners.set(video, owner);
    if (options.metrics) {
      owner.metrics = createMetrics(video);
      owner.metricsTimer = setInterval(() => {
        if (source === owner)
          publishMetrics(owner.metrics!.read(state.live.latency));
      }, 1000);
      publishMetrics(owner.metrics.read(null));
    }
    if (source === owner && !destroyed && !pendingDestroy && !pendingSource)
      startSession(owner, false);
  }

  function command(
    action: (
      video: HTMLVideoElement,
      engine: PlaybackEngine,
      owner: Source,
    ) => boolean,
  ): boolean {
    const owner = source;
    const session = owner?.session;
    if (!owner || !session?.engine || !active(owner, session)) return false;
    try {
      const engine = session.engine;
      const applied = inAdapter(() => action(owner.video, engine, owner));
      if (!active(owner, session)) return false;
      if (applied) sample(owner, session);
      return applied;
    } catch {
      return false;
    }
  }

  function seek(seconds: number): boolean {
    return command((video) => {
      const target = clampSeek(seconds, state.seekable, state.duration);
      if (target === null) return false;
      video.currentTime = target;
      return true;
    });
  }

  function destroy() {
    if (destroyed) return;
    if (adapterDepth) {
      pendingDestroy = true;
      pendingSource = undefined;
      queueMutation();
      return;
    }
    destroyed = true;
    pendingDestroy = false;
    pendingSource = undefined;
    revision++;
    const previous = source;
    source = undefined;
    if (previous) release(previous);
    publish(initialState("destroyed"));
    publishMetrics(null);
    subscribers.clear();
    metricSubscribers.clear();
    events.clear();
  }

  return {
    getState: () => state,
    getMetrics: () => metrics,
    subscribe: (listener) => subscribe(subscribers, listener),
    subscribeMetrics: (listener) => subscribe(metricSubscribers, listener),
    onEvent: (listener) => subscribe(events, listener),
    setSource,
    controls: {
      play: () =>
        source?.session?.engine && active(source, source.session)
          ? play(source, source.session)
          : Promise.resolve(false),
      pause: () => {
        if (source && state.status === "recovering" && !source.session) {
          source.wantsPlay = false;
          return true;
        }
        return command((video, _engine, owner) => {
          owner.wantsPlay = false;
          if (owner.session) owner.session.playRequest++;
          video.pause();
          return true;
        });
      },
      seek,
      setMuted: (muted) =>
        command((video) => {
          video.muted = muted;
          return true;
        }),
      setVolume: (volume) =>
        Number.isFinite(volume) &&
        command((video) => {
          video.volume = Math.min(1, Math.max(0, volume));
          return true;
        }),
      setPlaybackRate: (rate) =>
        Number.isFinite(rate) &&
        rate > 0 &&
        command((video) => {
          video.playbackRate = rate;
          return true;
        }),
      setQuality: (level) =>
        command((_video, engine) => {
          if (
            !engine.selectQuality ||
            state.quality.mode === "unavailable" ||
            (level !== "auto" &&
              !state.quality.levels.some(({ id }) => id === level))
          )
            return false;
          engine.selectQuality(level);
          return true;
        }),
      setAudioTrack: (id) =>
        command((_video, engine) => {
          if (
            !engine.selectAudio ||
            !state.audio.tracks.some((track) => track.id === id)
          )
            return false;
          engine.selectAudio(id);
          return true;
        }),
      setSubtitleTrack: (id) =>
        command((_video, engine) => {
          if (
            !engine.selectSubtitle ||
            (id !== "off" &&
              !state.subtitles.tracks.some((track) => track.id === id))
          )
            return false;
          engine.selectSubtitle(id);
          return true;
        }),
      seekToLive: () =>
        state.live.canSeekToLive &&
        state.live.syncPosition !== null &&
        seek(state.live.syncPosition),
      startLoading: () =>
        command((_video, engine, owner) => {
          if (!engine.startLoading) return false;
          engine.startLoading();
          owner.loadRequested = true;
          return true;
        }),
      retry: () => {
        if (!source || state.status !== "error") return false;
        setSource(source.video, source.url.href, source.options);
        return true;
      },
    },
    destroy,
  };
}
