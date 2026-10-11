import {installImagePolyfill as installCorePolyfill} from 'react-native-ads-core';
import {http} from './ads';
import {log} from './log';

/** Gate 6: what the Vega JavaScript runtime actually provides. */
export function reportRuntime(): void {
  const g = globalThis as Record<string, unknown>;
  const names = [
    'window',
    'Image',
    'DOMParser',
    'AbortController',
    'fetch',
    'XMLHttpRequest',
  ];
  names.forEach((name) => log(`runtime: typeof ${name} = ${typeof g[name]}`));
}

/** Core polyfill, with a logging HTTP port so pixels and their status show on screen. */
export function installImagePolyfill(): void {
  const installed = installCorePolyfill({
    get: async (url) => {
      log(`pixel: ${url.slice(0, 90)}`);
      const response = await http.get(url);
      log(`pixel status: ${response.status}`);
      return response;
    },
  });
  log(
    installed
      ? 'polyfill (core): Image installed'
      : 'polyfill (core): Image already defined',
  );
}
