# vega-ads

Client-side ad insertion (VAST 4 / VMAP 1) for React Native apps on Amazon Vega OS.

Vega has no Google IMA SDK. Amazon's guide shows how to switch between two `VideoPlayer` instances, but leaves ad requests, tracking, scheduling, pods, skip and error handling to each app. `vega-ads` fills that gap: it fetches VAST/VMAP, pre-buffers ads in a second native player, switches without a black frame and sends IAB tracking events.

## Status

Early work in progress. Not ready for production.

- `packages/core` – platform-independent ad logic (in progress)
- `packages/vega` – Vega adapter on `@amazon-devices/react-native-w3cmedia` (in progress)
- `apps/spike` – device spike that checks the platform on a real Fire TV Stick

## Licence

Apache-2.0
