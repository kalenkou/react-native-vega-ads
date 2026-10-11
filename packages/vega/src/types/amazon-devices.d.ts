/**
 * The few Vega SDK symbols this package uses at run time. The SDK packages are
 * peer dependencies; declaring them here keeps the build free of the SDK.
 */
declare module '@amazon-devices/react-native-w3cmedia' {
  import type { ComponentType } from 'react';
  import type { ViewProps } from 'react-native';

  export const KeplerVideoSurfaceView: ComponentType<
    ViewProps & {
      onSurfaceViewCreated?: (handle: string) => void;
      onSurfaceViewDestroyed?: (handle: string) => void;
      scalingmode?: string;
    }
  >;

  export class VideoPlayer {
    constructor();
  }

  /** The SDK's default media controls handler; override a method to change one command. */
  export class KeplerMediaControlHandler {
    handlePlay(...args: unknown[]): Promise<void>;
    handlePause(...args: unknown[]): Promise<void>;
    handleTogglePlayPause(...args: unknown[]): Promise<void>;
    handleStop(...args: unknown[]): Promise<void>;
    handleStartOver(...args: unknown[]): Promise<void>;
    handleFastForward(...args: unknown[]): Promise<void>;
    handleRewind(...args: unknown[]): Promise<void>;
    handleSeek(...args: unknown[]): Promise<void>;
    handleSkipForward(...args: unknown[]): Promise<void>;
    handleSkipBackward(...args: unknown[]): Promise<void>;
    handleNext(...args: unknown[]): Promise<void>;
    handlePrevious(...args: unknown[]): Promise<void>;
    handleSetPlaybackSpeed(...args: unknown[]): Promise<void>;
  }
}

declare module '@amazon-devices/react-native-kepler' {
  export function useKeplerAppStateManager(): { getComponentInstance(): unknown };
}
