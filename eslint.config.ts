import { eslintConfig } from '@kitschpatrol/eslint-config'

export default eslintConfig(
	{
		astro: true,
		ignores: [
			// Directives and attributes make a mess of MDX linting
			'playground/**/*.mdx',
			'playground-starlight/**/*',
			'references/**/*',
		],
		type: 'lib',
	},
	{
		files: ['playground/package.json'],
		rules: {
			// TODO remove after next shared-config release
			'json-package/require-keywords': 'off',
			'json-package/require-version': 'off',
			// Because of link to parent
			'json-package/valid-devDependencies': 'off',
			'json-package/valid-package-definition': 'off',
		},
	},
)
