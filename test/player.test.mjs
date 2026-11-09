import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act as legacyAct } from "react-dom/test-utils";
import { renderToString } from "react-dom/server";

const require = createRequire(import.meta.url);
const Hls = require("hls.js");
const {
  Usehlsplayer,
  useHlsVideoPlayer,
  useHlsController,
  useHlsPlayer,
  usePlaybackState,
} = require("usehlsvideoplayer");
const { createElement, StrictMode } = React;
const act = React.act ?? legacyAct;

async function mount(t) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.self = dom.window;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.querySelector("#root");
  const root = createRoot(container);
  let mounted = true;
  const unmount = async () => {
    if (mounted) {
      mounted = false;
      await act(() => root.unmount());
    }
  };
  t.after(async () => {
    await unmount();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.self;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  });

  function Player({ source, options, id, show = true }) {
    const { videoRef } = useHlsVideoPlayer(source, options);
    return show ? createElement("video", { key: id, ref: videoRef }) : null;
  }

  return {
    renderNode: (node) =>
      act(() => root.render(createElement(StrictMode, null, node))),
    get video() {
      return container.querySelector("video");
    },
    render: (props) =>
      act(() =>
        root.render(
          createElement(StrictMode, null, createElement(Player, props)),
        ),
      ),
    unmount,
  };
}

test("both package entries expose the old and new hook names and support SSR", async () => {
  const esm = await import("usehlsvideoplayer");
  assert.equal(Usehlsplayer, useHlsVideoPlayer);
  assert.equal(esm.Usehlsplayer, esm.useHlsVideoPlayer);
  function Player() {
    const { videoRef } = esm.useHlsVideoPlayer("/stream.m3u8");
    assert.equal(videoRef.current, null);
    return createElement("video", { ref: videoRef });
  }
  assert.equal(renderToString(createElement(Player)), "<video></video>");
});

test("Strict Mode and stream changes dispose each HLS session once", async (t) => {
  const player = await mount(t);
  const loaded = [];
  const destroyed = [];
  const errors = [];
  t.mock.method(Hls, "isSupported", () => true);
  t.mock.method(Hls.prototype, "loadSource", function (source) {
    loaded.push({ hls: this, source, config: this.userConfig });
  });
  t.mock.method(Hls.prototype, "attachMedia", function (video) {
    assert.equal(video, player.video);
  });
  const destroy = Hls.prototype.destroy;
  t.mock.method(Hls.prototype, "destroy", function () {
    destroyed.push(this);
    destroy.call(this);
  });

  await player.render({ source: "/first.m3u8" });
  assert.equal(loaded.length, 2);
  assert.deepEqual(destroyed, [loaded[0].hls]);
  await player.render({
    source: "/first.m3u8",
    options: { onError: errors.push.bind(errors) },
  });
  assert.equal(loaded.length, 2);
  const error = { fatal: true };
  const listener = loaded[1].hls.listeners(Hls.Events.ERROR).at(-1);
  listener(Hls.Events.ERROR, { fatal: false });
  listener(Hls.Events.ERROR, error);
  await act(async () => {});
  assert.equal(errors[0].kind, "hls");
  assert.equal(errors[0].error.code, "unknown");

  await player.render({ source: "/next.m3u8", options: { startLevel: 1 } });
  await player.render({ source: "/next.m3u8", options: { startLevel: 1 } });
  assert.equal(loaded.length, 3);
  assert.equal(loaded[2].source, "https://example.test/next.m3u8");
  assert.deepEqual(loaded[2].config, { startLevel: 1, debug: false });
  await player.render({ source: "/next.m3u8", options: { startLevel: 2 } });
  await player.render({
    source: "/next.m3u8",
    options: { startLevel: 2 },
    id: "replacement",
  });
  await player.render({ source: null });
  assert.equal(loaded.length, 5);
  await player.unmount();
  assert.deepEqual(
    destroyed,
    loaded.map(({ hls }) => hls),
  );
});

test("native HLS handles a late video ref, playback errors and cleanup", async (t) => {
  const player = await mount(t);
  const errors = [];
  t.mock.method(Hls, "isSupported", () => false);
  t.mock.method(
    window.HTMLMediaElement.prototype,
    "canPlayType",
    () => "maybe",
  );
  const load = t.mock.method(
    window.HTMLMediaElement.prototype,
    "load",
    () => {},
  );

  await player.render({ source: "/first.m3u8", show: false });
  assert.equal(player.video, null);
  await player.render({
    source: "/first.m3u8",
    options: { onError: errors.push.bind(errors) },
  });
  const video = player.video;
  assert.equal(video.getAttribute("src"), "https://example.test/first.m3u8");
  Object.defineProperty(video, "error", {
    configurable: true,
    value: { code: 4, message: "secret" },
  });
  video.dispatchEvent(new window.Event("error"));
  await act(async () => {});
  assert.equal(errors[0].kind, "native");
  assert.equal(errors[0].error.code, "unsupported");
  assert.doesNotMatch(JSON.stringify(errors), /secret/);

  await player.render({ source: "/second.m3u8" });
  assert.equal(video.getAttribute("src"), "https://example.test/second.m3u8");
  await player.unmount();
  assert.equal(video.getAttribute("src"), null);
  assert.equal(load.mock.callCount(), 2);
});

