# Troubleshoot playback

Start with `state.status`, `state.engine`, and `state.error?.code`. For hls.js, subscribe to `onEvent` to see non-fatal errors while the engine handles retries. Keep signed URLs and credentials out of logs.

| Symptom                                                   | What to check                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The player stays idle                                     | Attach `videoRef` and pass a playlist URL to the React hook, or call `setSource(video, url)` on the core controller. Leave the video's own `src` and `<source>` children unset. |
| Playback reports `setup`                                  | Check that the video element has one controller. If you supplied a custom adapter, check its factory and attachment.                                                            |
| The player reaches `ready` but stays paused               | Use the video controls or call `controls.play()` from a click. If the browser denied autoplay, the player can report `playback-blocked`.                                        |
| The player stays in `loading` with `autoStartLoad: false` | Call `controls.startLoading()` for hls.js.                                                                                                                                      |
| The player reports `unsupported`                          | Check the available playback paths and the stream's codecs. If you forced an engine, try `"auto"`. If you supplied `request`, check that the browser supports hls.js.           |
| A cross-origin request fails                              | Check CORS on every origin that serves playlists, segments, subtitles, or keys. If the request includes credentials, allow the exact app origin and enable credentialed CORS.   |
| The player reports `request-policy`                       | Check the exact origins in `request.allowedOrigins`, including the scheme and port. Use final URLs. A blocked redirect can also appear as a network or manifest error.          |
| The player reports `authentication`                       | Get a fresh signed URL or refresh the token through your application. The native engine may report a generic media error when the server rejects the request.                   |
| Manual quality or alternate audio is missing              | Check `state.engine`. With hls.js, check whether the master playlist advertises alternate levels or audio tracks.                                                               |
| **Go live** stays disabled                                | Check whether `live.isLive` is true and `state.seekable` contains a range. Native live detection depends on the browser reporting an infinite duration.                         |
| Metrics stay empty                                        | Pass `metrics: true` when you attach the stream. Frame counts and live latency can remain unavailable when the browser or stream cannot provide them.                           |

See [browser compatibility](compatibility.md) for engine capabilities and the [usage guide](usage.md#send-credentials-with-hls-requests) for the protected request setup.
