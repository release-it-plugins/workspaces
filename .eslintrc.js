module.exports = {
  root: true,
  extends: ['eslint:recommended', 'plugin:node/recommended', 'prettier'],
  plugins: ['prettier', 'node'],
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: 'script',
  },
  env: {
    node: true,
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
