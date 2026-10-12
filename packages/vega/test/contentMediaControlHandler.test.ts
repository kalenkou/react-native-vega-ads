import { KeplerMediaControlHandler } from '@amazon-devices/react-native-w3cmedia';
import { contentMediaControlHandler } from '../src/contentMediaControlHandler';

type Handler = { handlePause(sessionId?: unknown, context?: { source?: string }): Promise<void>; handled: string[] };

describe('contentMediaControlHandler', () => {
  it('pauses as the SDK does and reports a viewer pause, but not a system one (display off)', async () => {
    const paused = jest.fn();
    const handler = contentMediaControlHandler(undefined, paused) as Handler;
    expect(handler).toBeInstanceOf(KeplerMediaControlHandler);
    await handler.handlePause();
    await handler.handlePause({ id: 1 }, { source: 'USER' });
    await handler.handlePause({ id: 1 }, { source: 'SYSTEM_DISPLAY_OFF' });
    expect(handler.handled).toEqual(['pause', 'pause', 'pause']);
    expect(paused).toHaveBeenCalledTimes(2);
  });

  it("keeps the app's own handler and wraps it only once", async () => {
    const paused = jest.fn();
    const app = new KeplerMediaControlHandler() as unknown as Handler;
    const first = contentMediaControlHandler(app, paused);
    const second = contentMediaControlHandler(app, paused);
    expect(first).toBe(app);
    expect(second).toBe(app);
    await app.handlePause();
    expect(app.handled).toEqual(['pause']);
    expect(paused).toHaveBeenCalledTimes(1);
  });
});
