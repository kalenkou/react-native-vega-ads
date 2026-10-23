import { adEventAd } from '../src/events';
import type { LinearAd } from '../src/vast';

function linear(
  ad: Record<string, unknown> = {},
  creative: Record<string, unknown> = {},
  more: Partial<LinearAd> = {},
): LinearAd {
  return {
    ad: { id: 'ad-1', title: 'Kettlo', advertiser: { value: 'Kettlo Ltd' }, ...ad },
    creative: { id: 'cr-1', duration: 15, universalAdIds: [{ value: 'UAID-1' }], ...creative },
    sequence: 2,
    skipAfter: 5,
    client: {},
    ...more,
  } as unknown as LinearAd;
}

describe('adEventAd', () => {
  it('gives the ad, creative and pod details of a VAST ad', () => {
    expect(adEventAd(linear())).toEqual({
      id: 'ad-1',
      creativeId: 'cr-1',
      universalAdId: 'UAID-1',
      title: 'Kettlo',
      advertiser: 'Kettlo Ltd',
      duration: 15,
      sequence: 2,
      skipAfter: 5,
    });
  });

  it('leaves out an empty Universal Ad ID and a blank advertiser, and trims the advertiser', () => {
    expect(adEventAd(linear({ advertiser: { value: '   ' } }, { universalAdIds: [{ value: '' }] }))).toMatchObject({
      universalAdId: undefined,
      advertiser: undefined,
    });
    expect(adEventAd(linear({ advertiser: { value: ' Brewnord \n' } })).advertiser).toBe('Brewnord');
  });

  it('works without a Universal Ad ID or an advertiser element', () => {
    const info = adEventAd(linear({ advertiser: undefined }, { universalAdIds: undefined }));
    expect(info.universalAdId).toBeUndefined();
    expect(info.advertiser).toBeUndefined();
    expect(adEventAd(linear({}, { universalAdIds: [] })).universalAdId).toBeUndefined();
  });

  it('reports a missing or negative duration as 0', () => {
    expect(adEventAd(linear({}, { duration: undefined })).duration).toBe(0);
    expect(adEventAd(linear({}, { duration: 0 })).duration).toBe(0);
    expect(adEventAd(linear({}, { duration: -1 })).duration).toBe(0);
    expect(adEventAd(linear({}, { duration: 0.5 })).duration).toBe(0.5);
  });
});
