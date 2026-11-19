import type { PlayerOptions } from "./types.js";

/** Capture session settings while preserving hls.js values and callbacks. */
export function snapshotPlayerOptions(options: PlayerOptions): PlayerOptions {
  const { hlsConfig, recovery, quality, request } = options;
  return {
    ...options,
    hlsConfig: hlsConfig && { ...hlsConfig },
    recovery: recovery && { ...recovery },
    quality: quality && { ...quality },
    request: request && {
      ...request,
      allowedOrigins: [...request.allowedOrigins],
      refreshStatusCodes: request.refreshStatusCodes && [
        ...request.refreshStatusCodes,
      ],
    },
  };
}
