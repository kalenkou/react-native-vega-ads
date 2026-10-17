import {useEffect, useState} from 'react';

/** The part of KeplerA11ySettingsInterface that the demo reads. */
export interface CaptionSettingsSource {
  isClosedCaptioningEnabled(): Promise<boolean>;
  getCaptionPreferences(): Promise<{textSize?: string}>;
  addClosedCaptioningStateListener(
    handler: (enabled: boolean) => void,
  ): Promise<boolean>;
  removeClosedCaptioningStateListener(): Promise<void>;
  addCaptioningPreferencesListener(
    handler: (preferences: {textSize?: string}) => void,
  ): Promise<boolean>;
  removeCaptioningPreferencesListener(): Promise<void>;
}

export interface CaptionSettings {
  /** Settings → Accessibility → Closed Captions. */
  enabled: boolean;
  /** The caption text size in the demo's 1920×1080 layout. */
  fontSize: number;
}

/**
 * The system caption text sizes in the demo's layout: "normal" matches its other body text
 * (36 px), and each step is about one size up or down.
 */
const FONT_SIZES: Record<string, number> = {
  very_small: 24,
  small: 30,
  normal: 36,
  large: 46,
  very_large: 56,
};
const NORMAL = FONT_SIZES.normal as number;

/**
 * The accessibility settings Turbo Module, or null when this device has none: the module looks
 * itself up when it is loaded, and throws there without it.
 */
export function systemCaptionSettings(): CaptionSettingsSource | null {
  try {
    const {KeplerA11ySettingsInterface} =
      require('@amazon-devices/kepler-a11y-settings-interface-turbo') as {
        KeplerA11ySettingsInterface: CaptionSettingsSource;
      };
    return KeplerA11ySettingsInterface;
  } catch {
    return null;
  }
}

const fontSize = (textSize?: string): number =>
  (textSize !== undefined ? FONT_SIZES[textSize] : undefined) ?? NORMAL;

/** The viewer's caption setting, kept up to date while the player is open. Off until it is read. */
export function useCaptionSettings(
  source: CaptionSettingsSource | null,
): CaptionSettings {
  const [settings, setSettings] = useState<CaptionSettings>({
    enabled: false,
    fontSize: NORMAL,
  });
  useEffect(() => {
    if (!source) {
      return undefined;
    }
    const update = (change: Partial<CaptionSettings>) =>
      setSettings((current) => ({...current, ...change}));
    Promise.all([
      source.isClosedCaptioningEnabled(),
      source.getCaptionPreferences(),
    ])
      .then(([enabled, preferences]) =>
        update({enabled, fontSize: fontSize(preferences.textSize)}),
      )
      .catch(() => undefined);
    source
      .addClosedCaptioningStateListener((enabled) => update({enabled}))
      .catch(() => false);
    source
      .addCaptioningPreferencesListener((preferences) =>
        update({fontSize: fontSize(preferences.textSize)}),
      )
      .catch(() => false);
    return () => {
      source.removeClosedCaptioningStateListener().catch(() => undefined);
      source.removeCaptioningPreferencesListener().catch(() => undefined);
    };
  }, [source]);
  return settings;
}
