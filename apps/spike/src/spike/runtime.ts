import { log } from './log';

/** Gate 6: what the Vega JavaScript runtime actually provides. */
export function reportRuntime(): void {
  const g = globalThis as Record<string, unknown>;
  const names = ['window', 'Image', 'DOMParser', 'AbortController', 'fetch', 'XMLHttpRequest'];
  names.forEach((name) => log(`runtime: typeof ${name} = ${typeof g[name]}`));
}

/**
 * Tracking pixels: vast-client sends them with `new Image()` when `window` exists.
 * React Native has `window` but no `Image` constructor, so we provide a tiny one
 * that fires a GET request and ignores the response.
 */
export function installImagePolyfill(): void {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.Image !== 'undefined') {
    log('polyfill: Image already defined, skipped');
    return;
  }
  class PixelImage {
    private url = '';
    get src(): string {
      return this.url;
    }
    set src(value: string) {
      this.url = value;
      log(`pixel: ${value.slice(0, 90)}`);
      fetch(value, { method: 'GET' }).catch((error: unknown) => {
        log(`pixel failed: ${String(error)}`);
      });
    }
  }
  g.Image = PixelImage;
  log('polyfill: Image installed');
}
