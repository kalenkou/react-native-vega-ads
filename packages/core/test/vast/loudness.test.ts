import { adLoudness, loudnessGain } from '../../src/vast/loudness';
import type { LinearAd } from '../../src/vast';

function withExtensions(creativeExtensions: unknown): LinearAd {
  return { creative: { creativeExtensions } } as unknown as LinearAd;
}

const ext = (type: string, children: Array<{ name: string; value: string | null }>) => ({
  name: 'CreativeExtension',
  value: null,
  attributes: { type },
  children: children.map((c) => ({ ...c, attributes: {}, children: [] })),
});

describe('adLoudness', () => {
  it('reads IntegratedLoudness from the loudness creative extension', () => {
    expect(
      adLoudness(
        withExtensions([ext('tl_qrcode', []), ext('loudness', [{ name: 'IntegratedLoudness', value: ' -16.5 ' }])]),
      ),
    ).toBe(-16.5);
  });

  it('is null without the extension, without a number, or for another extension', () => {
    expect(adLoudness(withExtensions(undefined))).toBeNull();
    expect(adLoudness(withExtensions([ext('loudness', [{ name: 'IntegratedLoudness', value: 'loud' }])]))).toBeNull();
    expect(
      adLoudness(withExtensions([ext('loudness', [{ name: 'IntegratedLoudness', value: 'Infinity' }])])),
    ).toBeNull();
    expect(adLoudness(withExtensions([ext('other', [{ name: 'IntegratedLoudness', value: '-16' }])]))).toBeNull();
  });
});

describe('loudnessGain', () => {
  it('turns a louder ad down by the difference, and never turns an ad up', () => {
    expect(loudnessGain(-16, -24)).toBe(0.398);
    expect(loudnessGain(-24, -24)).toBe(1);
    expect(loudnessGain(-30, -24)).toBe(1);
  });
});
