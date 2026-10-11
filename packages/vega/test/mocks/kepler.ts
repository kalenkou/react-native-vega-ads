/** Stand-in for @amazon-devices/react-native-kepler in Jest. */
export const componentInstance = { name: 'test.main', type: 0, id: '1' };

export function useKeplerAppStateManager(): { getComponentInstance(): unknown } {
  return { getComponentInstance: () => componentInstance };
}
