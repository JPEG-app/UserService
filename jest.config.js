module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],

  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'babel-jest',
  },

  transformIgnorePatterns: [
    '/node_modules/(?!uuid|express-request-id)/',
  ],

  testTimeout: 20000,
  verbose: true,
  forceExit: true,
};