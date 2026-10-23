# web-demo

A web page that runs `react-native-ads-core` with an HTML video element as the player. Judges and developers can try the ad logic without a Fire TV.

It uses the same movies, ads and ad tags as the Fire TV build. They come from the demo CDN that `tools/demo-ads/deploy-aws.sh` sets up.

## What it shows

- The pre-roll, mid-roll pods, the post-roll and the "Ad in 5" warning.
- Ads left out: a repeat, and an ad blocked after a sensitive scene (Sintel).
- Ads turned down to the movie's loudness, ad captions and the pause ad.
- A live log of the ad requests, the ad events and the tracking pixels.
- "Ads as usual" next to it, to compare.
- "Your ad tag": a VAST or VMAP URL of your own ad server, or Google's sample tags. The page address then holds the tag (`?vmap=URL` or `?vast=URL`), so the test can be shared as a link.
- Back works as on the TV: it closes a pause ad, otherwise the player, also during an ad. It never skips an ad.

## Build and run

```sh
npm run build -w tools/web-demo
cd tools/web-demo/dist && python3 -m http.server 8080
```

Then open http://localhost:8080.

The build needs the internet. It copies the VAST, VMAP and WebVTT files of the CDN into `dist/cdn/`. The CDN sends no CORS headers, so the page reads these copies from its own origin. Videos, images and pixels still go to the CDN and the pixel collector, as on the TV.

The workflow `.github/workflows/web-demo.yml` publishes `dist/` to GitHub Pages after the type check and the tests of `packages/core` and `tools/web-demo`.

## Differences from the TV app

- In the browser, `HtmlVideoPort` takes the place of the w3cmedia `VideoPlayer`. Both implement `PlayerPort`.
- The page has one ad surface. On the TV, the next ad of a pod buffers on a second surface.
- A browser can block sound until the viewer clicks the page. Then the video plays muted, and the page shows a button that turns the sound on.
- The page sends real tracking pixels. The pixel collector's daily report counts them together with the pixels from the TV.
