import { adIdMacros } from '../src';
import { vegaAdIdSource } from '../src/vegaAdIdSource';

const retriever = (enabled: boolean, id = 'df07c7dc-cea7-4a89-b328-810ff5acb15d') => ({
  isAdvertisingTrackingEnabled: () => enabled,
  fetchAdvertisingId: () => id,
});

describe('vegaAdIdSource', () => {
  it('fills IFA and LIMITADTRACKING from AdIdRetriever when the user allows tracking', () => {
    expect(adIdMacros(vegaAdIdSource(retriever(true)))).toEqual({
      LIMITADTRACKING: '0',
      IFA: 'df07c7dc-cea7-4a89-b328-810ff5acb15d',
      IFATYPE: 'afai',
    });
  });

  it('sends no ID when the user opted out of interest-based ads', () => {
    expect(adIdMacros(vegaAdIdSource(retriever(false)))).toEqual({ LIMITADTRACKING: '1', IFA: '', IFATYPE: '' });
  });

  it('treats a failing ID service as an opt-out (the retriever throws)', () => {
    const broken = {
      isAdvertisingTrackingEnabled: (): boolean => {
        throw new Error('service not available');
      },
      fetchAdvertisingId: () => 'x',
    };
    expect(adIdMacros(vegaAdIdSource(broken)).LIMITADTRACKING).toBe('1');
  });
});
