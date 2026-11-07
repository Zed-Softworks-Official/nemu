/** @type {import('jest').Config} */
module.exports = {
    preset: 'jest-expo',
    testMatch: ['<rootDir>/src/**/*.test.ts?(x)'],
    moduleNameMapper: {
        '^~/(.*)$': '<rootDir>/src/$1',
    },
    setupFiles: ['<rootDir>/jest.setup.js'],
    // pnpm keeps packages under node_modules/.pnpm; transform RN/Expo code
    // there plus workspace packages, which ship TypeScript source.
    transformIgnorePatterns: [
        'node_modules/(?!(\\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|lucide-react-native|nativewind|react-native-css|@nemu/.*))',
    ],
}
