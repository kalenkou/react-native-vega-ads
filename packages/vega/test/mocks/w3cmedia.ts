/** Stand-in for @amazon-devices/react-native-w3cmedia in Jest (the real one is a C++ Turbo Module). */
export const KeplerVideoSurfaceView = 'KeplerVideoSurfaceView';

export class VideoPlayer {
  constructor() {
    throw new Error('tests pass createVideoPlayer; the real VideoPlayer is not available in Jest');
  }
}
