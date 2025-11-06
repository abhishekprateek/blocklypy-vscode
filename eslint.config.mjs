import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const typeCheckedConfig = typescriptEslint.configs['recommended-type-checked'];

export default [
    {
        files: ['**/*.ts'],
        ignores: ['dist/**', 'out/**', '**/*.d.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                // Use a dedicated tsconfig for linting (see tsconfig.eslint.json below)
                project: [path.join(__dirname, 'tsconfig.json')],
                tsconfigRootDir: __dirname,
                sourceType: 'module',
            },
            ecmaVersion: 2022,
        },
        plugins: {
            '@typescript-eslint': typescriptEslint,
        },
        rules: {
            // Use the type-checked recommended set
            ...typeCheckedConfig.rules,

            // Your customizations
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': [
                'error',
                { checksVoidReturn: { attributes: false } },
            ],
            '@typescript-eslint/return-await': ['error', 'in-try-catch'],
            // '@typescript-eslint/naming-convention': [
            //     'warn',
            //     { selector: 'import', format: ['camelCase', 'PascalCase'] },
            // ],
            '@typescript-eslint/no-unsafe-enum-comparison': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    caughtErrors: 'all',
                    caughtErrorsIgnorePattern: '^_',
                    destructuredArrayIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],

            // Plain ESLint core rules
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn',
            curly: 'off',
        },
    },
    // (Optional) JS files without type-aware rules
    {
        files: ['**/*.js'],
        rules: {
            // Add lightweight JS rules if needed
        },
    },
];
