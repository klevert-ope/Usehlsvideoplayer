import Hls from 'hls.js';
import { useRef, useLayoutEffect, useEffect } from 'react';

/**
 * @typedef {Object} Options
 * @property {boolean} [autoStartLoad=true] - Determines whether the loading of the stream should start automatically
 *   when the Hls.js instance is created.
 * @property {number} [startLevel=-1] - Specifies the initial quality level index to start playback with.
 * Use -1 for automatic level selection.
 * @property {number} [maxBufferLength=30] - Sets the maximum buffer length (in seconds) to keep for instant playback.
 * Adjust for optimizing buffering behavior.
 * @property {number} [[maxBufferSize=60 * 1000 * 1000]] - Defines the maximum buffer size (in bytes) for the media
 *   element. Useful for controlling memory usage.
 * @property {number} [maxMaxBufferLength=600] - Specifies the maximum buffer length (in seconds) for live content.
 * Adjust for optimizing live stream buffering.
 * @property {number} [liveSyncDurationCount=3] - Sets the number of target durations to keep in live synchronization
 *   of the manifest. Affects live stream synchronization.
 * @property {number} [liveMaxLatencyDurationCount=5] - Configures the number of target durations to keep in live
 *   synchronization for low-latency applications.
 * @property {boolean} [enableWorker=true] - Enables or disables the use of Web Workers for fetching and parsing
 *   segments. It Can improve performance.
 * @property {boolean} [enableSoftwareAES=true] - Enables or disables software-based AES decryption.
 * Adjust based on hardware support for decryption.
 * @property {boolean} [forceKeyFrameOnDiscontinuity=true] - Determines whether to force the generation of keyframes on
 *   discontinuity for better seeking in live streams.
 * @property {number} [levelLoadingTimeOut=10000] -
 * Sets the timeout (in milliseconds) for level loading. Useful for handling delays in loading levels.
 * @property {number} [manifestLoadingTimeOut=10000] - Sets the timeout (in milliseconds) for manifest loading.
 * Useful for handling delays in loading the manifest.
 * @property {function} [xhrSetup=null] - Allows customization of XHR setup function for handling XMLHttpRequest.
 * Useful for advanced use cases.
 * @property {boolean} [capLevelToPlayerSize=false] - Limits the selected quality level to the size of the player.
 * Useful for optimizing quality based on player dimensions.
 * @property {boolean} [startFragPrefetch=false] - Initiate fragment is prefetching to improve start-up time by loading
 *   fragments in advance.
 * @property {number} [appendErrorMaxRetry=3] - Specifies the maximum number of retries for appending a segment on
 *   error. Useful for handling segment append errors.
 */

/**
 * `usehlsvideoplayer`
 * is a React hook designed to simplify the integration of Hls.js for video playback in your React applications.
 * This hook creates a video player instance and manages the loading of an HTTP Live Streaming (HLS) video source.
 * With `usehlsvideoplayer`, you can effortlessly incorporate Hls.js functionality into your components.
 *
 * The hook takes care of cleaning up resources when the component unmounts.
 * It automatically detaches the Hls.js instance and removes event listeners.
 *
 * @example
 * // Basic Usage
 * import { Usehlsplayer } from 'usehlsvideoplayer';
 *
 * const YourComponent = () => {
 *   const videoSource = 'your-hls-video-source-url';
 *   const { videoRef } = Usehlsplayer(videoSource);
 *
 *   return (<div>
 *       <video ref={videoRef} controls>
 *         <source src={videoSource} type='application/x-mpegURL' />
 *       </video>
 *    </div>);
 * };
 *
 * @example
 * // Advanced Usage with Options
 * import { Usehlsplayer } from 'usehlsvideoplayer';
 *
 * const YourComponent = () => {
 *   const videoSource = 'your-hls-video-source-url';
 *   const { videoRef } = Usehlsplayer(videoSource, {
 *     startLevel: 2,
 *     maxBufferLength: 60,
 *     enableSoftwareAES: false,
 *     // Add more options as needed. Below are the list of options and their defaults.
 *   });
 *
 *   return (<div>
 *       <video ref={videoRef} controls>
 *         <source src={videoSource} type='application/x-mpegURL' />
 *       </video>
 *   </div>);
 * };
 *
 * @module usehlsvideoplayer
 * @function
 * @param {string} videoSource - The URL of the HLS video source to be loaded.
 * @param {Options} [options={}] - Optional configuration options for Hls.js.
 * @property {Object} videoRef - A React ref object for the video element.
 * @returns {Object} An object containing the video reference (`videoRef`).
 */

function Usehlsplayer(videoSource, options = {}) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const isomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
  const isHlsSupported = () => Hls?.isSupported();
  const createVideoElement = () => document.createElement('video');
  const isWebWorkerSupported = () => typeof Worker !== 'undefined';
  const checkAESSupport = async () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      try {
        await window.crypto.subtle.importKey('raw', new ArrayBuffer(16), {
          name: 'AES-CBC'
        }, false, ['encrypt', 'decrypt']);
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  };
  const initializeHlsInstance = async videoElement => {
    const isWorkerSupported = isWebWorkerSupported();
    const isAESSupported = await checkAESSupport();
    const hlsOptions = {
      enableWorker: isWorkerSupported && options.enableWorker,
      enableSoftwareAES: isAESSupported && options.enableSoftwareAES,
      ...options
    };
    hlsRef.current = new Hls(hlsOptions);
    try {
      await hlsRef.current.loadSource(videoSource);
      hlsRef.current.attachMedia(videoElement);
      hlsRef.current.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
    } catch (error) {
      handleInitializationError(error);
    }
  };
  const handleManifestParsed = () => {
    if (hlsRef.current.media && !isAnyBufferUpdating()) {
      hlsRef.current.media.duration = hlsRef.current.duration;
    }
  };
  const isAnyBufferUpdating = () => hlsRef.current?.media?.sourceBuffers.some(sb => sb.updating);
  const handleInitializationError = error => {
    console.error('Error initializing Hls.js:', error);
  };
  const initializeHls = async () => {
    if (!isHlsSupported() || !videoSource) {
      return;
    }
    const video = videoRef.current || createVideoElement();
    if (!hlsRef.current) {
      await initializeHlsInstance(video);
    }
  };
  isomorphicLayoutEffect(() => {
    const cleanupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
        hlsRef.current.destroy();
      }
    };
    const loadHls = async () => {
      try {
        await initializeHls();
      } catch (error) {
        console.error('Error during video loading:', error);
      }
    };
    const initializeAndLoadHls = async () => {
      await loadHls();
    };
    initializeAndLoadHls().catch(error => console.error('Error during initialize and Loading Hls:', error));
    return () => cleanupHls();
  }, [videoSource, options]);
  return {
    videoRef
  };
}

export { Usehlsplayer };
