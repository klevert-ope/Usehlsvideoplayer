# Usehlsvideoplayer

## Description

`usehlsvideoplayer` is a React hook designed to simplify the integration of [Hls.js](https://github.com/video-dev/hls.js) for video playback in your React applications. This hook creates a video player instance and manages the loading of an HTTP Live Streaming (HLS) video source.

## Installation

Install the package using npm:

```bash
npm install usehlsvideoplayer
```

## Usage

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
