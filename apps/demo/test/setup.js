/* eslint-env jest */
// The demo is drawn for the 1920x1080 layout of React Native 0.72 on Vega: the tests see that
// window, so the lengths in its styles are the ones written in the code.
const {Dimensions} = require('react-native');

jest
  .spyOn(Dimensions, 'get')
  .mockReturnValue({width: 1920, height: 1080, scale: 1, fontScale: 1});

// The library's player modules load the w3cmedia Turbo Module, which Jest does not have.
jest.mock('@amazon-devices/react-native-w3cmedia', () => ({
  KeplerVideoSurfaceView: 'KeplerVideoSurfaceView',
  VideoPlayer: class {},
  KeplerMediaControlHandler: class {},
}));
