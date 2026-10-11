import type { ClockPort, HttpPort } from '@vega-ads/core';

/** HttpPort on the global fetch of React Native for Vega. */
export const fetchHttp: HttpPort = {
  get: async (url, options) => {
    const response = await fetch(url, { signal: options?.signal as AbortSignal | undefined });
    return { status: response.status, ok: response.ok, text: () => response.text() };
  },
};

export const systemClock: ClockPort = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
