import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // The React Compiler lints bundled with eslint-plugin-react-hooks v7 are
      // off: this app runs an imperative physics simulation that intentionally
      // mutates sim-node objects held in refs and publishes layout via setState
      // inside requestAnimationFrame/effects. These are correct by design here,
      // not bugs. (The classic rules-of-hooks / exhaustive-deps rules stay on.)
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      // HMR-only granularity rule; our context/util files legitimately co-export
      // hooks and helpers alongside components.
      'react-refresh/only-export-components': 'off',
    },
  },
])
