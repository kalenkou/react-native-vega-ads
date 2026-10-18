import { HeadlessPlayerAdapter, HeadlessPlayerClient, HeadlessSessionStatus } from '../src/HeadlessPlayerAdapter';

type Listener = { [name: string]: (...args: never[]) => void };

/** Records how the adapter drives an IPlayerClient from @amazon-devices/kepler-player-client. */
class RecordingClient implements HeadlessPlayerClient {
  calls: string[] = [];
  status: Listener[] = [];
  position: Listener[] = [];
  error: Listener[] = [];
  unsubscribed = 0;

  private subscribe(list: Listener[], listener: Listener, label: string, session?: { id: number }) {
    this.calls.push(`${label}:${session?.id}`);
    list.push(listener);
    return Promise.resolve({
      unsubscribe: () => {
        this.unsubscribed++;
        list.splice(list.indexOf(listener), 1);
      },
    });
  }
  registerStatusListener(listener: never, session?: { id: number }) {
    return this.subscribe(this.status, listener, 'status', session);
  }
  registerPositionListener(listener: never, interval: number, session?: { id: number }) {
    return this.subscribe(this.position, listener, `position@${interval}`, session);
  }
  registerErrorListener(listener: never, session?: { id: number }) {
    return this.subscribe(this.error, listener, 'error', session);
  }
  async load(
    media: { mediaUrl: { url: string } },
    params?: { startPosition: number; autoPlay: boolean },
    session?: { id: number },
  ) {
    this.calls.push(`load:${media.mediaUrl.url}:${params?.startPosition}:${String(params?.autoPlay)}:${session?.id}`);
  }
  async unload(session?: { id: number }) {
    this.calls.push(`unload:${session?.id}`);
  }
  async setVideoView(view: { handle: string }, session?: { id: number }) {
    this.calls.push(`setVideoView:${view.handle}:${session?.id}`);
  }
  async clearVideoView(session?: { id: number }) {
    this.calls.push(`clearVideoView:${session?.id}`);
  }
  async play(session?: { id: number }) {
    this.calls.push(`play:${session?.id}`);
  }
  async pause(session?: { id: number }) {
    this.calls.push(`pause:${session?.id}`);
  }
  async seek(position: number, isRelative?: boolean, session?: { id: number }) {
    this.calls.push(`seek:${position}:${String(isRelative)}:${session?.id}`);
  }
  async setMute(muted: boolean, session?: { id: number }) {
    this.calls.push(`mute:${String(muted)}:${session?.id}`);
  }
  async setVolume(volume: number, session?: { id: number }) {
    this.calls.push(`volume:${volume}:${session?.id}`);
  }
  async setMediaControlFocus(instance: unknown) {
    this.calls.push(`focus:${String((instance as { name: string }).name)}`);
  }

  sendStatus(...statuses: Array<Partial<HeadlessSessionStatus> & { id?: number }>) {
    const update = statuses.map(({ id, ...s }) => ({ sessionId: id === undefined ? undefined : { id }, ...s }));
    this.status.forEach((l) => (l.onSessionStatusChanged as (u: unknown) => void)(update));
  }
  sendPosition(position: number, id = 7) {
    this.position.forEach((l) => (l.onPositionUpdated as (u: unknown) => void)([{ sessionId: { id }, position }]));
  }
  sendError(id = 7) {
    // IPlayerSessionErrorListener.onError(error, sessionId): one error at a time.
    this.error.forEach((l) => (l.onError as (e: unknown, s: unknown) => void)({ code: 3, message: 'decode' }, { id }));
  }
}

async function setup(options: { mediaControls?: boolean } = {}) {
  const client = new RecordingClient();
  const adapter = new HeadlessPlayerAdapter(client, { id: 7 }, () => ({ name: 'app' }), options);
  await adapter.initialize();
  const events: string[] = [];
  for (const name of ['canplay', 'playing', 'pause', 'waiting', 'timeupdate', 'ended', 'error'] as const) {
    adapter.on(name, () => events.push(name));
  }
  return { client, adapter, events };
}

test('initialize listens to status, position and errors of its own session', async () => {
  const { client } = await setup();
  expect(client.calls).toEqual(['status:7', 'position@0.25:7', 'error:7']);
});

test('setSrc loads the media with the autoplay set before it, from the start', async () => {
  const { client, adapter } = await setup();
  adapter.setAutoplay(true);
  adapter.setSrc('https://ads.test/a.mp4');
  expect(client.calls.slice(-1)[0]).toBe('load:https://ads.test/a.mp4:0:true:7');
});

test('without setAutoplay the media does not start by itself: the core starts the content after a pre-roll', async () => {
  const { client, adapter } = await setup();
  adapter.setSrc('https://ads.test/a.mp4');
  expect(client.calls.slice(-1)[0]).toBe('load:https://ads.test/a.mp4:0:false:7');
});

test('if one listener cannot be registered, deinitialize still removes the others', async () => {
  const client = new RecordingClient();
  client.registerErrorListener = () => Promise.reject(new Error('service gone'));
  const adapter = new HeadlessPlayerAdapter(client, { id: 7 }, () => ({ name: 'app' }));
  await expect(adapter.initialize()).rejects.toThrow('service gone');
  await adapter.deinitialize();
  expect(client.unsubscribed).toBe(2);
});

