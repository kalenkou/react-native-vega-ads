import {
  AdManager,
  adCountdownState,
  adPlan,
  adPlanLabel,
  adUiState,
  IDLE_SNAPSHOT,
  preloadAds,
  watchReport,
  watchReportLabel,
} from 'react-native-ads-core';
import type {
  AdSchedule,
  AdTimeline,
  ClockPort,
  HttpPort,
  PauseAdView,
  PreloadedAds,
  SessionSnapshot,
} from 'react-native-ads-core';
import { HtmlVideoPort, VideoElement } from './HtmlVideoPort';
import { mirrorHttp } from './mirrorHttp';

/** The demo CDN of the Fire TV build (tools/pixel-collector): the same movies, ads and ad tags. */
const CDN = 'https://d3f9mqgmbcpau1.cloudfront.net/';
const AD_SURFACE = 'ad-surface';
/** Seconds before a mid-roll that "Next break" jumps to: the ads load and "Ad in 5" shows. */
const BEFORE_BREAK = 12;

interface Movie {
  title: string;
  uri: string;
  poster: string;
  /** Seconds, for the timeline before the video knows its length. */
  duration: number;
  vmapUrl: string;
  /** Ads as usual, to compare with: a timer break, repeats, no loudness match. */
  classicVmapUrl?: string;
  /** Integrated loudness of the movie, LUFS. */
  loudness: number;
}

