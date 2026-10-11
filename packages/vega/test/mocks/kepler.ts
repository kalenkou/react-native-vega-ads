/** Stand-in for @amazon-devices/react-native-kepler in Jest. */
export const componentInstance = { name: 'test.main', type: 0, id: '1' };

type Listener = (state: string) => void;
const listeners = new Set<Listener>();

const manager = {
  getComponentInstance: () => componentInstance,
  addAppStateListener: (_event: string, listener: Listener) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  },
};

export function useKeplerAppStateManager(): typeof manager {
  return manager;
}

/** Test helper: what the lifecycle manager reports on Home and on return. */
export function emitAppState(state: string): void {
  [...listeners].forEach((listener) => listener(state));
}

export function appStateListenerCount(): number {
  return listeners.size;
}
