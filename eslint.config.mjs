export default [
  {
    files: ['extension/*.js', 'scripts/*.js', 'tests/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        __dirname: 'readonly',
        global: 'readonly',
        chrome: 'readonly',
        GeminiBulkUtils: 'readonly',
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        console: 'readonly',
        globalThis: 'readonly',
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        MutationObserver: 'readonly',
        getComputedStyle: 'readonly',
        isFinite: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off'
    }
  }
];
