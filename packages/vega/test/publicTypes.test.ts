import type {
  AdIdSource,
  AdMediaControlOptions,
  AdSchedule,
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
      | undefined
    > = [];
    expect([schedule, macros, media, port, used]).toHaveLength(5);
  });
});
