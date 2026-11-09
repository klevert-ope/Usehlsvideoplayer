import { defineConfig } from "vite";

const boot = Date.now();
export default defineConfig({
  plugins: [
    {
      name: "local-live-fixture",
      configureServer(server) {
        server.middlewares.use("/live/stream.m3u8", (_req, res) => {
          const sequence = Math.floor((Date.now() - boot) / 1000);
          const segments = Array.from({ length: 6 }, (_, offset) => {
            const segment = (sequence + offset) % 30;
            const discontinuity =
              offset > 0 && segment === 0 ? "#EXT-X-DISCONTINUITY\n" : "";
            return `${discontinuity}#EXTINF:1.0,\n/fixtures/low/seg${String(segment).padStart(3, "0")}.ts`;
          }).join("\n");
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.setHeader("Cache-Control", "no-store");
          res.end(
            `#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:${sequence}\n#EXT-X-DISCONTINUITY-SEQUENCE:${Math.floor(sequence / 30)}\n#EXT-X-INDEPENDENT-SEGMENTS\n${segments}\n`,
          );
        });
      },
    },
  ],
});
