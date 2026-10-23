import { createAdMediaControlHandler } from '../src/adMediaControlHandler';

type Handler = Record<string, (...args: unknown[]) => Promise<void>> & { handled: string[] };

const make = (allowPause: boolean): Handler => createAdMediaControlHandler({ allowPause }) as unknown as Handler;
const withSession = (paused: boolean, onPause = jest.fn()): Handler =>
  createAdMediaControlHandler({ allowPause: true, isPaused: () => paused, onPause }) as unknown as Handler;

describe('ad media controls handler (R21)', () => {
  it.each([
    'handleSeek',
    'handleFastForward',
    'handleRewind',
    'handleSkipForward',
    'handleSkipBackward',
    'handleStartOver',
    'handleNext',
    'handlePrevious',
    'handleSetPlaybackSpeed',
  ])('ignores %s: an ad cannot be moved through', async (method) => {
    const handler = make(true);
    await handler[method]?.();
    expect(handler.handled).toEqual([]);
  });

  it('lets play and pause through by default', async () => {
    const handler = make(true);
    await handler.handlePause?.();
    await handler.handleTogglePlayPause?.();
    await handler.handlePlay?.();
    expect(handler.handled).toEqual(['pause', 'toggle', 'play']);
  });

  it('ignores pause when the publisher does not allow pausing ads', async () => {
    const handler = make(false);
    await handler.handlePause?.();
    await handler.handlePlay?.();
    expect(handler.handled).toEqual(['play']);
  });

  it('ignores stop ("Alexa, stop") when the publisher does not allow pausing ads', async () => {
    const handler = make(false);
    await handler.handleStop?.();
    expect(handler.handled).toEqual([]);
  });

  it('play/pause key only plays when pausing is not allowed, so an ad the system paused can go on', async () => {
    const handler = make(false);
    await handler.handlePause?.({ id: 1 }, { source: 'SYSTEM_DISPLAY_OFF' });
    await handler.handleTogglePlayPause?.();
    expect(handler.handled).toEqual(['pause', 'play']);
  });

  it('pauses on display off even when the publisher does not allow pausing ads', async () => {
    const handler = make(false);
    await handler.handlePause?.({ id: 1 }, { source: 'SYSTEM_DISPLAY_OFF' });
    await handler.handlePause?.({ id: 1 }, { source: 'OTHER' });
    await handler.handlePause?.({ id: 1 }, { source: 'USER' });
    expect(handler.handled).toEqual(['pause', 'pause']);
  });

  it('stop ("Alexa, stop") pauses the ad instead of doing nothing', async () => {
    const handler = make(true);
    await handler.handleStop?.();
    expect(handler.handled).toEqual(['pause']);
  });

  // On Fire TV "Alexa, pause" finds the ad frozen: the player sends no pause event and the SDK
  // still counts it as playing, so its play/pause key would pause again and again.
  it('play/pause plays an ad the session holds paused, also when the SDK still counts it as playing', async () => {
    const paused = withSession(true);
    await paused.handleTogglePlayPause?.();
    expect(paused.handled).toEqual(['play']);
    const playing = withSession(false);
    await playing.handleTogglePlayPause?.();
    expect(playing.handled).toEqual(['pause']);
  });

  it('tells the session about each pause it lets through, so a frozen ad is not taken for a stuck one', async () => {
    const onPause = jest.fn();
    const handler = withSession(false, onPause);
    await handler.handlePause?.();
    await handler.handleStop?.();
    await handler.handleTogglePlayPause?.();
    expect(handler.handled).toEqual(['pause', 'pause', 'pause']);
    expect(onPause).toHaveBeenCalledTimes(3);
  });

  it('does not report a pause it ignores', async () => {
    const onPause = jest.fn();
    const handler = createAdMediaControlHandler({ allowPause: false, onPause }) as unknown as Handler;
    await handler.handlePause?.();
    await handler.handleStop?.();
    expect(onPause).not.toHaveBeenCalled();
  });
});
