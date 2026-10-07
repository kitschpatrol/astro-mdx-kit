import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: true,
		type: 'lib',
	},
	{
		files: ['readme.md/*'],
		rules: {
			'import/no-unresolved': 'off',
		},
	},
)
