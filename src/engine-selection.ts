import type { EngineKind, PlayerOptions } from "./types.js";

export function selectEngine(
  mode: PlayerOptions["engine"],
  mse: boolean,
  native: boolean,
  requiresMse = false,
): EngineKind | null {
  if (mode !== "native" && mse) return "hls.js";
  if (mode !== "hls.js" && !requiresMse && native) return "native";
  return null;
}