test("unsupported browsers report once per session and never assign a source", async (t) => {
  const player = await mount(t);
  const errors = [];
  t.mock.method(Hls, "isSupported", () => false);
  await player.render({ source: "/stream.m3u8", show: false });
  await player.render({
    source: "/stream.m3u8",
    options: { onError: errors.push.bind(errors) },
  });
  await player.render({
    source: "/stream.m3u8",
    options: { onError: errors.push.bind(errors) },
  });
  assert.deepEqual(errors, [{ kind: "unsupported" }]);
  assert.equal(player.video.hasAttribute("src"), false);
});

test("a failed HLS setup disposes its instance and a new source can attach", async (t) => {
  const player = await mount(t);
  const errors = [];
  const cause = new Error("setup failed");
  t.mock.method(Hls, "isSupported", () => true);
  t.mock.method(Hls.prototype, "loadSource", (source) => {
    if (source.endsWith("/bad.m3u8")) throw cause;
  });
  const attach = t.mock.method(Hls.prototype, "attachMedia", () => {});
  const destroy = Hls.prototype.destroy;
  const cleanup = t.mock.method(Hls.prototype, "destroy", function () {
    destroy.call(this);
  });

  await player.render({ source: null });
  await player.render({
    source: "/bad.m3u8",
    options: { onError: errors.push.bind(errors) },
  });
  assert.equal(errors[0].kind, "setup");
  assert.equal(errors[0].cause.code, "setup");
  assert.doesNotMatch(JSON.stringify(errors), /setup failed/);
  assert.equal(cleanup.mock.callCount(), 1);
  await player.render({ source: "/good.m3u8" });
  assert.equal(attach.mock.callCount(), 1);
  await player.unmount();
  assert.equal(cleanup.mock.callCount(), 2);
});

test("modern hooks render an idle SSR snapshot and preserve stable methods", async (t) => {
  function Server() {
    const { videoRef, state, metrics } = useHlsPlayer({
      src: "/signed.m3u8?secret",
      metrics: true,
    });
    return createElement("video", {
      ref: videoRef,
      "data-status": state.status,
      "data-metrics": String(metrics),
    });
  }
  assert.equal(
    renderToString(createElement(Server)),
    '<video data-status="idle" data-metrics="null"></video>',
  );

  const player = await mount(t);
  t.mock.method(Hls, "isSupported", () => false);
  t.mock.method(
    window.HTMLMediaElement.prototype,
    "canPlayType",
    () => "maybe",
  );
  t.mock.method(window.HTMLMediaElement.prototype, "load", () => {});
  let latest;
  function Player({ src, id }) {
    latest = useHlsPlayer({ src });
    return createElement("video", { key: id, ref: latest.videoRef });
  }
  await player.renderNode(createElement(Player, { src: "/one.m3u8" }));
  const { controls, videoRef } = latest;
  const previous = player.video;
  assert.equal(latest.state.status, "loading");
  await player.renderNode(
    createElement(Player, { src: "/two.m3u8", id: "new" }),
  );
  assert.equal(latest.controls, controls);
  assert.equal(latest.videoRef, videoRef);
  assert.equal(previous.getAttribute("src"), null);
  assert.match(player.video.src, /two\.m3u8$/);
  const current = player.video;
  await player.unmount();
  assert.equal(current.getAttribute("src"), null);
  assert.equal(await controls.play(), false);
});

test("a selector subscriber skips updates from media time samples", async (t) => {
  const player = await mount(t);
  t.mock.method(Hls, "isSupported", () => false);
  t.mock.method(
    window.HTMLMediaElement.prototype,
    "canPlayType",
    () => "maybe",
  );
  t.mock.method(window.HTMLMediaElement.prototype, "load", () => {});
  let renders = 0;
  let store;
  function Status({ playback }) {
    renders++;
    const { status } = usePlaybackState(
      playback,
      (value) => ({ status: value.status }),
      (a, b) => a.status === b.status,
    );
    return createElement("p", null, status);
  }
  function Player() {
    const attachment = useHlsController({ src: "/stream.m3u8" });
    store = attachment.store;
    return createElement(
      React.Fragment,
      null,
      createElement("video", { ref: attachment.videoRef }),
      createElement(Status, { playback: store }),
    );
  }
  await player.renderNode(createElement(Player));
  const baseline = renders;
  await act(async () => {
    player.video.currentTime = 5;
    player.video.dispatchEvent(new window.Event("timeupdate"));
  });
  assert.equal(store.getState().currentTime, 5);
  assert.equal(renders, baseline);
  await act(async () => {
    Object.defineProperty(player.video, "readyState", { value: 4 });
    player.video.dispatchEvent(new window.Event("canplay"));
  });
  assert.equal(store.getState().status, "ready");
  assert.ok(renders > baseline);
});

test("authenticated mode fails closed when hls.js cannot activate FetchLoader", async (t) => {
  const player = await mount(t);
  t.mock.method(Hls, "isSupported", () => true);
  const load = t.mock.method(Hls.prototype, "loadSource", () => {});
  let store;
  function Player() {
    const attachment = useHlsController({
      src: "/signed.m3u8",
      request: { allowedOrigins: ["https://example.test"] },
    });
    store = attachment.store;
    return createElement("video", { ref: attachment.videoRef });
  }
  await player.renderNode(createElement(Player));
  assert.equal(store.getState().error.code, "request-policy");
  assert.equal(load.mock.callCount(), 0);
});
