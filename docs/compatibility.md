# Browser compatibility

`engine: "auto"` selects hls.js when the browser exposes a supported Media Source Extensions (MSE) or Managed Media Source path. Otherwise, it selects native HLS when the browser advertises native support and the options permit it. This choice happens when the controller attaches a source. A failure after attachment follows the recovery rules in the [API reference](api.md#state-and-events).

| Playback path                                         | Available features                                                                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hls.js on browsers with a supported media source path | Adaptive bitrate selection, manual quality, alternate audio, subtitles, authenticated requests, and live playback. Each stream needs compatible codecs and the relevant playlist entries.                      |
| Native HLS on browsers that advertise support         | The browser manages quality, loading, and audio. The library exposes available browser subtitle and caption tracks, and seekable ranges. Request header injection and per-request origin rules require hls.js. |
| No compatible playback path                           | The controller reports `unsupported`.                                                                                                                                                                          |
| Node or Next.js server rendering                      | Imports and the idle snapshot work without browser globals. Media attachment requires a video element in the browser.                                                                                          |

Safari and iOS browsers can select different paths depending on the OS and media capabilities. The engine check establishes browser capability. Decoding still depends on the stream's codecs and container.

The local playground uses a rolling MPEG-TS live stream. See the [engineering record](modernization.md) for browser test coverage or [playback troubleshooting](troubleshooting.md) for help with a stream.
