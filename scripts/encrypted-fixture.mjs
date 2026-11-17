// Synthetic AES-128 HLS for retention tests. This public test key is not a secret.
import { createCipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
const key = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");

export function encryptedFixture(boot) {
  return (request, response, next) => {
    const url = new URL(request.url, "http://fixture.test");
    if (url.pathname === "/stream.m3u8") {
      const start = Math.floor((Date.now() - boot) / 1000);
      const rows = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:1",
        `#EXT-X-MEDIA-SEQUENCE:${start}`,
        `#EXT-X-DISCONTINUITY-SEQUENCE:${Math.floor(start / 30)}`,
      ];
      for (let sequence = start; sequence < start + 6; sequence++) {
        if (sequence > start && sequence % 30 === 0)
          rows.push("#EXT-X-DISCONTINUITY");
        rows.push(
          `#EXT-X-KEY:METHOD=AES-128,URI="/encrypted/key?signature=synthetic-${sequence}",IV=0x${sequence.toString(16).padStart(32, "0")}`,
          "#EXTINF:1.0,",
          `/encrypted/segment?sequence=${sequence}`,
        );
      }
      response
        .writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
        })
        .end(rows.join("\n") + "\n");
    } else if (url.pathname === "/key") {
      response
        .writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(key);
    } else if (url.pathname === "/segment") {
      const sequence = Number(url.searchParams.get("sequence"));
      if (!Number.isSafeInteger(sequence) || sequence < 0) {
        response.writeHead(400).end();
        return;
      }
      const iv = Buffer.alloc(16);
      iv.writeBigUInt64BE(BigInt(sequence), 8);
      const cipher = createCipheriv("aes-128-cbc", key, iv);
      const media = readFileSync(
        `public/fixtures/low/seg${String(sequence % 30).padStart(3, "0")}.ts`,
      );
      response
        .writeHead(200, { "Content-Type": "video/mp2t" })
        .end(Buffer.concat([cipher.update(media), cipher.final()]));
    } else next();
  };
}
