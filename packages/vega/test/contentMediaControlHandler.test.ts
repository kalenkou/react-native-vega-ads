import { KeplerMediaControlHandler } from '@amazon-devices/react-native-w3cmedia';
import { contentMediaControlHandler } from '../src/contentMediaControlHandler';

type Handler = {
  handlePause(sessionId?: unknown, context?: { source?: string }): Promise<void>;
  handleTogglePlayPause(sessionId?: unknown): Promise<void>;
  handled: string[];
};

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

  it('tells the player screen that uses the handler now, not the first one (one handler for the app)', async () => {
    const firstScreen = jest.fn();
    const secondScreen = jest.fn();
    const app = new KeplerMediaControlHandler() as unknown as Handler;
    contentMediaControlHandler(app, firstScreen);
    contentMediaControlHandler(app, secondScreen);
    await app.handlePause();
    expect(firstScreen).not.toHaveBeenCalled();
    expect(secondScreen).toHaveBeenCalledTimes(1);
  });

  // After "Alexa, pause" the frozen player sends no pause event: the SDK still counts it as
  // playing, and its play/pause key would pause again (and show the pause ad again).
  it('play/pause decides by the paused state it is given, not by the SDK', async () => {
    const paused = jest.fn();
    let isPaused = true;
    const handler = contentMediaControlHandler(undefined, paused, () => isPaused) as Handler;
    await handler.handleTogglePlayPause();
    expect(handler.handled).toEqual(['play']);
    expect(paused).not.toHaveBeenCalled();
    isPaused = false;
    await handler.handleTogglePlayPause();
    expect(handler.handled).toEqual(['play', 'pause']);
    expect(paused).toHaveBeenCalledTimes(1);
  });

  it('play/pause is left to the handler when no paused state is given', async () => {
    const handler = contentMediaControlHandler(undefined, jest.fn()) as Handler;
    await handler.handleTogglePlayPause();
    expect(handler.handled).toEqual(['toggle']);
  });

  it('a reused handler asks the player screen that uses it now', async () => {
    const app = new KeplerMediaControlHandler() as unknown as Handler;
    contentMediaControlHandler(app, jest.fn(), () => false);
    contentMediaControlHandler(app, jest.fn(), () => true);
    await app.handleTogglePlayPause();
    expect(app.handled).toEqual(['play']);
  });
});
