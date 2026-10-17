import { HeadlessPlayerService, HeadlessServicePlayer, HeadlessPlayerServer } from '../src/HeadlessPlayerService';

/** A w3cmedia headless VideoPlayer that records calls; initialize() waits until finishInit(). */
class FakePlayer implements HeadlessServicePlayer {
  calls: string[] = [];
  autoplay = true;
  muted = false;
  volume = 1;
  playbackRate = 1;
  currentTime = 0;
  duration = NaN;
  error: { code: number; message?: string } | null = null;
  listeners = new Map<string, Set<() => void>>();
  private release!: () => void;
  private readonly started = new Promise<void>((resolve) => (this.release = resolve));

  set src(url: string) {
    this.calls.push(`src=${url}`);
  }
  get src(): string {
    return '';
  }
  initialize(): Promise<void> {
    this.calls.push('initialize');
    return this.started;
  }
  async finishInit(): Promise<void> {
    this.release();
    await flush();
  }
  setSurfaceHandle(handle: string): void {
    this.calls.push(`setSurface:${handle}`);
  }
  clearSurfaceHandle(handle: string): void {
    this.calls.push(`clearSurface:${handle}`);
  }
  async play(): Promise<void> {
    this.calls.push('play');
  }
  pause(): void {
    this.calls.push('pause');
  }
  async setMediaControlFocus(): Promise<void> {}
  addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  async deinitialize(): Promise<void> {
    this.calls.push('deinitialize');
  }
  emit(type: string): void {
    [...(this.listeners.get(type) ?? [])].forEach((l) => l());
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((n, s) => n + s.size, 0);
  }
}

class FakeServer implements HeadlessPlayerServer {
  statuses: Array<{ id?: number; state: string; duration?: number }> = [];
  errors: Array<{ id?: number; code: number; message: string }> = [];
  async updateStatus(status: Array<{ sessionId?: { id: number }; playbackState: string; duration?: number }>) {
    status.forEach((s) => this.statuses.push({ id: s.sessionId?.id, state: s.playbackState, duration: s.duration }));
  }
  async sendError(error: { code: number; message: string }, sessionId?: { id: number }) {
    this.errors.push({ id: sessionId?.id, ...error });
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const A = { id: 1 };
const B = { id: 2 };
const media = (url: string) => ({ mediaUrl: { url } });

function setup() {
  const server = new FakeServer();
  const players: FakePlayer[] = [];
  const service = new HeadlessPlayerService(server, () => {
    const player = new FakePlayer();
    players.push(player);
    return player;
  });
  return { server, players, service };
}

test('a load creates and initializes a player for the session, then sets autoplay, source and start', async () => {
  const { players, service } = setup();
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 5, autoPlay: false }, A);
  const [player] = players;
  expect(player!.calls).toEqual(['initialize']);
  await player!.finishInit();
  expect(player!.autoplay).toBe(false);
  expect(player!.calls).toEqual(['initialize', 'src=https://ads.test/a.mp4']);
  expect(player!.currentTime).toBe(5);
});

test('commands given before the player is initialized wait and run in order', async () => {
  const { players, service } = setup();
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  service.handleSetVideoView({ handle: 's1' }, A);
  service.handleSetMute(true, A);
  service.handlePlay(A);
  await players[0]!.finishInit();
  expect(players[0]!.calls).toEqual(['initialize', 'src=https://ads.test/a.mp4', 'setSurface:s1', 'play']);
  expect(players[0]!.muted).toBe(true);
});

test('each session has its own player; commands go to the right one', async () => {
  const { players, service } = setup();
  service.handleLoad(media('https://cdn.test/movie.mp4'), { startPosition: 0, autoPlay: true }, A);
  service.handleLoad(media('https://ads.test/ad.mp4'), { startPosition: 0, autoPlay: false }, B);
  await players[0]!.finishInit();
  await players[1]!.finishInit();
  service.handlePause(A);
  service.handlePlay(B);
  service.handleSeek(10, false, A);
  service.handleSeek(3, true, A);
  service.handleSetVolume(0.4, B);
  service.handleSetPlaybackRate(2, A);
  await flush();
  expect(players).toHaveLength(2);
  expect(players[0]!.calls.slice(2)).toEqual(['pause']);
  expect(players[0]!.currentTime).toBe(13);
  expect(players[0]!.playbackRate).toBe(2);
  expect(players[1]!.calls.slice(2)).toEqual(['play']);
  expect(players[1]!.volume).toBe(0.4);
});

