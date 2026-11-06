import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: true,
		ignores: ['**/changelog.md'],
		type: 'lib',
	},
	{
		files: ['readme.md/*'],
		rules: {
			'import/no-unresolved': 'off',
		},
	},
)
