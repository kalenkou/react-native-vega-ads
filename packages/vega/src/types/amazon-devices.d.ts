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
}

declare module '@amazon-devices/react-native-kepler' {
  export function useKeplerAppStateManager(): { getComponentInstance(): unknown };
}
