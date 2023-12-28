'use strict';

var Hls = require('hls.js');
var react = require('react');

/**
 * @file
 * usehlsvideoplayer is a React hook
 * designed to simplify the integration of Hls.js for video playback in your React applications.
 * This hook creates a video player instance and manages the loading of an HTTP Live Streaming (HLS) video source.
 * With usehlsvideoplayer, you can effortlessly incorporate Hls.js functionality into your components.
 * The hook takes care of cleaning up resources when the component unmounts.
 * It automatically detaches the Hls.js instance and removes event listeners.
 * @copyright (c) 2023 Klevert Opee
 * @license ISC
 */
let useIsomorphicLayoutEffect;
if (typeof window !== "undefined") {
  useIsomorphicLayoutEffect = react.useLayoutEffect;
} else {
  useIsomorphicLayoutEffect = react.useEffect;
}
function Usehlsplayer(videoSource, options = {}) {
  const videoRef = react.useRef(null);
  const hlsRef = react.useRef(null);
  const isHlsSupported = () => Hls?.isSupported();
  const createVideoElement = () => document.createElement("video");
  const isWebWorkerSupported = () => typeof Worker !== "undefined";
  const checkAESSupport = async () => {
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      try {
        await window.crypto.subtle.importKey(
          "raw",
          new ArrayBuffer(16),
          { name: "AES-CBC" },
          false,
          ["encrypt", "decrypt"]
        );
        return true;
      } catch (error) {
        return false;
      }
    }
    return false;
  };
  const initializeHlsInstance = async (videoElement) => {
    const isWorkerSupported = isWebWorkerSupported();
    const isAESSupported = await checkAESSupport();
    const hlsOptions = {
      enableWorker: isWorkerSupported && options.enableWorker,
      enableSoftwareAES: isAESSupported && options.enableSoftwareAES,
      ...options
    };
    hlsRef.current = new Hls(hlsOptions);
    try {
      hlsRef.current.loadSource(videoSource);
      hlsRef.current.attachMedia(videoElement);
      hlsRef.current.on(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
    } catch (error) {
      throw new Error(`Error initializing Hls.js: ${error.message}`);
    }
  };
  const handleManifestParsed = (targetDuration) => {
    if (hlsRef.current?.media && !isAnyBufferUpdating()) {
      hlsRef.current.media.currentTime = targetDuration;
    }
  };
  const isAnyBufferUpdating = () => {
    if (hlsRef.current) {
      const media = hlsRef.current.media;
      if (media) {
        const sourceBuffers = media.mozSourceBuffers || media.sourceBuffers;
        if (sourceBuffers) {
          return Array.from(sourceBuffers).some((sb) => sb.updating);
        }
      }
    }
    return false;
  };
  useIsomorphicLayoutEffect(() => {
    const initializeHls = async () => {
      if (!isHlsSupported() || !videoSource) {
        return;
      }
      const video = videoRef.current || createVideoElement();
      if (!hlsRef.current) {
        try {
          await initializeHlsInstance(video);
        } catch (error) {
          throw new Error(`Error during Hls initialization: ${error.message}`);
        }
      }
    };
    const loadHls = async () => {
      try {
        await initializeHls();
      } catch (error) {
        throw new Error(`Error during video loading: ${error.message}`);
      }
    };
    const cleanupHls = () => {
      if (hlsRef.current) {
        hlsRef.current.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
        hlsRef.current.destroy();
      }
    };
    const initializeAndLoadHls = async () => {
      await loadHls();
    };
    initializeAndLoadHls().catch((error) => {
      throw new Error(`Error during initialization and loading Hls: ${error.message}`);
    });
    return cleanupHls;
  }, [videoSource, options]);
  return { videoRef };
}

exports.Usehlsplayer = Usehlsplayer;
//# sourceMappingURL=usehlsplayer.js.map
