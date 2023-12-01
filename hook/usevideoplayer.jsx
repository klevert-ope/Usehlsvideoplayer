// noinspection JSUnusedGlobalSymbols

import { useEffect, useRef } from 'react';

const Hls = require ('hls.js');

export function Usehlsplayer (videoSource) {
	const videoRef = useRef (null);
	const hlsRef = useRef (null);

	useEffect (() => {
		let isMounted = true;

		const loadHls = async () => {
			if (! isMounted || ! videoSource || ! Hls.isSupported ()) {
				return;
			}

			const video = videoRef.current || document.createElement ('video');
			if (! videoRef.current) {
				videoRef.current = video;
			}

			if (! hlsRef.current) {
				hlsRef.current = new Hls ();
				hlsRef.current.loadSource (videoSource);
				hlsRef.current.attachMedia (video);
				hlsRef.current.on (Hls.Events.MANIFEST_PARSED, () => {});
			}
		};

		loadHls ().catch (error => {
			console.error ('Error during video loading:', error);
		});

		return () => {
			isMounted = false;

			if (hlsRef.current) {
				hlsRef.current.off (Hls.Events.MANIFEST_PARSED, () => {});
				hlsRef.current.destroy ();
			}
		};
	}, [videoSource]);

	return { videoRef };
}
