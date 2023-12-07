const Hls = require ('hls.js');
import { useEffect, useRef } from 'react';

export function Usehlsplayer (videoSource, options = {}) {
	const videoRef = useRef (null);
	const hlsRef = useRef (null);

	useEffect (() => {
		let isMounted = true;
		const video = videoRef.current || document.createElement ('video');

		const loadHls = async () => {
			if (! isMounted || ! videoSource || ! Hls.isSupported ()) {
				return;
			}

			if (! hlsRef.current) {
				hlsRef.current = new Hls ({ ...options });
				try {
					await hlsRef.current.loadSource (videoSource);
					hlsRef.current.attachMedia (video);
					hlsRef.current.on (Hls.Events.MANIFEST_PARSED, () => {});
				} catch (error) {
					console.error ('Error initializing Hls.js:', error);
				}
			}
		};

		loadHls ().catch ((error) => {
			console.error ('Error during video loading:', error);
		});

		return () => {
			isMounted = false;

			if (hlsRef.current) {
				hlsRef.current.off (Hls.Events.MANIFEST_PARSED, () => {});
				hlsRef.current.destroy ();
			}
		};
	}, [videoSource, options]);

	return { videoRef };
}
