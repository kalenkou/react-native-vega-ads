import { readFileSync } from 'fs';
import TestRenderer, { act } from 'react-test-renderer';
import { BackHandler } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const kepler = require('@amazon-devices/react-native-kepler') as { emitAppState(state: string): void; appStateListenerCount(): number };
import { FakeClock } from '../../core/test/fakes/FakeClock';
import { FakeHttp } from '../../core/test/fakes/FakeHttp';
import { useVegaAds, UseVegaAdsOptions, VegaAds } from '../src/useVegaAds';
import { FakeW3cPlayer } from './fakes/FakeW3cPlayer';
import { W3cPlayerAdapter } from '../src/W3cPlayerAdapter';

const back = BackHandler as unknown as { pressBack(): boolean; listenerCount(): number };
const inline = readFileSync(`${__dirname}/../../core/fixtures/vast/inline.xml`, 'utf8');
const PRE = 'https://ads.test/pre.xml';

const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  g.window = g;
  delete g.Image;
});
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => {
    mounted.splice(0).forEach((r) => r.unmount());
  });
  delete g.window;
  delete g.Image;
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

function Harness({ options, out }: { options: UseVegaAdsOptions; out: { current: VegaAds | null } }): null {
  out.current = useVegaAds(options);
  return null;
}

function setup(overrides: Partial<UseVegaAdsOptions> = {}) {
  const http = new FakeHttp().on(PRE, { body: inline });
  const clock = new FakeClock(1_000_000);
  const content = new FakeW3cPlayer(600);
  content.autoplay = false;
  const adPlayers: FakeW3cPlayer[] = [];
  const events: string[] = [];
  const out: { current: VegaAds | null } = { current: null };
  const base: UseVegaAdsOptions = {
    source: { breaks: [{ offset: 'start', vastUrl: PRE }] },
    contentPlayer: content,
    componentInstance: () => ({ name: 'main' }),
    http,
    clock,
    createVideoPlayer: () => {
      const player = new FakeW3cPlayer(10);
      adPlayers.push(player);
      return player;
    },
    onEvent: (name) => events.push(name),
    ...overrides,
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness options={base} out={out} />);
  });
  mounted.push(renderer);
  const rerender = (next: Partial<UseVegaAdsOptions>): void => {
    act(() => {
      renderer.update(<Harness options={{ ...base, ...next }} out={out} />);
    });
  };
  const ads = (): VegaAds => out.current as VegaAds;
  const surfacesReady = async (): Promise<void> => {
    act(() => ads().surfaces.onContentSurface('c1'));
    act(() => ads().surfaces.onAdSurface('a1'));
    act(() => ads().surfaces.onStandbySurface('b1'));
    await settle();
  };
  const lastAd = (): FakeW3cPlayer => adPlayers[adPlayers.length - 1] as FakeW3cPlayer;
  /** Pre-roll prebuffered and on screen. */
  const prerollPlaying = async (): Promise<FakeW3cPlayer> => {
    await surfacesReady();
    act(() => {
      lastAd().emit('canplay');
    });
    await settle();
    act(() => {
      lastAd().emit('playing');
      // Media controls move to the ad right after its first frame is tracked.
      clock.advance(0);
    });
    await settle();
    return lastAd();
  };
  return { http, clock, content, adPlayers, events, renderer, rerender, ads, surfacesReady, lastAd, prerollPlaying };
}

