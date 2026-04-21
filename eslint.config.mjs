// @ts-check

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import { fixupConfigRules } from '@eslint/compat';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: pluginJs.configs.recommended,
});

const config = [
  {
    // Global ignores
    ignores: ['.next/*', 'node_modules/', 'coverage/', 'dist/'],
  },
  {
    // General file settings
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {},
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Custom React rules (applied to relevant files)
    files: ['**/*.{jsx,tsx}'],
    rules: {
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',
    },
  },
  // This will load rules from 'eslint-config-next'
  ...fixupConfigRules(compat.extends('next/core-web-vitals')),

  // Prettier - MUST be last to override other formatting rules
  eslintPluginPrettierRecommended,
];

export default config;
