import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const output = "public/fixtures";
for (const [name, size] of [
  ["low", "320x180"],
  ["high", "640x360"],
  ["audio", null],
]) {
  const dir = join(output, name);
  mkdirSync(dir, { recursive: true });
  execFileSync(
    process.env.FFMPEG ?? "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      ...(size ? ["-f", "lavfi", "-i", `testsrc2=size=${size}:rate=25`] : []),
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000",
      "-t",
      "30",
      ...(size
        ? [
            "-c:v",
            "libx264",
            "-threads:v",
            "1",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-g",
            "25",
            "-keyint_min",
            "25",
            "-sc_threshold",
            "0",
          ]
        : []),
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-f",
      "hls",
      "-hls_time",
      "1",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-hls_segment_filename",
      join(dir, "seg%03d.ts"),
      join(dir, "index.m3u8"),
    ],
    { stdio: "inherit" },
  );
}

writeFileSync(
  join(output, "master.m3u8"),
  `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Original",DEFAULT=YES,AUTOSELECT=YES
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Alternate",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="en",URI="audio/index.m3u8"
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=NO,AUTOSELECT=YES,LANGUAGE="en",URI="subtitles.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=320x180,CODECS="avc1.42c00c,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=640x360,CODECS="avc1.42c01e,mp4a.40.2",AUDIO="audio",SUBTITLES="subs"
high/index.m3u8
`,
);
writeFileSync(
  join(output, "subtitles.m3u8"),
  "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:30\n#EXTINF:30.0,\nenglish.vtt\n#EXT-X-ENDLIST\n",
);
writeFileSync(
  join(output, "english.vtt"),
  "WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:126000\n\n00:00:01.000 --> 00:00:20.000\nFixture caption.\n",
);
