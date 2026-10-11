import type { HttpPort } from '../ports';

/**
 * vast-client and vmap send tracking pixels with `new Image().src = url`
 * whenever `window` exists. React Native has `window` but no `Image`
 * constructor, so pixels would throw. This polyfill turns `src=` into a
 * fire-and-forget GET with one retry after a network error (R14).
 *
 * @returns true if the polyfill was installed, false if `Image` already existed.
 */
export function installImagePolyfill(http: HttpPort, target: Record<string, unknown> = globalThis as never): boolean {
  if (typeof target.Image !== 'undefined') {
    return false;
  }

  const send = (url: string, attemptsLeft: number): void => {
    http.get(url).catch(() => {
      if (attemptsLeft > 0) {
        send(url, attemptsLeft - 1);
      }
    });
  };

  class PixelImage {
    private url = '';

    get src(): string {
      return this.url;
    }

    set src(value: string) {
      this.url = value;
      if (value) {
        send(value, 1);
      }
    }
  }

  target.Image = PixelImage;
  return true;
}
