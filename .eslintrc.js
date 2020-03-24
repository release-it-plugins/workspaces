module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:node/recommended', 'plugin:prettier/recommended'],
  plugins: ['prettier', 'node'],
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'script',
  },
  env: {
    node: true,
  },
  rules: {
    'node/no-unpublished-require': 'off',
  },
};
