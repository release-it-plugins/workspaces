export default {
  setupFilesAfterEnv: ['./jest.setup.js'],
  moduleFileExtensions: ['js', 'ts', 'mjs'],
  transform: {
    '^.+\\.[t|j]sx?$': 'babel-jest',
  },
  moduleNameMapper: {
    '#(.*)': '<rootDir>/node_modules/$1',
  },
  testEnvironment: 'jest-environment-node',
};
