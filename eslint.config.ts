import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: true,
		type: 'lib',
	},
	{
		files: ['playground/package.json', 'playground-starlight/package.json'],
		rules: {
			'json-package/require-keywords': 'off',
			'json-package/require-version': 'off',
			'json-package/valid-devDependencies': 'off',
			'json-package/valid-package-definition': 'off',
		},
	},
	{
		files: ['readme.md/*'],
		rules: {
			'import/no-unresolved': 'off',
		},
	},
)
