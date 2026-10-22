const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// No overrides: react-native-video's own *.kepler.ts files are picked by platform resolution.
module.exports = mergeConfig(getDefaultConfig(__dirname), {});
