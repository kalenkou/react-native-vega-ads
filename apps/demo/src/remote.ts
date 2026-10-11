// React Native for Vega exports useTVEventHandler; the RN 0.72 typings do not.
const {useTVEventHandler} = require('react-native') as {
  useTVEventHandler: (handler: (event: RemoteEvent) => void) => void;
};

export interface RemoteEvent {
  eventType: string;
  /** 0 when the key goes down, 1 when it comes up. */
  eventKeyAction?: number;
}

/** Calls `onKey` once per press of a remote key (on key down). */
export function useRemoteKeys(onKey: (key: string) => void): void {
  useTVEventHandler((event) => {
    if (event.eventKeyAction === undefined || event.eventKeyAction === 0) {
      onKey(event.eventType);
    }
  });
}
