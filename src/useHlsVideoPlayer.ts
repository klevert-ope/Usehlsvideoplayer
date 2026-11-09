"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { HlsConfig } from "hls.js";
import { createPlaybackController } from "./controller.js";
import { initialState } from "./state.js";
import type {
  PlaybackController,
  PlaybackError,
  PlaybackEvent,
  PlaybackState,
  PlaybackStore,
  PlayerOptions,
} from "./types.js";

export interface UseHlsPlayerOptions extends PlayerOptions {
  src?: string | null;
  onEvent?: (event: PlaybackEvent) => void;
}

type Session = {
  video: HTMLVideoElement | null;
  src: string | null | undefined;
  options: PlayerOptions;
};

const serverState = initialState();
const getServerMetrics = () => null;
const identity = (state: PlaybackState) => state;

function equalFields<T extends object>(a?: T, b?: T): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof T)[];
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        Object.is(a[key], b[key]),
    )
  );
}

function sameOptions(a: PlayerOptions, b: PlayerOptions): boolean {
  const {
    hlsConfig: hlsA,
    request: requestA,
    recovery: recoveryA,
    ...simpleA
  } = a;
  const {
    hlsConfig: hlsB,
    request: requestB,
    recovery: recoveryB,
    ...simpleB
  } = b;
  return (
    equalFields(simpleA, simpleB) &&
    equalFields(hlsA, hlsB) &&
    (recoveryA === false || recoveryB === false
      ? recoveryA === recoveryB
      : equalFields(recoveryA, recoveryB)) &&
    (requestA === requestB ||
      Boolean(
        requestA &&
        requestB &&
        requestA.credentials === requestB.credentials &&
        requestA.headers === requestB.headers &&
        requestA.allowedOrigins.length === requestB.allowedOrigins.length &&
        requestA.allowedOrigins.every(
          (origin, index) => origin === requestB.allowedOrigins[index],
        ),
      ))
  );
}

function useSession(
  getVideo: () => HTMLVideoElement | null,
  options: UseHlsPlayerOptions,
): PlaybackController {
  const [controller] = useState(() => createPlaybackController());
  const previous = useRef<Session | null>(null);
  const callback = useRef(options.onEvent);

  useEffect(() => {
    const unsubscribe = controller.onEvent((event) =>
      callback.current?.(event),
    );
    return () => {
      unsubscribe();
      previous.current = null;
      controller.setSource(null);
    };
  }, [controller]);

  useEffect(() => {
    const { src, onEvent, ...config } = options;
    callback.current = onEvent;
    const video = getVideo();
    const last = previous.current;
    if (
      last &&
      last.video === video &&
      last.src === src &&
      sameOptions(last.options, config)
    )
      return;
    previous.current = {
      video,
      src,
      options: {
        ...config,
        request: config.request && {
          ...config.request,
          allowedOrigins: [...config.request.allowedOrigins],
        },
      },
    };
    controller.setSource(video, src, config);
  });

  return controller;
}

/** Owns the video attachment without subscribing its component to state changes. */
export function useHlsController(options: UseHlsPlayerOptions) {
  const [video, videoRef] = useState<HTMLVideoElement | null>(null);
  const controller = useSession(() => video, options);
  const store: PlaybackStore & Pick<PlaybackController, "onEvent"> = controller;
  return { videoRef, store, controls: controller.controls };
}

export function usePlaybackState(store: PlaybackStore): PlaybackState;
export function usePlaybackState<T>(
  store: PlaybackStore,
  selector: (state: PlaybackState) => T,
  isEqual?: (previous: T, next: T) => boolean,
): T;
export function usePlaybackState<T>(
  store: PlaybackStore,
  selector?: (state: PlaybackState) => T,
  isEqual: (previous: T, next: T) => boolean = Object.is,
): PlaybackState | T {
  const [getSnapshot, getServerSnapshot] = useMemo(() => {
    const select = selector ?? identity;
    function cache(read: () => PlaybackState) {
      let snapshot: PlaybackState | undefined;
      let selected: PlaybackState | T;
      return () => {
        const next = read();
        if (snapshot === next) return selected;
        const result = select(next);
        const same =
          snapshot !== undefined &&
          (selector
            ? isEqual(selected as T, result as T)
            : Object.is(selected, result));
        snapshot = next;
        if (!same) selected = result;
        return selected;
      };
    }
    return [cache(store.getState), cache(() => serverState)];
  }, [store, selector, isEqual]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}

export function useHlsMetrics(store: PlaybackStore) {
  return useSyncExternalStore(
    store.subscribeMetrics,
    store.getMetrics,
    getServerMetrics,
  );
}

export function useHlsPlayer(options: UseHlsPlayerOptions) {
  const { videoRef, store, controls } = useHlsController(options);
  const state = usePlaybackState(store);
  const metrics = useHlsMetrics(store);
  const { quality, audio, subtitles, live, error } = state;
  return {
    videoRef,
    store,
    state,
    controls,
    quality,
    audio,
    subtitles,
    live,
    metrics,
    error,
  };
}

/** @deprecated Use PlaybackError. Legacy error payloads are now sanitised. */
export type HlsPlayerError =
  | { kind: "unsupported" }
  | { kind: "native" | "hls"; error: PlaybackError }
  | { kind: "setup"; cause: PlaybackError };

/** @deprecated Use UseHlsPlayerOptions. */
export type HlsPlayerOptions = Partial<HlsConfig> & {
  levelLoadingTimeOut?: number;
  manifestLoadingTimeOut?: number;
  onError?: (error: HlsPlayerError) => void;
};

/** @deprecated Use the inferred return type of useHlsPlayer. */
export type HlsPlayerResult = { videoRef: RefObject<HTMLVideoElement | null> };

/** @deprecated Use useHlsPlayer. The object ref and HLS-first selection remain available. */
export function useHlsVideoPlayer(
  src: string | null | undefined,
  options: HlsPlayerOptions = {},
): HlsPlayerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { onError, ...hlsConfig } = options;
  useSession(() => videoRef.current, {
    src,
    hlsConfig,
    recovery: false,
    onEvent: (event) => {
      if (event.type !== "error" || !event.error.fatal || !onError) return;
      const { error } = event;
      if (error.code === "unsupported" && error.engine === null)
        onError({ kind: "unsupported" });
      else if (error.code === "setup" || !error.engine)
        onError({ kind: "setup", cause: error });
      else
        onError({ kind: error.engine === "native" ? "native" : "hls", error });
    },
  });
  return { videoRef };
}

/** @deprecated Use useHlsPlayer. */
export const Usehlsplayer = useHlsVideoPlayer;
