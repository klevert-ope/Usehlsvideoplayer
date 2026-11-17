// A wall-clock LL-HLS origin over local, pre-encoded CMAF media. The request
// clock is shared by all clients; future reloads block only until publication.
const partsPerSegment = 4;
const segmentCount = 12;
const partMs = 500;
const path = "/fixtures/cmaf/";

export function llFixture(boot) {
  return (request, response) => {
    const url = new URL(request.url, "http://fixture.test");
    const current = () => Math.floor((Date.now() - boot) / partMs) + 25;
    const msn = url.searchParams.get("_HLS_msn");
    const part = url.searchParams.get("_HLS_part");
    const wanted =
      msn === null ? current() : Number(msn) * 4 + Number(part ?? 0);
    if (
      !Number.isSafeInteger(wanted) ||
      wanted < 0 ||
      wanted > current() + 12 ||
      (part !== null && (msn === null || !/^[0-3]$/.test(part)))
    ) {
      response.writeHead(400).end();
      return;
    }
    function send() {
      const available = current();
      const edge = Math.floor(available / partsPerSegment);
      const start = Math.max(0, edge - 6);
      const rows = [
        "#EXTM3U",
        "#EXT-X-VERSION:9",
        "#EXT-X-TARGETDURATION:2",
        "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.5,HOLD-BACK=6",
        "#EXT-X-PART-INF:PART-TARGET=0.5",
        `#EXT-X-MEDIA-SEQUENCE:${start}`,
        `#EXT-X-DISCONTINUITY-SEQUENCE:${Math.floor(start / segmentCount)}`,
        "#EXT-X-INDEPENDENT-SEGMENTS",
        `#EXT-X-MAP:URI="${path}init.mp4"`,
      ];
      const partUri = (sequence, index) =>
        `${path}part${String((sequence % segmentCount) * 4 + index).padStart(2, "0")}.m4s`;
      for (let sequence = start; sequence <= edge; sequence++) {
        if (sequence > start && sequence % segmentCount === 0)
          rows.push("#EXT-X-DISCONTINUITY");
        const complete = sequence < edge;
        if (sequence >= edge - 2) {
          const count = complete ? 4 : (available % 4) + 1;
          for (let i = 0; i < count; i++)
            rows.push(
              `#EXT-X-PART:DURATION=0.5,INDEPENDENT=YES,URI="${partUri(sequence, i)}"`,
            );
        }
        if (complete)
          rows.push(
            "#EXTINF:2.0,",
            `${path}segment${sequence % segmentCount}.m4s`,
          );
      }
      response
        .writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
          "X-Fixture-Blocked-Ms": String(Date.now() - started),
        })
        .end(rows.join("\n") + "\n");
    }
    const started = Date.now();
    const wait = wanted - current();
    if (wait <= 0) send();
    else {
      const timer = setTimeout(send, wait * partMs);
      response.once("close", () => clearTimeout(timer));
    }
  };
}
