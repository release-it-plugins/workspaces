module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:node/recommended', 'plugin:prettier/recommended'],
  plugins: ['prettier', 'node'],
  parserOptions: {
    ecmaVersion: 2020,
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
};
