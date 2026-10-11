import {VideoPlayer} from '@amazon-devices/react-native-w3cmedia';
import {
  AdBreakSession,
  adUiState,
  BreakScheduler,
  Decision,
  requestVmap,
  ScheduledBreak,
  SessionSnapshot,
} from '@vega-ads/core';
import {W3cPlayerAdapter, W3cVideoPlayer} from '@vega-ads/vega';
import {clock, http, VMAP_OPTIMIZED_POD_TAG} from './ads';
import {log} from './log';

export interface SessionRunDeps {
  content: VideoPlayer;
  adSurface: string;
  standbySurface?: string;
  componentInstance: () => unknown;
  /** The ad surface to show on top, or null to show content. */
  onAdSurface: (surface: string | null) => void;
}

/**
 * Device check of the whole core: VMAP → BreakScheduler → AdBreakSession
 * on two w3cmedia players through W3cPlayerAdapter.
 */
export async function runVmapSession(deps: SessionRunDeps): Promise<void> {
  const content = new W3cPlayerAdapter(
    deps.content as unknown as W3cVideoPlayer,
    deps.componentInstance,
  );
  const vmap = await requestVmap(`${VMAP_OPTIMIZED_POD_TAG}${Date.now()}`, {
    http,
    clock,
  });
  if (vmap.status !== 'ok') {
    log(`session: vmap ${JSON.stringify(vmap)}`);
    await content.play();
    return;
  }
  const breaks = new Map<string, ScheduledBreak>(
    vmap.breaks.map((b) => [b.id, b]),
  );
  const scheduler = new BreakScheduler(vmap.breaks);
  const sessions = new Map<string, AdBreakSession>();
  const loads = new Map<string, Promise<'ready' | 'empty'>>();
  let active: AdBreakSession | null = null;
  let lastKey = '';
  let durationKnown = false;

  const onChange = (snapshot: SessionSnapshot): void => {
    deps.onAdSurface(snapshot.state === 'playing' ? snapshot.adSurface : null);
    const key = `${snapshot.state}:${snapshot.position}:${snapshot.adSurface}`;
    if (key === lastKey) {
      return;
    }
    lastKey = key;
    const ui = adUiState(snapshot);
    const skip = ui.skip.visible ? ` [${ui.skip.label}]` : '';
    const where =
      snapshot.adSurface === deps.standbySurface
        ? ' @B'
        : snapshot.adSurface
        ? ' @A'
        : '';
    log(
      `session: ${snapshot.state} ${ui.visible ? ui.label : ''}${skip}${where}`,
    );
  };

  const prefetch = (id: string): void => {
    const adBreak = breaks.get(id);
    if (!adBreak || sessions.has(id)) {
      return;
    }
    const session = new AdBreakSession({
      http,
      clock,
      content,
      adSurface: deps.adSurface,
      standbySurface: deps.standbySurface,
      createAdPlayer: () =>
        new W3cPlayerAdapter(
          new VideoPlayer() as unknown as W3cVideoPlayer,
          deps.componentInstance,
        ),
      onChange,
      onEvent: (name) => log(`session event: ${name}`),
    });
    sessions.set(id, session);
    const started = Date.now();
    const loading = session.load(adBreak.sources.map((s) => s.source));
    loads.set(id, loading);
    void loading.then((result) =>
      log(`session: ${id} ${result} in ${Date.now() - started} ms`),
    );
  };

  const start = async (id: string): Promise<void> => {
    const session = sessions.get(id);
    const loading = loads.get(id);
    if (!session || !loading) {
      return;
    }
    if ((await loading) !== 'ready') {
      if (content.getCurrentTime() === 0) {
        await content.play();
      }
      return;
    }
    active = session;
    const switchAt = Date.now();
    await session.start();
    log(`session: ${id} started, switch ${Date.now() - switchAt} ms`);
  };

  const apply = (decisions: Decision[]): void => {
    for (const decision of decisions) {
      if (decision.type === 'prefetch') {
        prefetch(decision.breakId);
      } else {
        void start(decision.breakId);
      }
    }
  };

  content.on('timeupdate', () => {
    if (active && active.state !== 'finished') {
      return;
    }
    if (!durationKnown && content.getDuration() > 0) {
      durationKnown = true;
      scheduler.setDuration(content.getDuration());
    }
    apply(scheduler.onTime(content.getCurrentTime()));
  });
  content.on('ended', () => apply(scheduler.onEnded()));

  log(`session: ${vmap.breaks.length} breaks, begin`);
  const first = scheduler.begin();
  if (first.length === 0) {
    await content.play();
  }
  apply(first);
}
