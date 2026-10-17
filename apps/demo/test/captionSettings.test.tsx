import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {
  type CaptionSettings,
  type CaptionSettingsSource,
  useCaptionSettings,
} from '../src/captionSettings';

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

function fakeSource(enabled: boolean, textSize?: string) {
  const handlers: {
    state?: (on: boolean) => void;
    prefs?: (p: {textSize?: string}) => void;
  } = {};
  const removed: string[] = [];
  const source = {
    isClosedCaptioningEnabled: async () => enabled,
    getCaptionPreferences: async () => ({textSize}),
    addClosedCaptioningStateListener: async (h: (on: boolean) => void) => {
      handlers.state = h;
      return true;
    },
    removeClosedCaptioningStateListener: async () => {
      removed.push('state');
    },
    addCaptioningPreferencesListener: async (
      h: (p: {textSize?: string}) => void,
    ) => {
      handlers.prefs = h;
      return true;
    },
    removeCaptioningPreferencesListener: async () => {
      removed.push('prefs');
    },
  } as unknown as CaptionSettingsSource;
  return {source, handlers, removed};
}

function mount(source: CaptionSettingsSource | null) {
  const seen: CaptionSettings[] = [];
  const Probe = () => {
    seen.push(useCaptionSettings(source));
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Probe />);
  });
  return {seen, renderer, last: () => seen[seen.length - 1]};
}

describe('useCaptionSettings', () => {
  it('follows the system Closed Captions switch and text size', async () => {
    const {source, handlers, removed} = fakeSource(true, 'large');
    const ctx = mount(source);
    expect(ctx.last()).toEqual({enabled: false, fontSize: 36});
    await act(settle);
    expect(ctx.last()).toEqual({enabled: true, fontSize: 46});

    act(() => handlers.state?.(false));
    expect(ctx.last()?.enabled).toBe(false);
    act(() => handlers.prefs?.({textSize: 'very_small'}));
    expect(ctx.last()?.fontSize).toBe(24);

    act(() => ctx.renderer.unmount());
    expect(removed.sort()).toEqual(['prefs', 'state']);
  });

  it('keeps the normal size for a size it does not know', async () => {
    const ctx = mount(fakeSource(true, 'huge').source);
    await act(settle);
    expect(ctx.last()).toEqual({enabled: true, fontSize: 36});
  });

  it('stays off on a device without the accessibility settings module', async () => {
    const ctx = mount(null);
    await act(settle);
    expect(ctx.last()).toEqual({enabled: false, fontSize: 36});
  });
});
