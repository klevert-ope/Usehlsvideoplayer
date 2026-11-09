import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
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

  if (process.env.CHECK_NEXT === "1") {
    install("next@16.4.5");
    mkdirSync(join(temp, "app"));
    writeFileSync(
      join(temp, "next.config.mjs"),
      'export default { output: "export" };',
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
    execFileSync(
      process.execPath,
      [join(temp, "node_modules", "next", "dist", "bin", "next"), "build"],
      {
        cwd: temp,
        stdio: "inherit",
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
      },
    );
    assert.match(
      readFileSync(join(temp, "out", "index.html"), "utf8"),
      /<video data-status="idle"><\/video>/,
    );
    console.log("Next.js 16.4.5 App Router build and static prerender passed");
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
        entries: ["root ESM", "root CJS", "core ESM", "core CJS"],
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temp, { recursive: true, force: true });
}
