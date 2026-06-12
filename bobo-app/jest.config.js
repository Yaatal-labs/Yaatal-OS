module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/store/**/*.ts',
    'src/utils/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^pocketbase$': '<rootDir>/node_modules/pocketbase/dist/pocketbase.cjs.js',
    '^@yaatal/client$': '<rootDir>/__mocks__/yaatal-client.js',
    '^expo-speech$': '<rootDir>/__mocks__/expo-speech.js',
    '^expo-av$': '<rootDir>/__mocks__/expo-av.js',
    '^expo-image-picker$': '<rootDir>/__mocks__/expo-image-picker.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/src/navigation/', '/src/components/', '/src/screens/'],
};


