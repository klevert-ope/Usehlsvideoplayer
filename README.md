# Usehlsvideoplayer

## Description

`usehlsvideoplayer` is a React hook designed to simplify the integration of [Hls.js](https://github.com/video-dev/hls.js) for video playback in your React applications. This hook creates a video player instance and manages the loading of an HTTP Live Streaming (HLS) video source. With `usehlsvideoplayer`, you can effortlessly incorporate Hls.js functionality into your components.

## New Features

### [1.0.5] - 2023-12-07

- **New Feature:** [The hook now offers a range of options for fine-tuning the behavior of the Hls.js instance. These options allow you to customize various aspects of video playback, such as auto-starting the stream, specifying initial quality levels, setting buffer lengths, and more. Whether you're looking for basic video playback or advanced customization, `usehlsvideoplayer` provides a seamless and flexible solution.]


## Installation

Install the package using npm:

```bash
npm install usehlsvideoplayer
```

## Basic Usage

```javascript
import { Usehlsplayer } from 'usehlsvideoplayer';

const YourComponent = () => {
  const videoSource = 'your-hls-video-source-url';
  const { videoRef } = Usehlsplayer(videoSource);

  return (
    <div>
      <video ref={videoRef} controls>
	      <source src={videoSource}
	              type='application/x-mpegURL'
	      />
      </video>
    </div>
  );
};
```
## Advanced Usage

```javascript
import { Usehlsplayer } from 'usehlsvideoplayer';

const YourComponent = () => {
  const videoSource = 'your-hls-video-source-url';
  const { videoRef } = Usehlsplayer(videoSource, {
	  startLevel: 2,
	  maxBufferLength: 60,
	  enableSoftwareAES: false,
	  // Add more options as needed. Below are the list of options and there default
  });

  return (
    <div>
      <video ref={videoRef} controls>
	      <source src={videoSource}
	              type='application/x-mpegURL'
	      />
      </video>
    </div>
  );
};
```
## Options
The following options are specific to Hls.js and provide fine-tuning capabilities for adapting it to different streaming scenarios:

1. **`autoStartLoad` (default: `true`):**
    - **Use Case:** Determines whether the loading of the stream should start automatically when the Hls.js instance is created.

2. **`startLevel` (default: `-1`):**
    - **Use Case:** Specifies the initial quality level index to start playback with. Use `-1` for automatic level selection.

3. **`maxBufferLength` (default: `30`):**
    - **Use Case:** Sets the maximum buffer length (in seconds) to keep for instant playback. Adjust for optimizing buffering behavior.

4. **`maxBufferSize` (default: `60 * 1000 * 1000`):**
    - **Use Case:** Defines the maximum buffer size (in bytes) for the media element. Useful for controlling memory usage.

5. **`maxMaxBufferLength` (default: `600`):**
    - **Use Case:** Specifies the maximum buffer length (in seconds) for live content. Adjust for optimizing live stream buffering.

6. **`liveSyncDurationCount` (default: `3`):**
    - **Use Case:** Sets the number of target durations to keep in live synchronization of the manifest. Affects live stream synchronization.

7. **`liveMaxLatencyDurationCount` (default: `5`):**
    - **Use Case:** Configures the number of target durations to keep in live synchronization for low-latency applications.

8. **`enableWorker` (default: `true`):**
    - **Use Case:** Enables or disables the use of Web Workers for fetching and parsing segments. Can improve performance.

9. **`enableSoftwareAES` (default: `true`):**
    - **Use Case:** Enables or disables software-based AES decryption. Adjust based on hardware support for decryption.

10. **`forceKeyFrameOnDiscontinuity` (default: `true`):**
    - **Use Case:** Determines whether to force the generation of keyframes on discontinuity for better seeking in live streams.

11. **`levelLoadingTimeOut` (default: `10000`):**
    - **Use Case:** Sets the timeout (in milliseconds) for level loading. Useful for handling delays in loading levels.

12. **`manifestLoadingTimeOut` (default: `10000`):**
    - **Use Case:** Sets the timeout (in milliseconds) for manifest loading. Useful for handling delays in loading the manifest.

13. **`xhrSetup` (default: `null`):**
    - **Use Case:** Allows customization of XHR setup function for handling XMLHttpRequest. Useful for advanced use cases.

14. **`capLevelToPlayerSize` (default: `false`):**
    - **Use Case:** Limits the selected quality level to the size of the player. Useful for optimizing quality based on player dimensions.

15. **`startFragPrefetch` (default: `false`):**
    - **Use Case:** Initiates fragment prefetching to improve start-up time by loading fragments in advance.

16. **`appendErrorMaxRetry` (default: `3`):**
    - **Use Case:** Specifies the maximum number of retries for appending a segment on error. Useful for handling segment append errors.


## Parameters

- `videoSource` (string): The URL of the HLS video source to be loaded.

## Return Value

The hook returns an object with the following property:

- `videoRef` (React Ref): A ref that should be attached to the `video` element in your JSX/JS to bind the video player.


## Cleanup

The hook takes care of cleaning up resources when the component unmounts. It automatically detaches the Hls.js instance and removes event listeners.

## Dependencies

This package has a dependency on [Hls.js](https://github.com/video-dev/hls.js), so make sure to include it in your project.

```bash
npm install hls.js
```

## License

This project is licensed under the ISC License.
