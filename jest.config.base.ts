import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
  preset: 'ts-jest/presets/default-esm',
  testTimeout: 120000,
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { useESM: true, isolatedModules: true, tsconfig: '<rootDir>/tsconfig.jest.json' }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^webcrypto-core$': '<rootDir>/node_modules/webcrypto-core/build/webcrypto-core.js',
  },
  transformIgnorePatterns: ['/node_modules/'],
  coveragePathIgnorePatterns: ['/build/', '/node_modules/', '/__tests__/', 'tests'],
  coverageDirectory: '<rootDir>/coverage/',
  verbose: true,
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
}

export default config
