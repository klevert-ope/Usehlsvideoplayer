# Browser compatibility

`engine: "auto"` selects hls.js when the browser exposes a supported Media Source Extensions (MSE) or Managed Media Source path. Otherwise, it selects native HLS when the browser advertises native support and the options permit it. This choice happens when the controller attaches a source. A failure after attachment follows the recovery rules in the [API reference](api.md#state-and-events).

| Playback path                                         | Available features                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| hls.js on browsers with a supported media source path | Adaptive bitrate selection, quality preferences, manual quality, alternate audio, subtitles, restricted requests, authentication renewal, and live playback. Each stream needs compatible codecs and the relevant playlist entries. |
| Native HLS on browsers that advertise support         | The browser manages quality, loading, and audio. The library exposes available browser subtitle and caption tracks, and seekable ranges. Request header injection and per-request origin rules require hls.js.                      |
| No compatible playback path                           | The controller reports `unsupported`.                                                                                                                                                                                               |
| Node or Next.js server rendering                      | Imports and the idle snapshot work without browser globals. Media attachment requires a video element in the browser.                                                                                                               |

Safari and iOS browsers can select different paths depending on the OS and media capabilities. The engine check establishes browser capability. Decoding still depends on the stream's codecs and container.

Automatic quality preferences and authentication renewal are [unreleased](../CHANGELOG.md#unreleased). Startup and stall deadlines also apply to native playback when enabled, but native loading and decoder recovery fall back to source reconstruction. Physical Safari, iOS, and Android qualification remains outstanding for this upgrade. A Windows WebKit skip supplies no device evidence. See the [verification report](verification-report.md) for the measured candidate and its limits.

The local playground uses a rolling MPEG-TS live stream. The browser suite also tests an LL-HLS fixture with CMAF partial segments, blocking reloads, and a part holdback. See [playback qualification](qualification.md) for the browser and device checks, or [playback troubleshooting](troubleshooting.md) for help with a stream.
