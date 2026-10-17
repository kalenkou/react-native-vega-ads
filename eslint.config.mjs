import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/.aws-sam/**', 'apps/**'] },
  ...tseslint.configs.recommended,
);
