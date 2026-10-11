import { createAdMediaControlHandler } from '../src/adMediaControlHandler';

type Handler = Record<string, () => Promise<void>> & { handled: string[] };

const make = (allowPause: boolean): Handler => createAdMediaControlHandler({ allowPause }) as unknown as Handler;

describe('ad media controls handler (R21)', () => {
  it.each(['handleSeek', 'handleFastForward', 'handleRewind', 'handleSkipForward', 'handleSkipBackward', 'handleStartOver', 'handleNext', 'handlePrevious', 'handleSetPlaybackSpeed', 'handleStop'])(
    'ignores %s: an ad cannot be moved through',
    async (method) => {
      const handler = make(true);
      await handler[method]?.();
      expect(handler.handled).toEqual([]);
    },
  );

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
    await handler.handleTogglePlayPause?.();
    await handler.handlePlay?.();
    expect(handler.handled).toEqual(['play']);
  });
});
