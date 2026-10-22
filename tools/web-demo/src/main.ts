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
  AdPlanMark,
  AdSchedule,
  AdTimeline,
  ClockPort,
  HttpPort,
  PauseAdView,
  PreloadedAds,
  SessionSnapshot,
} from 'react-native-ads-core';
import { AdTag, isHttpUrl, SAMPLE_TAGS, scheduleFor, tagFromQuery, tagProblem, tagQuery } from './adTag';
import { AdAnnouncer, keyAction, KeyTarget, playAction } from './controls';
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
  classicOption: $<HTMLOptionElement>('classic-option'),
  tagBox: $('tag-box'),
  tagKind: $<HTMLSelectElement>('tag-kind'),
  tagUrl: $<HTMLInputElement>('tag-url'),
  tagLoad: $<HTMLButtonElement>('tag-load'),
  plan: $('plan'),
  breaks: $('breaks'),
  announce: $('announce'),
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
  // Ad server URLs can be very long: the line shows the start, the tooltip all of it.
  item.append(time, ` ${text.length > 140 ? `${text.slice(0, 139)}…` : text}`);
  item.title = text;
  // Follows new lines only while the viewer is at the end: an older line being read stays put.
  const atEnd = el.log.scrollHeight - el.log.scrollTop - el.log.clientHeight < 24;
  el.log.append(item);
  while (el.log.children.length > 400) {
    el.log.firstElementChild?.remove();
  }
  if (atEnd) el.log.scrollTop = el.log.scrollHeight;
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
  // The next break's ad may already wait in the same surface: only the ad that plays is shown.
  video.addEventListener('play', () => adVideos.forEach((other) => other.classList.toggle('shown', other === video)));
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
/** The breaks of the VMAP before Play, as on the title's page of the TV app. */
let planMarks: AdPlanMark[] = [];
/** The viewer's tag the ad plan was loaded for; the field may hold newer text. */
let loadedTag: AdTag | null = null;
/** The movie has played in this viewing: before that the pre-roll is still loading. */
let contentBegun = false;
/** Counts load() calls, so an older one does not start a viewing after a newer one. */
let loads = 0;
const announcer = new AdAnnouncer();
/** The movie and its post-roll are over: Play starts a new viewing. */
let ended = false;
let countdownShown = false;

function movie(): Movie {
  return MOVIES[el.movie.value] ?? MOVIES.tears!;
}

function classic(): boolean {
  return el.mode.value === 'classic' && movie().classicVmapUrl !== undefined;
}

/** The viewer's own VAST or VMAP tag instead of the demo's. */
function tagMode(): boolean {
  return el.mode.value === 'tag';
}

function currentTag(): AdTag | null {
  const url = el.tagUrl.value.trim();
  return isHttpUrl(url) ? { kind: el.tagKind.value === 'vast' ? 'vast' : 'vmap', url } : null;
}

function schedule(): AdSchedule {
  const m = movie();
  if (tagMode() && loadedTag) {
    return scheduleFor(loadedTag);
  }
  return { vmapUrl: classic() ? m.classicVmapUrl! : m.vmapUrl };
}

function duration(): number {
  return content.getDuration() || movie().duration;
}

function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function planTime(mark: AdPlanMark): number {
  switch (mark.at.kind) {
    case 'start':
      return 0;
    case 'end':
      return duration();
    case 'percent':
      return (mark.at.percent / 100) * duration();
    default:
      return mark.at.seconds;
  }
}

function planLabel(mark: AdPlanMark): string {
  const at = mark.at.kind === 'start' ? 'pre-roll' : mark.at.kind === 'end' ? 'post-roll' : clockText(planTime(mark));
  return mark.sceneSignals.length > 0 ? `${at} after: ${mark.sceneSignals.join(', ')}` : at;
}

