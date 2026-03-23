import { knipConfig } from '@kitschpatrol/knip-config'

export default knipConfig({
	ignore: ['references/**/*'],
	ignoreDependencies: ['@types/unist'],
	ignoreFiles: ['playground/src/components/*'],
})
