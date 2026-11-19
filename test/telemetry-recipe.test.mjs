import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("the documented telemetry bridge records each source once and unsubscribes", async () => {
  const guide = readFileSync(
    new URL("../docs/usage.md", import.meta.url),
    "utf8",
  );
  const snippet = guide
    .split("## Bridge application telemetry")[1]
    ?.match(/```ts\r?\n([\s\S]*?)```/)?.[1];
  assert.ok(snippet, "The telemetry recipe must include a TypeScript snippet");
  const { outputText } = ts.transpileModule(snippet, {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  });
  const { subscribeToPlaybackMetrics } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );

  const records = [];
  const meter = {
    createCounter(name) {
      return {
        add: (value, attributes) => records.push({ name, value, attributes }),
      };
    },
    createHistogram(name, { unit }) {
      return {
        record(value, attributes) {
          assert.equal(attributes, undefined);
          records.push({ name, value, unit });
        },
      };
    },
  };
  const listeners = new Set();
  const observers = new Set();
  let metrics = null;
  const player = {
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeMetrics(observer) {
      observers.add(observer);
      return () => observers.delete(observer);
    },
    getMetrics: () => metrics,
  };
  const publish = (snapshot) => {
    metrics = snapshot;
    for (const observer of observers) observer();
  };
  const emit = (event) => {
    for (const listener of listeners) listener(event);
  };

  const stop = subscribeToPlaybackMetrics(player, meter);
  const error = {
    type: "error",
    error: {
      code: "network",
      message: "Synthetic private URL",
      httpStatus: 503,
    },
  };
  emit(error);
  for (const phase of ["scheduled", "running", "recovered"]) {
    emit({ type: "recovery", recovery: { phase, action: "restart-loading" } });
  }
  publish({ startupMs: null });
  publish({ startupMs: 100, firstFrameMs: null });
  publish({ startupMs: 100, firstFrameMs: 125, url: "synthetic private URL" });
  publish({ startupMs: 100, firstFrameMs: 125 });
  publish(null);
  publish({ startupMs: 100, firstFrameMs: 125 });
  stop();
  emit(error);
  publish(null);
  publish({ startupMs: 100, firstFrameMs: 125 });

  assert.deepEqual(records, [
    { name: "hls.playback.errors", value: 1, attributes: { code: "network" } },
    {
      name: "hls.playback.recovery.attempts",
      value: 1,
      attributes: { action: "restart-loading" },
    },
    { name: "hls.playback.startup.duration", value: 100, unit: "ms" },
    { name: "hls.playback.first_frame.duration", value: 125, unit: "ms" },
    { name: "hls.playback.startup.duration", value: 100, unit: "ms" },
    { name: "hls.playback.first_frame.duration", value: 125, unit: "ms" },
  ]);
  assert.equal(listeners.size, 0);
  assert.equal(observers.size, 0);
});
