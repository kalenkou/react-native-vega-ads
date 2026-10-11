# @vega-ads/core

Player-independent ad break logic for client-side ad insertion: break schedule, ad pods, two-player hand-over, IAB tracking and overlay state. It re-exports [`@vega-ads/vast`](../vast).

Part of [vega-ads](https://github.com/kalenkou/vega-ads). On Amazon Vega OS use [`@vega-ads/vega`](../vega), which wraps this package in a React hook.

## Ports

`core` never imports a player SDK, `fetch` or timers. Give it:

- `PlayerPort` – your content player and a factory for ad players (see the main README for the interface);
- `HttpPort` – `get(url, { signal })`;
- `ClockPort` – `now`, `setTimeout`, `clearTimeout`.

## Use

```ts
import { AdManager, adUiState } from '@vega-ads/core';

const manager = new AdManager({
  http,
  clock,
  content: myContentPlayer,          // PlayerPort, initialized, autoplay off
  createAdPlayer: () => new MyAdPlayer(),
  adSurface: 'ad-a',
  standbySurface: 'ad-b',            // optional: prebuffer the next ad on a second player
  onChange: (snapshot) => render(adUiState(snapshot)),
  onEvent: (name) => console.log(name),
});

await manager.start({ vmapUrl: 'https://ads.example.com/vmap.xml' });
// manager.skip(), manager.togglePause(), manager.back(), manager.suspend(), manager.wake(), manager.dispose()
```

What it handles:

- pre-, mid- and post-rolls; a seek over a break plays only the last skipped break;
- pods in `sequence` order; the next ad starts ~500 ms before the current one ends, so no content frame shows between ads;
- impression only for a visible ad; one sound at a time;
- every error and timeout ends in content, with the VAST error code sent.

## License

Apache-2.0
