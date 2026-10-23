import type {
  AdEventHandler,
  AdEventName,
  AdIdSource,
  AdMediaControlOptions,
  AdSchedule,
  AdSkipButtonProps,
  AdStyles,
  BreakWhy,
  ClockPort,
  HttpPort,
  AdUiState,
  AdUiStrings,
  Macros,
  MediaFileOptions,
  PlayerPort,
  SessionSnapshot,
} from '../src';

// The types the public API takes or returns come from this package, so an app needs no
// direct dependency on react-native-ads-core (strict package managers such as pnpm).
describe('public types', () => {
  it('names every type the API takes or returns', () => {
    const schedule: AdSchedule = { vmapUrl: 'https://ads.test/vmap.xml' };
    const macros: Macros = { IFA: 'id' };
    const media: MediaFileOptions = { maxHeight: 1080 };
    const port: Pick<PlayerPort, 'pause'> = { pause: () => undefined };
    const used: Array<
      | AdUiState
      | AdUiStrings
      | SessionSnapshot
      | HttpPort
      | ClockPort
      | AdIdSource
      | AdMediaControlOptions
      | BreakWhy
      | AdStyles
      | AdSkipButtonProps
      | undefined
    > = [];
    // The real check is the type check of this file (ts-jest compiles it): it fails to compile if a type is not exported.
    expect([schedule, macros, media, port, used]).toHaveLength(5);
  });

  it('names the ad events for autocompletion, and the handler still takes any string', () => {
    const names: AdEventName[] = [
      'impression',
      'error:405',
      'break:break-1:late',
      'loudness:-3.5',
      'pauseAd:close',
      'vmap:error:1009',
      'skipped:category',
    ];
    // @ts-expect-error a typo is not an event name
    const typo: AdEventName = 'impresion';
    const seen: string[] = [];
    const handler: AdEventHandler = (name) => seen.push(name);
    handler('an event from a newer version', {});
    // The names and the typo are checked when this file compiles. At run time only the handler is.
    void [names, typo];
    expect(seen).toEqual(['an event from a newer version']);
  });
});