describe('useVegaAds', () => {
  it('waits for the content player and both ad surfaces', async () => {
    const ctx = setup({ contentPlayer: null });
    act(() => ctx.ads().surfaces.onContentSurface('c1'));
    act(() => ctx.ads().surfaces.onAdSurface('a1'));
    await settle();
    expect(ctx.http.requests).toEqual([]);

    act(() => ctx.ads().surfaces.onStandbySurface('b1'));
    await settle();
    expect(ctx.http.requests).toEqual([]);

    ctx.rerender({ contentPlayer: ctx.content });
    await settle();
    expect(ctx.http.requests).toEqual([PRE]);
  });

  it('waits for the content surface, so the content never starts without a picture', async () => {
    const ctx = setup({ source: { breaks: [] } });
    act(() => ctx.ads().surfaces.onAdSurface('a1'));
    act(() => ctx.ads().surfaces.onStandbySurface('b1'));
    await settle();
    expect(ctx.content.calls).not.toContain('play');
    act(() => ctx.ads().surfaces.onContentSurface('c1'));
    await settle();
    expect(ctx.content.calls).toContain('play');
  });

  it('does not repeat the pre-roll when the surfaces are recreated', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    act(() => {
      ad.currentTime = 10;
      ad.emit('timeupdate');
      ad.emit('ended');
    });
    await settle();
    ctx.content.currentTime = 33;
    act(() => ctx.ads().surfaces.onAdSurface(null)); // for example, after the app comes back
    act(() => ctx.ads().surfaces.onAdSurface('a2'));
    await settle();
    expect(ctx.http.requests.filter((url) => url === PRE)).toHaveLength(1);
  });

  it('plays the pre-roll after all when the surfaces are recreated before anything was shown (E1-2)', async () => {
    const ctx = setup();
    await ctx.surfacesReady(); // pre-roll loaded, its player waits for canplay
    act(() => ctx.ads().surfaces.onAdSurface(null));
    act(() => ctx.ads().surfaces.onAdSurface('a2'));
    await settle();
    expect(ctx.http.requests.filter((url) => url === PRE)).toHaveLength(2);
    expect(ctx.content.calls).not.toContain('play');
  });

  it('does not repeat a pre-roll that was already on screen when the surfaces are recreated', async () => {
    const ctx = setup();
    await ctx.prerollPlaying(); // impression sent
    act(() => ctx.ads().surfaces.onAdSurface(null));
    act(() => ctx.ads().surfaces.onAdSurface('a2'));
    await settle();
    expect(ctx.http.requests.filter((url) => url === PRE)).toHaveLength(1);
  });

  it('tells the app when an ad is on screen', async () => {
    const ctx = setup();
    await ctx.surfacesReady();
    expect(ctx.ads().playing).toBe(false);
    act(() => {
      ctx.lastAd().emit('canplay');
    });
    await settle();
    act(() => {
      ctx.lastAd().emit('playing');
    });
    await settle();
    expect(ctx.ads().playing).toBe(true);
  });

  it('waits for a source', async () => {
    const ctx = setup({ source: null });
    await ctx.surfacesReady();
    expect(ctx.http.requests).toEqual([]);
  });

  it('plays a pre-roll on surface A and shows the overlay state', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    expect(ad.calls).toContain('surface:a1');
    expect(ctx.ads().snapshot.state).toBe('playing');
    expect(ctx.ads().surfaces.shown).toBe('a1');
    expect(ctx.ads().ui.visible).toBe(true);
    expect(ctx.ads().ui.label).toBe('Ad · 0:10');
    expect(ctx.content.calls).not.toContain('play');
  });

  it('returns to the content and hides the overlay after the ad', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    ad.currentTime = 10;
    act(() => {
      ad.emit('timeupdate');
    });
    act(() => {
      ad.emit('ended');
    });
    await settle();
    expect(ctx.ads().ui.visible).toBe(false);
    expect(ctx.ads().surfaces.shown).toBeNull();
    expect(ctx.content.calls).toContain('play');
    expect(ad.deinitialized).toBe(true);
  });

  it('sends ad pixels through the given http port', async () => {
    const ctx = setup();
    await ctx.prerollPlaying();
    expect(ctx.http.requests.some((url) => url.startsWith('https://t.test/impression'))).toBe(true);
  });

  it('passes the macros to the ad tracker', async () => {
    const http = new FakeHttp().on(PRE, {
      body: inline.replace('https://t.test/impression2?ad=1', 'https://t.test/impression2?lat=[LIMITADTRACKING]'),
    });
    const ctx = setup({ http, macros: { LIMITADTRACKING: '1' } });
    await ctx.prerollPlaying();
    expect(http.requests).toContain('https://t.test/impression2?lat=1');
  });

  it('skip() is refused for a non-skippable ad', async () => {
    const ctx = setup();
    await ctx.prerollPlaying();
    let result = true;
    act(() => {
      result = ctx.ads().skip();
    });
    expect(result).toBe(false);
  });

  it('togglePause() lets the app remote handler pause the ad (no media controls manifest needed)', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    let result = false;
    act(() => {
      result = ctx.ads().togglePause();
    });
    expect(result).toBe(true);
    expect(ad.calls).toContain('pause');
  });

  it('gives the ad player a media controls handler that blocks seeking (R21)', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    expect(ad.calls).toContain('focus:AdMediaControlHandler');
  });

  it('gives the content its own media controls handler back after the ad', async () => {
    const ctx = setup({ contentMediaControlHandler: { id: 'app-handler' } });
    const ad = await ctx.prerollPlaying();
    act(() => {
      ad.currentTime = 10;
      ad.emit('timeupdate');
      ad.emit('ended');
    });
    await settle();
    expect(ctx.content.calls).toContain('focus:app-handler');
  });

  it('adPause: false keeps the ad playing on the app key handler too', async () => {
    const ctx = setup({ adPause: false });
    const ad = await ctx.prerollPlaying();
    let result = true;
    act(() => {
      result = ctx.ads().togglePause();
    });
    expect(result).toBe(false);
    expect(ad.calls).not.toContain('pause');
    // The remote and voice path (media controls) ignores pause too.
    const handler = ad.mediaControlHandler as { handlePause(): Promise<void>; handled: string[] };
    await handler.handlePause();
    expect(handler.handled).toEqual([]);
  });

  it('keeps the ads running when the app passes a new PlayerPort object on every render', async () => {
    const native = new FakeW3cPlayer(600);
    const out: { current: VegaAds | null } = { current: null };
    const http = new FakeHttp().on(PRE, { body: inline });
    const ads: FakeW3cPlayer[] = [];
    function InlinePort(): null {
      out.current = useVegaAds({
        source: { breaks: [{ offset: 'start', vastUrl: PRE }] },
        contentPlayer: new W3cPlayerAdapter(native, () => ({ name: 'main' })),
        http,
        clock: new FakeClock(0),
        createVideoPlayer: () => {
          const p = new FakeW3cPlayer(10);
          ads.push(p);
          return p;
        },
      });
      return null;
    }
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<InlinePort />);
    });
    mounted.push(renderer);
    act(() => out.current?.surfaces.onContentSurface('c1'));
    act(() => out.current?.surfaces.onAdSurface('a1'));
    act(() => out.current?.surfaces.onStandbySurface('b1'));
    await settle();
    act(() => {
      ads[0]?.emit('canplay');
    });
    await settle();
    act(() => {
      ads[0]?.emit('playing');
    });
    await settle();
    expect(http.requests.filter((u) => u === PRE)).toHaveLength(1);
    expect(ads).toHaveLength(1);
    expect(out.current?.playing).toBe(true);
  });

  it('accepts any content player through PlayerPort', async () => {
    const native = new FakeW3cPlayer(600);
    const port = new W3cPlayerAdapter(native, () => ({ name: 'main' }));
    const ctx = setup({ source: { breaks: [] }, contentPlayer: port });
    await ctx.surfacesReady();
    expect(native.calls).toContain('play');
  });

  it('mediaControls: false never takes media controls focus (app handles the remote itself)', async () => {
    const ctx = setup({ mediaControls: false });
    const ad = await ctx.prerollPlaying();
    act(() => {
      ad.currentTime = 10;
      ad.emit('timeupdate');
      ad.emit('ended');
    });
    await settle();
    expect(ad.calls.filter((c) => c.startsWith('focus'))).toEqual([]);
    expect(ctx.content.calls.filter((c) => c.startsWith('focus'))).toEqual([]);
    expect(ctx.content.calls).toContain('play');
  });

  it('passes avoidRepeats to the ads: off, the same creative plays again in the next break', async () => {
    const MID = 'https://ads.test/mid.xml';
    const run = async (avoidRepeats?: false) => {
      const ctx = setup({
        source: { breaks: [{ offset: 'start', vastUrl: PRE }, { offset: 30, vastUrl: MID }] },
        avoidRepeats,
      });
      ctx.http.on(MID, { body: inline });
      const ad = await ctx.prerollPlaying();
      act(() => {
        ad.emit('timeupdate');
        ad.emit('ended');
      });
      await settle();
      act(() => {
        ctx.clock.advance(15_000);
        ctx.content.currentTime = 15;
        ctx.content.emit('timeupdate');
      });
      await settle();
      return ctx.events;
    };
    expect(await run()).toContain('skipped:repeat');
    expect(await run(false)).not.toContain('skipped:repeat');
  });

  it('passes the break limits to the ads and to the ad server', async () => {
    const tag = 'https://ads.test/pre.xml?ads=[BREAKMAXADS]&dur=[BREAKMAXDURATION]';
    const ctx = setup({ source: { breaks: [{ offset: 'start', vastUrl: tag }] }, maxBreakAds: 2, maxBreakSeconds: 90 });
    await ctx.surfacesReady();
    expect(ctx.http.requests).toEqual(['https://ads.test/pre.xml?ads=2&dur=90']);
  });

  it('turns ads louder than the content down to its loudness', async () => {
    const loud = readFileSync(`${__dirname}/../../core/fixtures/vast/inline-loud.xml`, 'utf8');
    const ctx = setup({ source: { breaks: [{ offset: 'start', vastUrl: 'https://ads.test/loud.xml' }] }, contentLoudness: -24 });
    ctx.http.on('https://ads.test/loud.xml', { body: loud });
    await ctx.surfacesReady();
    expect(ctx.lastAd().volume).toBe(0.398);
  });

  it('fetches the ad captions in the viewer language', async () => {
    const files =
      '<ClosedCaptionFiles><ClosedCaptionFile type="text/vtt" language="en"><![CDATA[https://cdn.test/ad.en.vtt]]></ClosedCaptionFile>' +
      '<ClosedCaptionFile type="text/vtt" language="de"><![CDATA[https://cdn.test/ad.de.vtt]]></ClosedCaptionFile></ClosedCaptionFiles>';
    const ctx = setup({ captionLanguage: 'de-DE' });
    ctx.http.on(PRE, { body: inline.replace('</MediaFiles>', `${files}</MediaFiles>`) });
    await ctx.surfacesReady();
    expect(ctx.http.requests).toContain('https://cdn.test/ad.de.vtt');
    expect(ctx.http.requests).not.toContain('https://cdn.test/ad.en.vtt');
  });

  it('shows a pause ad on "Alexa, pause", which reaches the content media controls but sends no pause event', async () => {
    const PAUSE = 'https://ads.test/pause.xml';
    const ctx = setup({ source: { breaks: [] }, pauseAdUrl: PAUSE });
    ctx.http.on(PAUSE, { body: readFileSync(`${__dirname}/../../core/fixtures/vast/pause.xml`, 'utf8') });
    await ctx.surfacesReady();
    const handler = ctx.content.mediaControlHandler as { handlePause(): Promise<void>; handled: string[] };
    await act(async () => {
      await handler.handlePause();
      ctx.clock.advance(1_500);
    });
    await settle();
    expect(handler.handled).toContain('pause');
    expect(ctx.ads().pauseAd).toMatchObject({ imageUrl: 'https://cdn.test/pause.png' });
  });

  it('shows a pause ad when the viewer pauses the content, and Back closes it', async () => {
    const PAUSE = 'https://ads.test/pause.xml';
    const ctx = setup({ source: { breaks: [] }, pauseAdUrl: PAUSE });
    ctx.http.on(PAUSE, { body: readFileSync(`${__dirname}/../../core/fixtures/vast/pause.xml`, 'utf8') });
    await ctx.surfacesReady();
    expect(ctx.ads().pauseAd).toBeNull();
    expect(back.pressBack()).toBe(false); // nothing on screen: Back is the app's
    act(() => {
      ctx.content.emit('pause');
      ctx.clock.advance(1_500);
    });
    await settle();
    expect(ctx.ads().pauseAd).toMatchObject({ imageUrl: 'https://cdn.test/pause.png' });
    let handled = false;
    act(() => {
      handled = back.pressBack();
    });
    await settle();
    expect(handled).toBe(true);
    expect(ctx.ads().pauseAd).toBeNull();
    expect(ctx.events).toContain('pauseAd:close');
  });

  it('tells the app when the content and its post-roll are over', async () => {
    const ctx = setup({ source: { breaks: [] } });
    await ctx.surfacesReady();
    expect(ctx.ads().ended).toBe(false);
    act(() => {
      ctx.content.emit('ended');
    });
    await settle();
    expect(ctx.ads().ended).toBe(true);
  });

  it('leaves Back during an ad to the app, as in the content: an ad cannot be skipped with Back (R23)', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    let handled = true;
    act(() => {
      handled = back.pressBack();
    });
    await settle();
    expect(handled).toBe(false);
    expect(ad.deinitialized).toBe(false);
    expect(ctx.content.calls).not.toContain('play');
    expect(ctx.ads().playing).toBe(true);
  });

  it("with backDuringAd 'content', Back during an ad returns to the content and is consumed (R23)", async () => {
    const ctx = setup({ backDuringAd: 'content' });
    const ad = await ctx.prerollPlaying();
    let handled = false;
    act(() => {
      handled = back.pressBack();
    });
    await settle();
    expect(handled).toBe(true);
    expect(ad.deinitialized).toBe(true);
    expect(ctx.content.calls).toContain('play');
    expect(ctx.events).not.toContain('skip');
  });

  it('leaves Back to the app outside ads', async () => {
    const ctx = setup({ source: { breaks: [] } });
    await ctx.surfacesReady();
    expect(back.pressBack()).toBe(false);
  });

  it('in the background releases the ad players; back in front the content continues (R13)', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    act(() => kepler.emitAppState('background'));
    await settle();
    expect(ad.deinitialized).toBe(true);
    expect(ctx.content.calls).not.toContain('play');
    act(() => kepler.emitAppState('active'));
    await settle();
    expect(ctx.content.calls).toContain('play');
    expect(ctx.ads().playing).toBe(false);
  });

  it('releases ad players and content listeners on unmount', async () => {
    const ctx = setup();
    const ad = await ctx.prerollPlaying();
    act(() => {
      ctx.renderer.unmount();
    });
    mounted.splice(mounted.indexOf(ctx.renderer), 1);
    await settle();
    expect(ad.deinitialized).toBe(true);
    expect(ctx.content.listenerTypes()).toEqual([]);
    expect(back.listenerCount()).toBe(0);
    expect(kepler.appStateListenerCount()).toBe(0);
  });

  it('starts over when the source changes', async () => {
    const ctx = setup();
    const first = await ctx.prerollPlaying();
    ctx.http.on('https://ads.test/other.xml', { body: inline });
    ctx.rerender({ source: { breaks: [{ offset: 'start', vastUrl: 'https://ads.test/other.xml' }] } });
    await settle();
    expect(first.deinitialized).toBe(true);
    expect(ctx.http.requests).toContain('https://ads.test/other.xml');
  });

  it('does not start over when the caller passes an equal source object', async () => {
    const ctx = setup();
    await ctx.surfacesReady();
    ctx.rerender({ source: { breaks: [{ offset: 'start', vastUrl: PRE }] } });
    await settle();
    expect(ctx.http.requests.filter((url) => url === PRE)).toHaveLength(1);
  });

  it('gives the breaks for the timeline and the countdown before a mid-roll that is ready', async () => {
    const MID = 'https://ads.test/mid.xml';
    const ctx = setup({ source: { breaks: [{ offset: 30, vastUrl: MID }] } });
    ctx.http.on(MID, { body: inline });
    await ctx.surfacesReady();
    expect(ctx.ads().timeline).toEqual({ marks: [{ id: 'break-1', time: 30, done: false }], nextBreakIn: null });

    const at = async (time: number): Promise<void> => {
      act(() => {
        ctx.content.currentTime = time;
        ctx.content.emit('timeupdate');
      });
      await settle();
    };
    await at(15);
    act(() => ctx.lastAd().emit('canplay'));
    await settle();
    await at(26);
    expect(ctx.ads().timeline.nextBreakIn).toBe(4);
  });
});
