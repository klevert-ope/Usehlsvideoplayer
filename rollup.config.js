import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'

/**
 * @param {import('rollup').RollupOptions} config
 * @returns {import('rollup').RollupOptions}
 */
const bundle = config => ({
	...config,
	input: 'src/useHlsVideoPlayer.ts',
	external: (id) => !/^[./]/.test(id)
})

export default [
	bundle({
		plugins: [esbuild()],
		output: [
			{
				file: `usehlsplayer.js`,
				format: 'cjs',
				sourcemap: true,
			},
			{
				file: `usehlsplayer.mjs`,
				format: 'es',
				sourcemap: true,
			},
		],
	}),
	bundle({
		plugins: [dts()],
		output: {
			file: `usehlsplayer.d.ts`,
			format: 'es',
		},
	}),
]