test('player events become status updates of the session once status updates are asked for', async () => {
  const { server, players, service } = setup();
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  await players[0]!.finishInit();
  players[0]!.emit('canplay');
  service.handleStartStatusUpdates(A);
  players[0]!.duration = 30;
  for (const event of ['canplay', 'playing', 'waiting', 'seeking', 'pause', 'ended']) players[0]!.emit(event);
  service.handleStopStatusUpdates(A);
  players[0]!.emit('playing');
  expect(server.statuses).toEqual([
    { id: 1, state: 'READY', duration: 30 },
    { id: 1, state: 'PLAYING', duration: 30 },
    { id: 1, state: 'BUFFERING', duration: 30 },
    { id: 1, state: 'SEEKING', duration: 30 },
    { id: 1, state: 'PAUSED', duration: 30 },
    { id: 1, state: 'ENDED', duration: 30 },
  ]);
});

test('status updates asked for before the load still arrive', async () => {
  const { server, players, service } = setup();
  service.handleStartStatusUpdates(A);
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  await players[0]!.finishInit();
  players[0]!.emit('canplay');
  expect(server.statuses.map((s) => s.state)).toEqual(['READY']);
});

test('a player error is an ERROR status and, when asked for, a session error with the MediaError code', async () => {
  const { server, players, service } = setup();
  service.handleStartStatusUpdates(A);
  service.handleStartErrorUpdates(A);
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  await players[0]!.finishInit();
  players[0]!.error = { code: 4, message: 'not supported' };
  players[0]!.emit('error');
  service.handleStopErrorUpdates(A);
  players[0]!.emit('error');
  expect(server.statuses.map((s) => s.state)).toEqual(['ERROR', 'ERROR']);
  expect(server.errors).toEqual([{ id: 1, code: 4, message: 'not supported' }]);
});

test('the position is the player time; an unknown session is at 0', async () => {
  const { players, service } = setup();
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  expect(service.handleGetCurrentPosition(A)).toBe(0);
  await players[0]!.finishInit();
  players[0]!.currentTime = 7.5;
  expect(service.handleGetCurrentPosition(A)).toBe(7.5);
  expect(service.handleGetCurrentPosition(B)).toBe(0);
});

test('a second load on the same session reuses its player', async () => {
  const { players, service } = setup();
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  await players[0]!.finishInit();
  service.handleLoad(media('https://ads.test/b.mp4'), { startPosition: 0, autoPlay: true }, A);
  await flush();
  expect(players).toHaveLength(1);
  expect(players[0]!.calls).toEqual(['initialize', 'src=https://ads.test/a.mp4', 'src=https://ads.test/b.mp4']);
  expect(players[0]!.autoplay).toBe(true);
});

test('clearing the view clears the surface the session had', async () => {
  const { players, service } = setup();
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  await players[0]!.finishInit();
  service.handleSetVideoView({ handle: 's1' }, A);
  service.handleClearVideoView(A);
  service.handleClearVideoView(A);
  await flush();
  expect(players[0]!.calls.slice(2)).toEqual(['setSurface:s1', 'clearSurface:s1']);
});

test('unload releases the player in Amazon order and forgets the session', async () => {
  const { server, players, service } = setup();
  service.handleStartStatusUpdates(A);
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  await players[0]!.finishInit();
  service.handleSetVideoView({ handle: 's1' }, A);
  service.handleUnload(A);
  await flush();
  expect(players[0]!.calls.slice(3)).toEqual(['clearSurface:s1', 'pause', 'deinitialize']);
  expect(players[0]!.listenerCount()).toBe(0);
  service.handlePlay(A);
  players[0]!.emit('playing');
  expect(players[0]!.calls[players[0]!.calls.length - 1]).toBe('deinitialize');
  expect(server.statuses).toEqual([]);
});

test('an unload before the player is initialized still releases it', async () => {
  const { players, service } = setup();
  service.handleLoad(media('https://ads.test/a.mp4'), { startPosition: 0, autoPlay: false }, A);
  service.handleSetVideoView({ handle: 's1' }, A);
  service.handleUnload(A);
  await players[0]!.finishInit();
  expect(players[0]!.calls).toEqual(['initialize', 'pause', 'deinitialize']);
});

test('view, volume and mute sent before the load (the core does that) still reach the player', async () => {
  const { players, service } = setup();
  service.handleSetVideoView({ handle: 'a1' }, B);
  service.handleSetVolume(0.3, B);
  service.handleSetMute(true, B);
  service.handlePause(A);
  service.handleClearVideoView(A);
  service.handleLoad(media('https://ads.test/ad.mp4'), { startPosition: 0, autoPlay: false }, B);
  await players[0]!.finishInit();
  expect(players).toHaveLength(1);
  expect(players[0]!.calls).toEqual(['initialize', 'setSurface:a1', 'src=https://ads.test/ad.mp4']);
  expect(players[0]!.volume).toBe(0.3);
  expect(players[0]!.muted).toBe(true);
});
