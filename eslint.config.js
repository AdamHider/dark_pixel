import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/', 'tools/'] },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.browser
        }
    }
];
