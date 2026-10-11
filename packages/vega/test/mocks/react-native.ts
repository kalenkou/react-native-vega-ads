/**
 * Minimal stand-in for react-native in Jest: host components are plain strings,
 * so react-test-renderer can render them without the native runtime.
 */
export const View = 'View';
export const Text = 'Text';
export const Image = 'Image';
export const TouchableOpacity = 'TouchableOpacity';

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  flatten: (style: unknown): Record<string, unknown> | undefined => {
    if (Array.isArray(style)) {
      return Object.assign({}, ...style.map((s) => StyleSheet.flatten(s) ?? {}));
    }
    return style ? (style as Record<string, unknown>) : undefined;
  },
};

export const Dimensions = {
  get: (): { width: number; height: number } => ({ width: 1920, height: 1080 }),
};

export const AccessibilityInfo = {
  announceForAccessibility: jest.fn(),
};

type BackListener = () => boolean;
const backListeners = new Set<BackListener>();

export const BackHandler = {
  addEventListener: jest.fn((_event: string, listener: BackListener) => {
    backListeners.add(listener);
    return { remove: () => backListeners.delete(listener) };
  }),
  /** Test helper: what the OS does on the Back key. Returns true when a listener handled it. */
  pressBack: (): boolean => [...backListeners].reverse().some((listener) => listener()),
  listenerCount: (): number => backListeners.size,
};
