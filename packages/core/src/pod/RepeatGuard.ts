import type { ClockPort, LinearAd } from '../vast';

/** Default time in which a creative the viewer has seen is not shown again: 30 minutes. */
export const REPEAT_WINDOW_MS = 30 * 60 * 1000;

/** At most this many creatives are kept in a `RepeatMemory`; the oldest go first. */
const MEMORY_LIMIT = 500;

/**
 * One string kept on the device between titles and app launches, for example under one
 * AsyncStorage key. It holds creative ids and media URLs with the time they were shown;
 * no viewer id.
 */
export interface RepeatMemory {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
}

export interface RepeatOptions {
  /** A creative shown less than this many ms ago is not shown again. Default REPEAT_WINDOW_MS. */
  withinMs?: number;
  /**
   * Remembers shown creatives across titles and app launches: one household does not see the
   * same ad again within `withinMs` in any title. Without it the rules hold for one title only.
   */
  memory?: RepeatMemory;
}

export interface DroppedAd {
  ad: LinearAd;
  /** `repeat`: the same creative was shown or comes earlier in the break; `advertiser`: so does its advertiser. */
  reason: 'repeat' | 'advertiser';
}

/**
 * The names of one creative. One creative often reaches the player through several ad
 * sources under different ad ids, so the ad server cannot see the repeat; the player sees
 * what it plays. Universal Ad ID ("unknown" means none) and media file URLs are compared.
 */
function creativeKeys(linear: LinearAd): string[] {
  const keys = (linear.creative.universalAdIds ?? [])
    .filter((id) => id.value && id.value !== 'unknown')
    .map((id) => `uaid:${id.idRegistry}:${id.value}`);
  linear.creative.mediaFiles.forEach((file) => file.fileURL && keys.push(`media:${file.fileURL}`));
  return keys;
}

function advertiserKey(linear: LinearAd): string | null {
  const advertiser = linear.ad.advertiser;
  if (advertiser?.id) {
    return `id:${advertiser.id}`;
  }
  const name = advertiser?.value?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/** The ads of one response in the order they would play: the pod by sequence, then the rest. */
function playOrder(ads: LinearAd[]): LinearAd[] {
  const pod = ads.filter((a) => a.sequence !== null).sort((a, b) => (a.sequence as number) - (b.sequence as number));
  return [...pod, ...ads.filter((a) => a.sequence === null)];
}

/** The stored times, or nothing when the value is missing or not ours. */
function parseMemory(value: string | null): Array<[string, number]> {
  try {
    const parsed = JSON.parse(value ?? 'null') as { v?: unknown; seen?: Record<string, unknown> } | null;
    if (parsed?.v !== 1 || typeof parsed.seen !== 'object' || parsed.seen === null) {
      return [];
    }
    return Object.entries(parsed.seen).filter((entry): entry is [string, number] => typeof entry[1] === 'number');
  } catch {
    return [];
  }
}

/**
 * Viewer rules for the ads of one piece of content:
 * - a creative is not shown again within `withinMs` of its impression;
 * - a break has one copy of each creative and one ad per advertiser.
 * Kept in memory, and in `options.memory` when given; no viewer id is needed.
 */
export class RepeatGuard {
  private readonly seen = new Map<string, number>();
  private readonly withinMs: number;
  private readonly memory: RepeatMemory | undefined;
  private readonly restored: Promise<void>;

  constructor(
    private readonly clock: ClockPort,
    options: RepeatOptions = {},
  ) {
    this.withinMs = options.withinMs ?? REPEAT_WINDOW_MS;
    this.memory = options.memory;
    this.restored = this.memory ? this.restore(this.memory) : Promise.resolve();
  }

  /** Resolves when the creatives in the memory are known; never rejects. */
  ready(): Promise<void> {
    return this.restored;
  }

  /** The creative's first frame was on screen. */
  shown(linear: LinearAd): void {
    const now = this.clock.now();
    creativeKeys(linear).forEach((key) => this.seen.set(key, now));
    this.save();
  }

  private async restore(memory: RepeatMemory): Promise<void> {
    const stored = parseMemory(await memory.read().catch(() => null));
    stored.forEach(([key, at]) => this.seen.set(key, Math.max(at, this.seen.get(key) ?? at)));
  }

  /** Writes the creatives still inside the window, the newest MEMORY_LIMIT of them. */
  private save(): void {
    if (!this.memory) {
      return;
    }
    const now = this.clock.now();
    const recent = [...this.seen]
      .filter(([, at]) => now - at < this.withinMs)
      .sort((a, b) => a[1] - b[1])
      .slice(-MEMORY_LIMIT);
    this.memory.write(JSON.stringify({ v: 1, seen: Object.fromEntries(recent) })).catch(() => undefined);
  }

  /** Removes from the responses of one break the ads the rules do not allow. */
  filter(responses: LinearAd[][]): { responses: LinearAd[][]; dropped: DroppedAd[] } {
    const now = this.clock.now();
    const inBreak = new Set<string>();
    const advertisers = new Set<string>();
    const dropped: DroppedAd[] = [];
    const kept = responses.map((ads) => {
      const allowed = new Set<LinearAd>();
      for (const linear of playOrder(ads)) {
        const keys = creativeKeys(linear);
        const advertiser = advertiserKey(linear);
        const seenAt = keys.map((key) => this.seen.get(key)).filter((at): at is number => at !== undefined);
        if (keys.some((key) => inBreak.has(key)) || seenAt.some((at) => now - at < this.withinMs)) {
          dropped.push({ ad: linear, reason: 'repeat' });
        } else if (advertiser && advertisers.has(advertiser)) {
          dropped.push({ ad: linear, reason: 'advertiser' });
        } else {
          allowed.add(linear);
          keys.forEach((key) => inBreak.add(key));
          if (advertiser) {
            advertisers.add(advertiser);
          }
        }
      }
      return ads.filter((a) => allowed.has(a));
    });
    return { responses: kept, dropped };
  }
}
