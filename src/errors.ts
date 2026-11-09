import type { ErrorData } from "hls.js";
import type { EngineKind, ErrorCode, PlaybackError } from "./types.js";

const messages: Record<ErrorCode, string> = {
  "invalid-source":
    "The source must be an HTTP(S) URL without embedded credentials.",
  unsupported: "The requested HLS playback engine is unavailable.",
  setup: "The playback engine could not be initialised.",
  manifest: "An HLS playlist could not be loaded or parsed.",
  network: "A streaming request failed.",
  segment: "An HLS media segment could not be loaded or processed.",
  decode: "The browser could not decode or buffer this media.",
  authentication: "The streaming server denied access.",
  "request-policy":
    "The streaming request was blocked by the configured policy.",
  "playback-blocked": "The browser requires user interaction before playing.",
  unknown: "Playback failed.",
};

export function failure(
  code: ErrorCode,
  engine: EngineKind | null,
  retryable = false,
  fatal = true,
  httpStatus?: number,
): PlaybackError {
  return {
    code,
    message: messages[code],
    engine,
    fatal,
    retryable,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

export function classifyHlsError(data: ErrorData): PlaybackError {
  const status = data.response?.code;
  const http =
    typeof status === "number" &&
    Number.isInteger(status) &&
    status >= 100 &&
    status <= 599
      ? status
      : undefined;
  const details = data.details ?? "";
  const playlist = /^(manifest|level|audioTrack|subtitleTrack)/.test(details);
  const segment = /^(frag|key)/.test(details);
  const transient =
    http === undefined || http === 408 || http === 429 || http >= 500;
  let code: ErrorCode = "unknown";
  let retryable = false;

  if (http === 401 || http === 403) code = "authentication";
  else if (/incompatibleCodecs|bufferAddCodec/i.test(details))
    code = "unsupported";
  else if (playlist) {
    code = "manifest";
    retryable = /LoadError|LoadTimeOut/.test(details) && transient;
  } else if (segment) {
    code = "segment";
    retryable = /LoadError|LoadTimeOut/.test(details) && transient;
  } else if (data.type === "mediaError") {
    code = "decode";
    retryable = true;
  } else if (data.type === "networkError") {
    code = "network";
    retryable = transient;
  }

  return failure(code, "hls.js", retryable, Boolean(data.fatal), http);
}

export function classifyMediaError(
  code: number | undefined,
  engine: EngineKind,
): PlaybackError {
  if (code === 2) return failure("network", engine, true);
  if (code === 3) return failure("decode", engine, true);
  if (code === 4) return failure("unsupported", engine);
  return failure("unknown", engine);
}

export function sourceUrl(source: string, base: string): URL | null {
  try {
    const url = new URL(source, base);
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}
