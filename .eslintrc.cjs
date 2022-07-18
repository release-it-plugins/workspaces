module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:node/recommended', 'plugin:prettier/recommended'],
  plugins: ['prettier', 'node'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    node: true,
  },
  rules: {
    'node/no-missing-import': [
      'error',
      {
        // ignoring `release-it` as a devDep since there's an expectation that it's installed in the host package
        allowModules: ['release-it'],
      },
    ],
  },
  overrides: [
    {
      files: ['jest.setup.js', '__tests__/**/*.js'],
      env: {
        jest: true,
      },
    },
  ],
};