const MOVIES: Record<string, Movie> = {
  tears: {
    title: 'Tears of Steel',
    uri: `${CDN}tears_of_steel_720p.mp4`,
    poster: `${CDN}poster.jpg`,
    duration: 734.17,
    vmapUrl: `${CDN}vmap/movie.xml`,
    classicVmapUrl: `${CDN}vmap/classic.xml`,
    loudness: -23.7,
  },
  sintel: {
    title: 'Sintel',
    uri: `${CDN}sintel_720p.mp4`,
    poster: `${CDN}poster_sintel.jpg`,
    duration: 888.1,
    vmapUrl: `${CDN}vmap/sintel.xml`,
    loudness: -23.0,
  },
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const el = {
  content: $<HTMLVideoElement>('content'),
  adSurface: $('ad-surface'),
  adBar: $('ad-bar'),
  adLabel: $('ad-label'),
  adWhy: $('ad-why'),
  skip: $<HTMLButtonElement>('skip'),
  countdown: $('countdown'),
  caption: $('caption'),
  pauseAd: $('pause-ad'),
  pauseImage: $<HTMLImageElement>('pause-image'),
  pauseQr: $('pause-qr'),
  pauseQrImage: $<HTMLImageElement>('pause-qr-image'),
  start: $<HTMLButtonElement>('start'),
  play: $<HTMLButtonElement>('play'),
  back: $<HTMLButtonElement>('back'),
  next: $<HTMLButtonElement>('next'),
  bar: $('bar'),
  progress: $('progress'),
  marks: $('marks'),
  time: $('time'),
  movie: $<HTMLSelectElement>('movie'),
  mode: $<HTMLSelectElement>('mode'),
  plan: $('plan'),
  report: $('report'),
  sound: $('sound'),
  soundOn: $<HTMLButtonElement>('sound-on'),
  log: $<HTMLOListElement>('log'),
};

// ---- Log: ad events, ad requests and tracking pixels, as they happen.

const pageStart = performance.now();

function log(kind: 'event' | 'request' | 'pixel', text: string): void {
  const item = document.createElement('li');
  item.className = kind;
  const time = document.createElement('span');
  time.textContent = `${((performance.now() - pageStart) / 1000).toFixed(1)} s`;
  item.append(time, ` ${text}`);
  el.log.append(item);
  while (el.log.children.length > 400) {
    el.log.firstElementChild?.remove();
  }
  el.log.scrollTop = el.log.scrollHeight;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.includes('.lambda-url.') ? 'Lambda' : u.hostname;
    return `${host} ${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

// vast-client and vmap send pixels with `new Image().src = url` (as on the TV, through the
// polyfill there). This stand-in logs each one and still sends it with a real image.
const NativeImage = window.Image;
class LoggedPixel {
  private url = '';
  get src(): string {
    return this.url;
  }
  set src(url: string) {
    this.url = url;
    if (url) {
      log('pixel', shortUrl(url));
      new NativeImage().src = url;
    }
  }
}
(window as unknown as { Image: unknown }).Image = LoggedPixel;

const cdnHttp = mirrorHttp(CDN, 'cdn/');
const http: HttpPort = {
  get: (url, options) => {
    log('request', `GET ${url.startsWith(CDN) ? `CDN /${url.slice(CDN.length)}` : shortUrl(url)}`);
    return cdnHttp.get(url, options);
  },
};

const clock: ClockPort = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

// ---- Players.

const adVideos = new Set<HTMLVideoElement>();
const soundBlocked = (): void => {
  el.sound.hidden = false;
};
const content = new HtmlVideoPort(el.content, undefined, soundBlocked);
const findSurface = (id: string) => {
  const surface = document.getElementById(id);
  return surface && { appendChild: (video: VideoElement) => surface.appendChild(video as HTMLVideoElement) };
};

function newAdPlayer(): HtmlVideoPort {
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = el.content.muted;
  adVideos.add(video);
  video.addEventListener('emptied', () => {
    if (!video.isConnected) adVideos.delete(video);
  });
  return new HtmlVideoPort(video, findSurface, soundBlocked);
}

// ---- State of the page.

let manager: AdManager | null = null;
let snapshot: SessionSnapshot = IDLE_SNAPSHOT;
let timeline: AdTimeline = { marks: [], nextBreakIn: null };
let pauseAd: PauseAdView | null = null;
let events: string[] = [];
let preload: Promise<PreloadedAds> | null = null;

function movie(): Movie {
  return MOVIES[el.movie.value] ?? MOVIES.tears!;
}

function classic(): boolean {
  return el.mode.value === 'classic' && movie().classicVmapUrl !== undefined;
}

function schedule(): AdSchedule {
  const m = movie();
  return { vmapUrl: classic() ? m.classicVmapUrl! : m.vmapUrl };
}

function duration(): number {
  return content.getDuration() || movie().duration;
}

function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// ---- Drawing.

function render(): void {
  const ui = adUiState(snapshot);
  const adOn = snapshot.adSurface !== null;
  el.adSurface.hidden = !adOn;
  el.adBar.hidden = !ui.visible;
  el.adLabel.textContent = ui.label;
  el.adWhy.textContent = classic() ? '' : ui.why;
  el.adWhy.hidden = el.adWhy.textContent === '';
  el.skip.hidden = !ui.skip.visible;
  el.skip.disabled = !ui.skip.enabled;
  el.skip.textContent = ui.skip.label;
  el.caption.textContent = ui.caption;
  el.caption.hidden = ui.caption === '';

  const countdown = adCountdownState(classic() ? null : timeline.nextBreakIn);
  el.countdown.hidden = adOn || !countdown.visible;
  el.countdown.textContent = countdown.label;

  el.pauseAd.hidden = pauseAd === null;
  if (pauseAd) {
    el.pauseImage.src = pauseAd.imageUrl;
    el.pauseImage.width = pauseAd.width;
    el.pauseImage.height = pauseAd.height;
    el.pauseQr.hidden = !pauseAd.qr?.imageUrl;
    el.pauseQrImage.src = pauseAd.qr?.imageUrl ?? '';
  }

  const total = duration();
  el.progress.style.width = adOn ? '0' : `${(100 * content.getCurrentTime()) / total}%`;
  el.time.textContent = adOn ? ui.label : `${clockText(content.getCurrentTime())} / ${clockText(total)}`;
  const shown = adOn ? el.adSurface.querySelector('video') : el.content;
  el.play.textContent = shown?.paused === false ? 'Pause' : 'Play';
  el.next.disabled = adOn || nextBreak() === null;
}

function renderMarks(): void {
  el.marks.replaceChildren(
    ...timeline.marks.map((mark) => {
      const dot = document.createElement('span');
      const at = Number.isFinite(mark.time) ? Math.min(mark.time / duration(), 1) : 1;
      dot.style.left = `${100 * at}%`;
      dot.className = mark.done ? 'done' : '';
      dot.title = `Ad break at ${clockText(Math.min(mark.time, duration()))}`;
      return dot;
    }),
  );
}

/** The next mid-roll ahead of the content position, or null. */
function nextBreak(): number | null {
  const now = content.getCurrentTime();
  const ahead = timeline.marks
    .filter((mark) => !mark.done && mark.time > now + 1 && mark.time > 0 && mark.time < duration() - 1)
    .map((mark) => mark.time);
  return ahead.length > 0 ? Math.min(...ahead) : null;
}

// ---- One viewing.

async function stop(): Promise<void> {
  const old = manager;
  manager = null;
  snapshot = IDLE_SNAPSHOT;
  timeline = { marks: [], nextBreakIn: null };
  pauseAd = null;
  await old?.dispose();
}

async function load(): Promise<void> {
  await stop();
  const m = movie();
  el.mode.disabled = m.classicVmapUrl === undefined;
  if (el.mode.disabled) el.mode.value = 'vega-ads';
  el.content.pause();
  el.content.poster = m.poster;
  el.content.src = m.uri;
  el.content.preload = 'metadata';
  el.start.hidden = false;
  el.report.textContent = '';
  events = [];
  el.plan.textContent = 'Loading the ad plan…';
  log('event', `${m.title}, ${classic() ? 'ads as usual' : 'vega-ads'}`);
  // As on the title's page of the TV app: the VMAP and the pre-roll are asked for before Play.
  const ready = preloadAds(schedule(), { http, clock });
  preload = ready;
  const plan = adPlan(await ready);
  if (preload === ready) {
    el.plan.textContent = plan ? adPlanLabel(plan) : 'The ad plan could not be loaded';
  }
  renderMarks();
  render();
}

function start(): void {
  el.start.hidden = true;
  el.content.muted = false;
  const created = new AdManager({
    http,
    clock,
    content,
    createAdPlayer: newAdPlayer,
    adSurface: AD_SURFACE,
    contentLoudness: classic() ? undefined : movie().loudness,
    avoidRepeats: classic() ? false : undefined,
    captionLanguage: 'en',
    pauseAdUrl: classic() ? undefined : `${CDN}vast/pause.xml`,
    onChange: (next) => {
      snapshot = next;
      render();
    },
    onTimeline: (next) => {
      timeline = next;
      renderMarks();
      render();
    },
    onPauseAd: (view) => {
      pauseAd = view;
      render();
    },
    onEvent: (name, info) => {
      events.push(name);
      const ad = info.ad ? ` · ${info.ad.title ?? info.ad.id ?? 'ad'}` : '';
      const where = info.breakId && !name.startsWith('break:') ? ` · ${info.breakId}` : '';
      log('event', `${name}${ad}${where}`);
      if (name === 'content:ended') {
        el.report.textContent = watchReportLabel(watchReport(events));
      }
    },
  });
  manager = created;
  void created.start(schedule(), { preloaded: preload ?? undefined });
}

// ---- Controls.

function togglePlay(): void {
  if (!manager) {
    start();
    return;
  }
  if (snapshot.adSurface !== null) {
    manager.togglePause();
    render();
  } else if (el.content.paused) {
    void content.play().catch(() => undefined);
  } else {
    content.pause(); // the pause ad comes after 1.5 s
  }
}

function back(): void {
  if (!manager?.closePauseAd()) {
    void manager?.back();
  }
}

function seekBy(seconds: number): void {
  if (manager && snapshot.adSurface === null) {
    content.setCurrentTime(Math.max(0, Math.min(content.getCurrentTime() + seconds, duration() - 1)));
  }
}

el.start.addEventListener('click', start);
el.play.addEventListener('click', togglePlay);
el.back.addEventListener('click', back);
el.skip.addEventListener('click', () => manager?.skip());
el.next.addEventListener('click', () => {
  const at = nextBreak();
  if (at !== null) seekBy(at - BEFORE_BREAK - content.getCurrentTime());
});
el.bar.addEventListener('click', (event) => {
  const box = el.bar.getBoundingClientRect();
  seekBy(((event.clientX - box.left) / box.width) * duration() - content.getCurrentTime());
});
el.soundOn.addEventListener('click', () => {
  el.content.muted = false;
  adVideos.forEach((video) => (video.muted = false));
  el.sound.hidden = true;
});
el.movie.addEventListener('change', () => void load());
el.mode.addEventListener('change', () => void load());
el.content.addEventListener('timeupdate', render);
el.content.addEventListener('play', render);
el.content.addEventListener('pause', render);
el.content.addEventListener('loadedmetadata', () => {
  renderMarks();
  render();
});

document.addEventListener('keydown', (event) => {
  const onControl = event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement;
  if (event.key === ' ' && !onControl) {
    event.preventDefault();
    togglePlay();
  } else if (event.key === 'Escape' || event.key === 'Backspace') {
    back();
  } else if (event.key === 'ArrowRight' && !onControl) {
    seekBy(10);
  } else if (event.key === 'ArrowLeft' && !onControl) {
    seekBy(-10);
  }
});

void load();
