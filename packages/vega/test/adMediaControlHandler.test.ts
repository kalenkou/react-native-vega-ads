import { createAdMediaControlHandler } from '../src/adMediaControlHandler';

type Handler = Record<string, (...args: unknown[]) => Promise<void>> & { handled: string[] };

const make = (allowPause: boolean): Handler => createAdMediaControlHandler({ allowPause }) as unknown as Handler;

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
});
