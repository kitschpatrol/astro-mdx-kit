import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignoreDependencies: ['@types/unist', 'node-addon-api', 'node-gyp'],
	ignoreFiles: ['playground-*/**/*'],
	ignoreWorkspaces: [
		'playground-satteri',
		'playground-satteri-starlight',
		'playground-unified',
		'playground-unified-starlight',
	],
})