/** Says a line to a screen reader, as VoiceView does on the TV. */
function announce(text: string): void {
  if (text !== '') {
    el.announce.textContent = text;
  }
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
  announce(announcer.next(ui) ?? '');

  const countdown = adCountdownState(classic() ? null : timeline.nextBreakIn);
  el.countdown.hidden = adOn || !countdown.visible;
  el.countdown.textContent = countdown.label;
  if (!el.countdown.hidden && !countdownShown) announce(countdown.announcement);
  countdownShown = !el.countdown.hidden;

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
  const shown = adOn
    ? (el.adSurface.querySelector<HTMLVideoElement>('video.shown') ?? el.adSurface.querySelector('video'))
    : el.content;
  el.play.textContent = shown?.paused === false ? 'Pause' : 'Play';
  el.next.disabled = adOn || nextBreak() === null;
}

function renderMarks(): void {
  const marks =
    timeline.marks.length > 0
      ? timeline.marks.map((mark) => ({ time: mark.time, done: mark.done, title: clockText(mark.time) }))
      : planMarks.map((mark) => ({ time: planTime(mark), done: false, title: planLabel(mark) }));
  el.marks.replaceChildren(
    ...marks.map((mark) => {
      const dot = document.createElement('span');
      const at = Number.isFinite(mark.time) ? Math.min(mark.time / duration(), 1) : 1;
      dot.style.left = `${100 * at}%`;
      dot.className = mark.done ? 'done' : '';
      dot.title = `Ad break: ${mark.title}`;
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
  contentBegun = false;
  await old?.dispose();
}

/** Shows the movie page: the poster, Play and the ad plan. Resolves with its number (see `loads`). */
async function load(): Promise<number> {
  loads += 1;
  const id = loads;
  await stop();
  const m = movie();
  el.classicOption.disabled = m.classicVmapUrl === undefined;
  if (el.mode.value === 'classic' && el.classicOption.disabled) el.mode.value = 'vega-ads';
  el.tagBox.hidden = !tagMode();
  if (tagMode() && el.tagUrl.value.trim() === '') {
    el.tagKind.value = SAMPLE_TAGS.googleVmap.kind;
    el.tagUrl.value = SAMPLE_TAGS.googleVmap.url;
  }
  const problem = tagMode() ? tagProblem(el.tagUrl.value.trim(), location.protocol) : null;
  loadedTag = tagMode() && !problem ? currentTag() : null;
  const tag = loadedTag;
  history.replaceState(null, '', tag ? tagQuery(tag) : location.pathname);
  el.content.pause();
  el.content.poster = m.poster;
  el.content.src = m.uri;
  el.content.preload = 'metadata';
  el.start.hidden = false;
  el.report.textContent = '';
  ended = false;
  events = [];
  el.plan.textContent = 'Loading the ad plan…';
  el.breaks.textContent = '';
  planMarks = [];
  if (problem) {
    preload = null;
    el.plan.textContent = problem;
    renderMarks();
    render();
    return id;
  }
  log('event', `${m.title}, ${tag ? `your ${tag.kind.toUpperCase()} tag` : classic() ? 'ads as usual' : 'vega-ads'}`);
  // As on the title's page of the TV app: the VMAP and the pre-roll are asked for before Play.
  const ready = preloadAds(schedule(), { http, clock });
  preload = ready;
  const plan = adPlan(await ready);
  if (preload === ready) {
    el.plan.textContent = plan
      ? adPlanLabel(plan)
      : tag
        ? 'The tag could not be read. Check the URL and the CORS headers of the ad server.'
        : 'The ad plan could not be loaded';
    planMarks = plan?.marks ?? [];
    el.breaks.textContent = planMarks.length > 0 ? `Breaks: ${planMarks.map(planLabel).join(' · ')}` : '';
  }
  renderMarks();
  render();
  return id;
}

function start(): void {
  if (manager) {
    return; // one viewing at a time: a second click while the ad plan loads must not start another
  }
  if (tagMode() && !loadedTag) {
    return; // the plan line says what is wrong with the tag
  }
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
    pauseAdUrl: classic() || tagMode() ? undefined : `${CDN}vast/pause.xml`,
    onChange: (next) => {
      if (manager !== created) return; // a viewing that was stopped
      snapshot = next;
      render();
    },
    onTimeline: (next) => {
      if (manager !== created) return;
      timeline = next;
      renderMarks();
      render();
    },
    onPauseAd: (view) => {
      if (manager !== created) return;
      pauseAd = view;
      render();
    },
    onEvent: (name, info) => {
      if (manager !== created) return;
      events.push(name);
      const ad = info.ad ? ` · ${info.ad.title ?? info.ad.id ?? 'ad'}` : '';
      const where = info.breakId && !name.startsWith('break:') ? ` · ${info.breakId}` : '';
      log('event', `${name}${ad}${where}`);
      if (name === 'content:ended') {
        ended = true;
        el.report.textContent = watchReportLabel(watchReport(events));
      }
    },
  });
  manager = created;
  void created.start(schedule(), { preloaded: preload ?? undefined });
}

// ---- Controls.

function togglePlay(): void {
  const action = playAction({
    ended,
    viewing: manager !== null,
    adOnScreen: snapshot.adSurface !== null,
    contentBegun,
    contentPaused: el.content.paused,
  });
  switch (action) {
    case 'restart':
      void load().then((id) => {
        if (id === loads) start(); // not when the viewer picked another movie meanwhile
      });
      break;
    case 'start':
      start();
      break;
    case 'toggleAd':
      manager?.togglePause();
      render();
      break;
    case 'playContent':
      void content.play().catch(() => undefined);
      break;
    case 'pauseContent':
      content.pause(); // the pause ad comes after 1.5 s
      break;
    case 'wait':
      break;
  }
}

/**
 * Back, as on the TV: a pause ad closes first. Otherwise the player closes, also during an ad
 * (VegaAdsPlayer's default `backDuringAd: 'app'`), so Back never skips an ad.
 */
function back(): void {
  if (!manager || manager.closePauseAd()) {
    return;
  }
  log('event', 'Back: the player closes, as on the TV');
  void load();
}

function seekBy(seconds: number): void {
  if (manager && contentBegun && snapshot.adSurface === null) {
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
el.tagLoad.addEventListener('click', () => {
  const problem = tagProblem(el.tagUrl.value.trim(), location.protocol);
  if (problem) {
    el.plan.textContent = problem;
  } else {
    void load();
  }
});
el.tagBox.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((button) =>
  button.addEventListener('click', () => {
    const sample = SAMPLE_TAGS[button.dataset.sample as keyof typeof SAMPLE_TAGS];
    el.tagKind.value = sample.kind;
    el.tagUrl.value = sample.url;
    void load();
  }),
);
el.content.addEventListener('timeupdate', render);
el.content.addEventListener('playing', () => {
  if (manager) contentBegun = true;
});
el.content.addEventListener('play', render);
el.content.addEventListener('pause', render);
el.content.addEventListener('loadedmetadata', () => {
  renderMarks();
  render();
});

function keyTarget(target: EventTarget | null): KeyTarget {
  if (target instanceof HTMLInputElement) return 'input';
  if (target instanceof HTMLButtonElement) return 'button';
  if (target instanceof HTMLSelectElement) return 'select';
  return 'page';
}

document.addEventListener('keydown', (event) => {
  switch (keyAction(event.key, keyTarget(event.target))) {
    case 'load':
      el.tagLoad.click();
      break;
    case 'toggle':
      event.preventDefault();
      togglePlay();
      break;
    case 'back':
      back();
      break;
    case 'forward':
      seekBy(10);
      break;
    case 'rewind':
      seekBy(-10);
      break;
  }
});

// After a mouse click some browsers keep the focus on the button, and Space would press it
// again instead of playing or pausing. A key press on a button (detail 0) keeps the focus.
document.addEventListener('click', (event) => {
  if (event.detail > 0 && event.target instanceof HTMLButtonElement) event.target.blur();
});

// A shared link: ?vmap=URL or ?vast=URL opens the page with that tag.
const shared = tagFromQuery(location.search);
if (shared) {
  el.mode.value = 'tag';
  el.tagKind.value = shared.kind;
  el.tagUrl.value = shared.url;
}
void load();
