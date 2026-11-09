import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { get } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { gzipSync } from "node:zlib";
import { build } from "vite";
import { tsc } from "./compiler.mjs";

const require = createRequire(import.meta.url);
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run npm run check:package");
const temp = mkdtempSync(join(tmpdir(), "hls-package-"));
const node = (args, cwd = temp) =>
  execFileSync(process.execPath, args, { cwd, encoding: "utf8" });
const install = (...args) =>
  node([
    npm,
    "install",
    "--ignore-scripts",
    "--prefer-offline",
    "--no-audit",
    "--no-fund",
    ...args,
  ]);

try {
  const packed = JSON.parse(
    node([npm, "pack", "--json", "--pack-destination", temp], process.cwd()),
  );
  const [pack] = Array.isArray(packed) ? packed : Object.values(packed);
  assert.equal(pack.name, "usehlsvideoplayer");
  assert.ok(
    pack.files.every(({ path }) =>
      /^(dist\/(esm|cjs)\/|package\.json$|README\.md$|LICENSE$|SECURITY\.md$|CHANGELOG\.md$|docs\/)/.test(
        path,
      ),
    ),
  );
  writeFileSync(
    join(temp, "package.json"),
    '{"name":"hls-package-consumer","private":true}',
  );
  install(join(temp, pack.filename));
  node([
    "--input-type=module",
    "-e",
    `
    import assert from "node:assert/strict";
    import { createPlaybackController } from "usehlsvideoplayer/core";
    assert.equal(createPlaybackController().getState().status, "idle");
    await assert.rejects(import("react"), { code: "ERR_MODULE_NOT_FOUND" });
  `,
  ]);
  node([
    "-e",
    'require("node:assert/strict").equal(require("usehlsvideoplayer/core").createPlaybackController().getState().status, "idle")',
  ]);

  const react =
    process.env.CHECK_REACT || require("react/package.json").version;
  const typeMajor = react.split(".")[0];
  install(
    `react@${react}`,
    `react-dom@${react}`,
    `@types/react@${typeMajor}`,
    `@types/react-dom@${typeMajor}`,
  );
  for (const entry of ["esm", "cjs"]) {
    const path = join(
      temp,
      "node_modules",
      "usehlsvideoplayer",
      "dist",
      entry,
      "index.js",
    );
    const directive =
      entry === "esm" ? /^"use client";/ : /^"use strict";\r?\n"use client";/;
    assert.match(readFileSync(path, "utf8"), directive);
  }
  node([
    "--input-type=module",
    "-e",
    `
    import assert from "node:assert/strict";
    import { createElement } from "react";
    import { renderToString } from "react-dom/server";
    import { Usehlsplayer, useHlsVideoPlayer, useHlsPlayer } from "usehlsvideoplayer";
    assert.equal(Usehlsplayer, useHlsVideoPlayer);
    assert.equal(renderToString(createElement(() => {
      const {videoRef, state} = useHlsPlayer({src: "/stream"});
      return createElement("video", {ref:videoRef, "data-status":state.status});
    })), '<video data-status="idle"></video>');
  `,
  ]);
  node([
    "-e",
    'require("node:assert/strict").equal(typeof require("usehlsvideoplayer").useHlsPlayer, "function")',
  ]);
  writeFileSync(
    join(temp, "consumer.mts"),
    `
    import { useHlsPlayer } from "usehlsvideoplayer";
    import { createPlaybackController, type PlaybackState } from "usehlsvideoplayer/core";
    const state: PlaybackState = createPlaybackController().getState();
    const player = () => useHlsPlayer({src: "/vod", lowLatency: true});
    void [state, player];
  `,
  );
  writeFileSync(
    join(temp, "consumer.cts"),
    `
    import player = require("usehlsvideoplayer");
    import core = require("usehlsvideoplayer/core");
    const state: core.PlaybackState = core.createPlaybackController().getState();
    void [player.useHlsPlayer, state];
  `,
  );
  node([
    tsc,
    "--noEmit",
    "--strict",
    "--module",
    "node16",
    "--target",
    "es2020",
    "consumer.mts",
    "consumer.cts",
  ]);

  async function bundle(symbol) {
    const path = join(temp, "bundle-entry.mjs");
    writeFileSync(path, `export { ${symbol} } from "usehlsvideoplayer/core";`);
    const output = await build({
      configFile: false,
      root: temp,
      logLevel: "silent",
      build: {
        write: false,
        minify: true,
        lib: { entry: path, formats: ["es"] },
        rolldownOptions: { external: ["react"] },
      },
    });
    const [chunk] = output[0].output;
    assert.equal(chunk.type, "chunk");
    assert.ok(!chunk.imports.includes("react"));
    assert.doesNotMatch(chunk.code, /useSyncExternalStore|useHlsVideoPlayer/);
    if (symbol === "selectEngine")
      assert.doesNotMatch(chunk.code, /MediaSource|lowLatencyMode/);
    return {
      bytes: Buffer.byteLength(chunk.code),
      gzip: gzipSync(chunk.code).length,
    };
  }
  const bundles = {
    core: await bundle("createPlaybackController"),
    selectionOnly: await bundle("selectEngine"),
  };

  if (process.env.CHECK_NEXT === "1") {
    install("next@16.4.5");
    mkdirSync(join(temp, "app"));
    writeFileSync(
      join(temp, "next.config.mjs"),
      "export default { turbopack: { root: process.cwd() } };",
    );
    writeFileSync(
      join(temp, "app", "layout.jsx"),
      'export default function Layout({children}) { return <html lang="en"><body>{children}</body></html>; }',
    );
    writeFileSync(
      join(temp, "app", "page.jsx"),
      'import Player from "./player"; export default function Page() { return <Player src="/fixture.m3u8" />; }',
    );
    writeFileSync(
      join(temp, "app", "player.jsx"),
      `
      "use client";
      import { useHlsPlayer } from "usehlsvideoplayer";
      export default function Player({ src }) {
        const { videoRef, state } = useHlsPlayer({ src });
        return <video ref={videoRef} data-status={state.status} />;
      }
    `,
    );
    mkdirSync(join(temp, "app", "runtime"));
    writeFileSync(
      join(temp, "app", "runtime", "page.jsx"),
      `
      import Player from "../player";
      export const dynamic = "force-dynamic";
      export default async function Page({ searchParams }) {
        return <main data-probe={(await searchParams).probe}><Player src="/fixture.m3u8" /></main>;
      }
    `,
    );
    const next = join(temp, "node_modules", "next", "dist", "bin", "next");
    const env = { ...process.env, NEXT_TELEMETRY_DISABLED: "1" };
    execFileSync(process.execPath, [next, "build"], {
      cwd: temp,
      stdio: "inherit",
      env,
    });
    const manifest = JSON.parse(
      readFileSync(join(temp, ".next", "prerender-manifest.json"), "utf8"),
    );
    assert.ok(manifest.routes["/"]);
    assert.ok(!manifest.routes["/runtime"]);
    const reservation = createServer();
    await new Promise((resolve, reject) =>
      reservation.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    const { port } = reservation.address();
    await new Promise((resolve) => reservation.close(resolve));
    const server = spawn(
      process.execPath,
      [next, "start", "-H", "127.0.0.1", "-p", String(port)],
      { cwd: temp, stdio: "inherit", env },
    );
    const exited = new Promise((resolve) => server.once("close", resolve));
    const base = `http://127.0.0.1:${port}`;
    function read(path) {
      return new Promise((resolve, reject) => {
        const request = get(
          base + path,
          { signal: AbortSignal.timeout(12_000) },
          (response) => {
            let html = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              html += chunk;
            });
            response.on("end", () =>
              resolve({ status: response.statusCode, html }),
            );
            response.on("error", reject);
          },
        );
        request.on("error", reject);
      });
    }
    try {
      let ready;
      let last;
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline && server.exitCode === null) {
        try {
          ready = await read("/");
          if (ready.status === 200) break;
          last = `HTTP ${ready.status}`;
        } catch (error) {
          last = error.code ?? error.name;
        }
        await delay(250);
      }
      assert.ok(
        ready?.status === 200,
        `Next.js production server did not serve the static route (${last ?? "server exited"})`,
      );
      assert.match(ready.html, /<video data-status="idle"><\/video>/);
      const { status, html } = await read(
        "/runtime?probe=rendered-per-request",
      );
      assert.equal(status, 200);
      assert.match(html, /<main data-probe="rendered-per-request">/);
      assert.match(html, /<video data-status="idle"><\/video>/);
    } finally {
      server.kill();
      await exited;
    }
    console.log(
      "Next.js 16.4.5 App Router build, static prerender and production SSR passed",
    );
  }

  const modules = readdirSync("dist/esm").filter((name) =>
    name.endsWith(".js"),
  );
  const javascript = Buffer.concat(
    modules.map((file) => readFileSync(join("dist", "esm", file))),
  );
  console.log(
    JSON.stringify(
      {
        react,
        packBytes: pack.size,
        unpackedBytes: pack.unpackedSize,
        esmBytes: javascript.length,
        esmGzipBytes: gzipSync(javascript).length,
        dependenciesBundled: false,
        browserBundlesIncludingHls: bundles,
        entries: ["root ESM", "root CJS", "core ESM", "core CJS"],
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
