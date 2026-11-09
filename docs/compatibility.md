# Browser compatibility and troubleshooting

| Environment                                                      | Playback path                       | Feature boundary                                                                                                        |
| ---------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Chromium or Firefox with supported MSE and codecs                | hls.js                              | ABR, manual quality, audio groups, subtitles, authenticated fetch, VOD and live.                                        |
| Safari or iOS browsers with a supported hls.js Media Source path | hls.js in auto mode                 | Availability depends on OS and media capabilities.                                                                      |
| Safari or another browser advertising native HLS                 | Native when selected or as fallback | The browser manages ABR, loading and audio. The library exposes browser text tracks and seekable ranges when available. |
| Browser with neither HLS path                                    | Unsupported                         | The controller reports a typed error.                                                                                   |
| Node and Next.js server rendering                                | Inactive                            | Imports and initial snapshots work without browser globals.                                                             |

This table describes capability paths. The [verification record](modernization.md) gives the actual browser coverage. The codec, manifest, transport and platform must all support the stream.

| Symptom                               | Check                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Stream remains idle                   | Pass a source and attach the ref. Keep the video's own source attribute and children clear.                                           |
| Stream starts loading but never plays | Use `controls.play()` from a click. If `autoStartLoad` is false, call `controls.startLoading()`.                                      |
| Unsupported engine                    | Leave `engine` on auto, verify MSE or native HLS, and check the encoded codecs.                                                       |
| Request fails across origins          | Configure CORS for the manifest, variants, segments, subtitles and keys. With credentialled CORS, allow the exact application origin. |
| Authentication failure                | Obtain a fresh signed URL or token through the application and replace the source. Native playback may not reveal HTTP status.        |
| No manual quality or audio options    | Native playback does not expose library-managed rendition selection. Check that the master playlist actually lists alternatives.      |
| Seek-to-live disabled                 | Wait for a live playlist and a seekable range. Native detection depends on the browser exposing an infinite duration.                 |
| Metrics remain empty                  | Enable `metrics` on the attachment. Frame quality and latency can remain unavailable on some browsers.                                |

The live playground uses a rolling local transport-stream fixture. It is suitable for lifecycle and DVR checks. LL-HLS needs an origin serving partial segments, blocking reload and compliant holdback values.
