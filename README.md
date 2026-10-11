# vega-ads

Client-side ad insertion (VAST 4 / VMAP 1) for React Native apps on Amazon Vega OS.

Vega has no Google IMA SDK. Amazon's guide shows how to switch between two `VideoPlayer` instances, but leaves ad requests, tracking, scheduling, pods, skip and error handling to each app. `vega-ads` fills that gap: it fetches VAST/VMAP, pre-buffers ads in a second native player, switches without a black frame and sends IAB tracking events.

## Status

Early work in progress. Not ready for production.

- `packages/vast` – VAST/VMAP loading, media file choice and IAB tracking (in progress)
- `packages/core` – platform-independent ad logic (in progress)
- `packages/vega` – Vega adapter on `@amazon-devices/react-native-w3cmedia` (in progress)
- `apps/spike` – device spike that checks the platform on a real Fire TV Stick

## XML on Vega

Vega has no `DOMParser`, and native XML modules such as `react-native-xml2js` are not available there. Developers asked Amazon for an XML parser for VAST ([forum, 25.09.2025](https://community.amazondeveloper.com/t/20419)); Amazon suggested a pure-JS parser.

`vega-ads` uses pure JS too: `@xmldom/xmldom` by default, and you can pass your own parser (`parseXml` option). Measured on a Fire TV Stick 4K Select, Release build: a 34.4 KB VAST takes about 49 ms text → DOM and 11 ms DOM → VAST model (median of 30 runs, see `apps/spike/DEVICE-TESTS.md`). Ads are loaded before the break, so the viewer does not wait for this.

## Licence

Apache-2.0