test('session states become the player events the core waits for, once per change', async () => {
  const { client, events } = await setup();
  client.sendStatus({ id: 7, playbackState: 'READY' as never });
  client.sendStatus({ id: 7, playbackState: 'READY' as never });
  client.sendStatus({ id: 7, playbackState: 'PLAYING' as never });
  client.sendStatus({ id: 7, playbackState: 'BUFFERING' as never });
  client.sendStatus({ id: 7, playbackState: 'PLAYING' as never });
  client.sendStatus({ id: 7, playbackState: 'SEEKING' as never });
  client.sendStatus({ id: 7, playbackState: 'PAUSED' as never });
  client.sendStatus({ id: 7, playbackState: 'ENDED' as never });
  client.sendStatus({ id: 7, playbackState: 'ERROR' as never });
  expect(events).toEqual(['canplay', 'playing', 'waiting', 'playing', 'pause', 'ended', 'error']);
});

test("another session's status is ignored", async () => {
  const { client, events } = await setup();
  client.sendStatus({ id: 8, playbackState: 'PLAYING' as never });
  expect(events).toEqual([]);
});

test('position updates give the current time and timeupdate; duration comes from the status', async () => {
  const { client, adapter, events } = await setup();
  expect(adapter.getDuration()).toBe(0);
  client.sendStatus({ id: 7, playbackState: 'PLAYING' as never, duration: 30 });
  client.sendPosition(12.5);
  client.sendPosition(99, 8);
  expect(adapter.getCurrentTime()).toBe(12.5);
  expect(adapter.getDuration()).toBe(30);
  expect(events).toEqual(['playing', 'timeupdate']);
});

test('a seek goes to the absolute position, and the time reads the target at once', async () => {
  const { client, adapter } = await setup();
  adapter.setCurrentTime(40);
  expect(client.calls.slice(-1)[0]).toBe('seek:40:false:7');
  expect(adapter.getCurrentTime()).toBe(40);
});

test('commands carry the session', async () => {
  const { client, adapter } = await setup();
  adapter.attachSurface('s1');
  adapter.detachSurface('other');
  adapter.detachSurface('s1');
  adapter.setMuted(true);
  adapter.setVolume(0.5);
  await adapter.play();
  adapter.pause();
  expect(client.calls.slice(3)).toEqual([
    'setVideoView:s1:7',
    'clearVideoView:7',
    'mute:true:7',
    'volume:0.5:7',
    'play:7',
    'pause:7',
  ]);
});

test('media controls go to the app component, unless the app handles the keys', async () => {
  const one = await setup();
  await one.adapter.takeMediaControlFocus();
  expect(one.client.calls.slice(-1)[0]).toBe('focus:app');
  const two = await setup({ mediaControls: false });
  await two.adapter.takeMediaControlFocus();
  expect(two.client.calls.some((c) => c.startsWith('focus'))).toBe(false);
});

test('a session error and a failed load arrive as error', async () => {
  const { client, adapter, events } = await setup();
  client.sendError(8);
  client.sendError();
  client.load = () => Promise.reject(new Error('no network'));
  adapter.setSrc('https://ads.test/a.mp4');
  await Promise.resolve();
  await Promise.resolve();
  expect(events).toEqual(['error', 'error']);
});

test('deinitialize stops all listeners and unloads the session', async () => {
  const { client, adapter, events } = await setup();
  await adapter.deinitialize();
  expect(client.unsubscribed).toBe(3);
  expect(client.calls.slice(-1)[0]).toBe('unload:7');
  client.sendStatus({ id: 7, playbackState: 'PLAYING' as never });
  expect(events).toEqual([]);
});

test('a status without duration keeps the known duration', async () => {
  const { client, adapter } = await setup();
  client.sendStatus({ id: 7, playbackState: 'READY' as never, duration: 30 });
  client.sendStatus({ id: 7, playbackState: 'PLAYING' as never });
  expect(adapter.getDuration()).toBe(30);
});

test('a new source on the same player starts again: READY is canplay again, time from 0', async () => {
  const { client, adapter, events } = await setup();
  adapter.setSrc('https://ads.test/a.mp4');
  client.sendStatus({ id: 7, playbackState: 'READY' as never });
  client.sendPosition(4);
  adapter.setSrc('https://ads.test/b.mp4');
  expect(adapter.getCurrentTime()).toBe(0);
  client.sendStatus({ id: 7, playbackState: 'READY' as never });
  expect(events).toEqual(['canplay', 'timeupdate', 'canplay']);
});

test('no events reach the core after deinitialize, even if the service sends one late', async () => {
  const { client, adapter, events } = await setup();
  const late = client.status[0]!;
  await adapter.deinitialize();
  (late.onSessionStatusChanged as (u: unknown) => void)([{ sessionId: { id: 7 }, playbackState: 'PLAYING' }]);
  expect(events).toEqual([]);
});
