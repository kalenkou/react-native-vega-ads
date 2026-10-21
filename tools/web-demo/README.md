# web-demo

A web page that runs `react-native-ads-core` with an HTML video element as the player. Judges and developers can try the ad logic without a Fire TV.

It uses the same movies, ads and ad tags as the Fire TV build. They come from the demo CDN that `tools/demo-ads/deploy-aws.sh` sets up.

## What it shows

- The pre-roll, mid-roll pods, the post-roll and the "Ad in 5" warning.
- Ads left out: a repeat, and an ad blocked after a sensitive scene (Sintel).
- Ads turned down to the movie's loudness, ad captions and the pause ad.
- A live log of the ad requests, the ad events and the tracking pixels.
- "Ads as usual" next to it, to compare.

## Build and run

```sh
npm run build -w tools/web-demo
cd tools/web-demo/dist && python3 -m http.server 8080
```

Then open http://localhost:8080.

The build needs the internet. It copies the VAST, VMAP and WebVTT files of the CDN into `dist/cdn/`. The CDN sends no CORS headers, so the page reads these copies from its own origin. Videos, images and pixels still go to the CDN and the pixel collector, as on the TV.

The workflow `.github/workflows/web-demo.yml` publishes `dist/` to GitHub Pages.

## How it differs from the TV

- `HtmlVideoPort` is the browser stand-in for the w3cmedia `VideoPlayer`. It implements the same `PlayerPort`.
- One ad surface. The TV prebuffers the next ad of a pod on a second surface.
- Browsers may refuse sound before the viewer uses the page. Then the video plays muted and the page offers a button to turn the sound on.
- The page sends real tracking pixels. They count in the pixel collector's daily report, together with the TV's.
