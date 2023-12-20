import Hls from "hls.js";
import React, { DependencyList, EffectCallback, useEffect, useLayoutEffect, useRef } from "react";

type Options = {
	/**
	 * Determines whether the loading of the stream should start automatically
	 * when the Hls.js instance is created.
	 */
	autoStartLoad?: boolean;
	/**
	 * Specifies the initial quality level index to start playback with.
	 * Use -1 for automatic level selection.
	 */
	startLevel?: number;
	/**
	 * Sets the maximum buffer length (in seconds) to keep for instant playback.
	 * Adjust for optimizing buffering behavior.
	 */
	maxBufferLength?: number;
	/**
	 * Defines the maximum buffer size (in bytes) for the media
	 * element.
	 * Useful for controlling memory usage.
	 */
	maxBufferSize?: number;
	/**
	 * Specifies the maximum buffer length (in seconds) for live content.
	 * Adjust for optimizing live stream buffering.
	 */
	maxMaxBufferLength?: number;
	/**
	 * Sets the number of target durations to keep in live synchronization
	 * of the manifest.
	 * Affects live stream synchronization.
	 */
	liveSyncDurationCount?: number;
	/**
	 * Configures the number of target durations to keep in live
	 * synchronization for low-latency applications.
	 */
	liveMaxLatencyDurationCount?: number;
	/**
	 * Enables or disables the use of Web Workers for fetching and parsing
	 * segments.
	 * It Can improve performance.
	 */
	enableWorker?: boolean;
	/**
	 * Enables or disables software-based AES decryption.
	 * Adjust based on hardware support for decryption.
	 */
	enableSoftwareAES?: boolean;
	/**
	 * Determines whether to force the generation of keyframes on
	 * discontinuity for better seeking in live streams.
	 */
	forceKeyFrameOnDiscontinuity?: boolean;
	/**
	 * Sets the timeout (in milliseconds) for level loading. Useful for handling delays in loading levels.
	 */
	levelLoadingTimeOut?: number;
	/**
	 * Sets the timeout (in milliseconds) for manifest loading.
	 * Useful for handling delays in loading the manifest.
	 */
	manifestLoadingTimeOut?: number;
	/**
	 * Allows customization of XHR setup function for handling XMLHttpRequest.
	 * Useful for advanced use cases.
	 */
	xhrSetup?: () => void;
	/**
	 * Limits the selected quality level to the size of the player.
	 * Useful for optimizing quality based on player dimensions.
	 */
	capLevelToPlayerSize?: boolean;
	/**
	 * Initiate fragment is prefetching to improve start-up time by loading
	 * fragments in advance
	 */
	startFragPrefetch?: boolean;
	/**
	 * Specifies the maximum number of retries for appending a segment on
	 *   error. Useful for handling segment append errors.
	 */
	appendErrorMaxRetry?: number;
};

type HlsPlayerResult = {
	videoRef: React.RefObject<HTMLVideoElement>;
};

let useIsomorphicLayoutEffect: (effect: EffectCallback, deps?: DependencyList) => void;
if (typeof window !== 'undefined') {
	useIsomorphicLayoutEffect = useLayoutEffect;
} else {
	useIsomorphicLayoutEffect = useEffect;
}

/**
 * usehlsvideoplayer
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
export function Usehlsplayer(videoSource: string, options: Options = {}): HlsPlayerResult {
	const videoRef = useRef<HTMLVideoElement>(null);
	const hlsRef = useRef<Hls | null>(null);

	const isHlsSupported = () => Hls?.isSupported();
	const createVideoElement = () => document.createElement('video');
	const isWebWorkerSupported = () => typeof Worker !== 'undefined';
	const checkAESSupport = async (): Promise<boolean> => {
		if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
			try {
				await window.crypto.subtle.importKey(
					'raw',
					new ArrayBuffer(16),
					{ name: 'AES-CBC' },
					false,
					['encrypt', 'decrypt']
				);
				return true;
			} catch (error) {
				return false;
			}
		}
		return false;
	};

	const initializeHlsInstance = async (videoElement: HTMLVideoElement): Promise<void> => {
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

	const handleManifestParsed = (targetDuration: undefined): void => {
		if (hlsRef.current?.media && !isAnyBufferUpdating()) {
			hlsRef.current.media.currentTime = targetDuration;
		}
	};

	const isAnyBufferUpdating = (): boolean => {
		if (hlsRef.current) {
			const media = hlsRef.current.media;

			if (media) {
				const sourceBuffers = (media as HTMLMediaElement & {
					mozSourceBuffers?: SourceBufferList;
					sourceBuffers?: SourceBufferList;
				}).mozSourceBuffers || (media as HTMLMediaElement & {
					mozSourceBuffers?: SourceBufferList;
					sourceBuffers?: SourceBufferList;
				}).sourceBuffers;

				if (sourceBuffers) {
					return Array.from(sourceBuffers).some((sb: SourceBuffer) => sb.updating);
				}
			}
		}

		return false;
	};

	useIsomorphicLayoutEffect(() => {
		const initializeHls = async ():Promise<void> => {
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

		const loadHls = async (): Promise<void> => {
			try {
				await initializeHls();
			} catch (error) {
				throw new Error(`Error during video loading: ${error.message}`);
			}
		};

		const cleanupHls = (): void => {
			if (hlsRef.current) {
				hlsRef.current.off(Hls.Events.MANIFEST_PARSED, handleManifestParsed);
				hlsRef.current.destroy();
			}
		};

		const initializeAndLoadHls = async (): Promise<void> => {
			await loadHls();
		};

		initializeAndLoadHls().catch(error => {
			throw new Error(`Error during initialization and loading Hls: ${error.message}`);
		});

		return cleanupHls;
	}, [videoSource, options]);
	return { videoRef };
}
