import type { QualityPreferences } from "./types.js";

const positive = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;

/** A cap is a prefix of upstream's ladder, which need not be bitrate-sorted. */
export function qualitySelection(
  levels: readonly { height: number; bitrate: number }[],
  preferences: QualityPreferences,
) {
  const height = positive(preferences.maxHeight);
  const bitrate = positive(preferences.maxBitrate);
  const startup = positive(preferences.startBitrate);
  const firstExcluded = levels.findIndex(
    (level) =>
      (height !== undefined && (level.height <= 0 || level.height > height)) ||
      (bitrate !== undefined &&
        (level.bitrate <= 0 || level.bitrate > bitrate)),
  );
  const cap =
    height === undefined && bitrate === undefined
      ? -1
      : Math.max(0, firstExcluded < 0 ? levels.length - 1 : firstExcluded - 1);
  const last = cap < 0 ? levels.length - 1 : cap;
  let start: number | undefined;
  if (startup !== undefined && levels.length) {
    start = 0;
    let best = -1;
    for (let i = 0; i <= last; i++) {
      const value = levels[i]!.bitrate;
      if (value > 0 && value <= startup && value > best) {
        start = i;
        best = value;
      }
    }
  }
  return { cap, start };
}
