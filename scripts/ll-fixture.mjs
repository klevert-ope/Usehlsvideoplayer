// A wall-clock LL-HLS origin over local, pre-encoded CMAF media. The request
// clock is shared by all clients; future reloads block only until publication.
const partsPerSegment = 4;
const segmentCount = 12;
const partMs = 500;
const targetDuration = 2;
const skipBoundary = 6 * targetDuration;

export function llFixture(
  boot,
  { mediaPath = "/fixtures/cmaf/", siblingPlaylist } = {},
) {
  const initialPart = siblingPlaylist ? 225 : 25;
  const windowSegments = siblingPlaylist ? 10 : 6;
  const current = () => Math.floor((Date.now() - boot) / partMs) + initialPart;
  return (request, response) => {
    const url = new URL(request.url, "http://fixture.test");
    const msn = url.searchParams.get("_HLS_msn");
    const part = url.searchParams.get("_HLS_part");
    // A request for a parent without a part waits for the complete segment.
    const wanted =
      msn === null
        ? current()
        : Number(msn) * partsPerSegment +
          Math.min(Number(part ?? partsPerSegment), partsPerSegment);
    if (
      (msn !== null && !/^\d+$/.test(msn)) ||
      (part !== null && (msn === null || !/^\d+$/.test(part))) ||
      !Number.isSafeInteger(wanted) ||
      wanted > current() + 12
    ) {
      response.writeHead(400).end();
      return;
    }
    function send() {
      const available = current();
      const edge = Math.floor(available / partsPerSegment);
      const lastPart = available % partsPerSegment;
      const start = Math.max(0, edge - windowSegments);
      // Count segments whose end is strictly older than the skip boundary.
      const skipped =
        siblingPlaylist && url.searchParams.get("_HLS_skip") === "YES"
          ? Math.max(0, edge - start - skipBoundary / targetDuration - 1)
          : 0;
      const serverControl =
        "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=1.5,HOLD-BACK=6";
      const rows = [
        "#EXTM3U",
        "#EXT-X-VERSION:9",
        `#EXT-X-TARGETDURATION:${targetDuration}`,
        siblingPlaylist
          ? `${serverControl},CAN-SKIP-UNTIL=${skipBoundary}`
          : serverControl,
        "#EXT-X-PART-INF:PART-TARGET=0.5",
        `#EXT-X-MEDIA-SEQUENCE:${start}`,
        `#EXT-X-DISCONTINUITY-SEQUENCE:${Math.floor(start / segmentCount)}`,
        "#EXT-X-INDEPENDENT-SEGMENTS",
      ];
      if (skipped) rows.push(`#EXT-X-SKIP:SKIPPED-SEGMENTS=${skipped}`);
      rows.push(`#EXT-X-MAP:URI="${mediaPath}init.mp4"`);
      const partUri = (sequence, index) =>
        `${mediaPath}part${String((sequence % segmentCount) * partsPerSegment + index).padStart(2, "0")}.m4s`;
      for (let sequence = start + skipped; sequence <= edge; sequence++) {
        if (sequence > start && sequence % segmentCount === 0)
          rows.push("#EXT-X-DISCONTINUITY");
        const complete = sequence < edge;
        if (sequence >= edge - 2) {
          const count = complete ? partsPerSegment : lastPart + 1;
          for (let i = 0; i < count; i++)
            rows.push(
              `#EXT-X-PART:DURATION=0.5,INDEPENDENT=YES,URI="${partUri(sequence, i)}"`,
            );
        }
        if (complete)
          rows.push(
            `#EXTINF:${targetDuration.toFixed(1)},`,
            `${mediaPath}segment${sequence % segmentCount}.m4s`,
          );
      }
      if (siblingPlaylist)
        rows.push(
          `#EXT-X-RENDITION-REPORT:URI="${siblingPlaylist}",LAST-MSN=${edge},LAST-PART=${lastPart}`,
        );
      response
        .writeHead(200, {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store",
          "X-Fixture-Blocked-Ms": String(Date.now() - started),
        })
        .end(rows.join("\n") + "\n");
    }
    const started = Date.now();
    const wait = boot + (wanted - initialPart) * partMs - started;
    if (wait <= 0) send();
    else {
      const timer = setTimeout(send, wait);
      response.once("close", () => clearTimeout(timer));
    }
  };
}

const ladder = `#EXTM3U
#EXT-X-VERSION:9
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=320x180,CODECS="avc1.42c01e"
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=640x360,CODECS="avc1.42c01e"
high.m3u8
`;

export function llLadderFixture(boot) {
  const low = llFixture(boot, { siblingPlaylist: "high.m3u8" });
  const high = llFixture(boot, {
    mediaPath: "/fixtures/cmaf-high/",
    siblingPlaylist: "low.m3u8",
  });
  return (request, response, next) => {
    const { pathname } = new URL(request.url, "http://fixture.test");
    switch (pathname) {
      case "/master.m3u8":
        response
          .writeHead(200, {
            "Content-Type": "application/vnd.apple.mpegurl",
            "Cache-Control": "no-store",
          })
          .end(ladder);
        break;
      case "/low.m3u8":
        low(request, response);
        break;
      case "/high.m3u8":
        high(request, response);
        break;
      default:
        next();
    }
  };
}
