/** Stand-in for @amazon-devices/react-native-w3cmedia in Jest (the real one is a C++ Turbo Module). */
export const KeplerVideoSurfaceView = 'KeplerVideoSurfaceView';

export class VideoPlayer {
  constructor() {
    throw new Error('tests pass createVideoPlayer; the real VideoPlayer is not available in Jest');
  }
}

/** The SDK's default media controls handler: every command acts on the player. */
export class KeplerMediaControlHandler {
  readonly handled: string[] = [];
  async handlePlay(): Promise<void> {
    this.handled.push('play');
  }
  async handlePause(): Promise<void> {
    this.handled.push('pause');
  }
  async handleTogglePlayPause(): Promise<void> {
    this.handled.push('toggle');
  }
  async handleStop(): Promise<void> {
    this.handled.push('stop');
  }
  async handleStartOver(): Promise<void> {
    this.handled.push('startOver');
  }
  async handleFastForward(): Promise<void> {
    this.handled.push('fastForward');
  }
  async handleRewind(): Promise<void> {
    this.handled.push('rewind');
  }
  async handleSeek(): Promise<void> {
    this.handled.push('seek');
  }
  async handleSkipForward(): Promise<void> {
    this.handled.push('skipForward');
  }
  async handleSkipBackward(): Promise<void> {
    this.handled.push('skipBackward');
  }
  async handleNext(): Promise<void> {
    this.handled.push('next');
  }
  async handlePrevious(): Promise<void> {
    this.handled.push('previous');
  }
  async handleSetPlaybackSpeed(): Promise<void> {
    this.handled.push('speed');
  }
}
