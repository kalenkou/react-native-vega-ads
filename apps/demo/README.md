# vega-ads demo

A small Vega OS app: one movie with ads that do not annoy. It shows what
`react-native-vega-ads` gives a real app with `<VegaAdsPlayer>` and a few lines of code:

- a pre-roll, a pod of three ads and a single ad as mid-rolls, a post-roll;
- mid-rolls at quiet points of the movie, found by [`make-vmap`](../../tools/make-vmap), not on a timer;
- the breaks marked on the timeline, so the viewer knows where they are;
- "Ad in 5" before a mid-roll, so a break never comes as a surprise;
- Skip after 5 s on skippable ads, Back and the remote work as expected.

The movie is _Tears of Steel_, (CC) Blender Foundation | [mango.blender.org](https://mango.blender.org), CC BY 3.0.
The ads are invented brands drawn by [`tools/demo-ads`](../../tools/demo-ads).

## Run it

You need the Vega SDK, a Fire TV device on the same network as your computer, and the
media from [`tools/demo-ads`](../../tools/demo-ads) (the ads and `tears_of_steel_720p.mp4`).

1. Start the media server on your computer:

   ```sh
   cd tools/demo-ads
   node serve.mjs --dir media --midrolls 139.917,441.208
   ```

   It prints its address, for example `http://192.168.1.20:8080/`.

2. Copy `src/media.example.ts` to `src/media.local.ts` and set `MEDIA_BASE` to that address.
   `media.local.ts` is not committed.

3. Let the app load `http://` media from your computer. Add to `manifest.toml`:

   ```toml
   [network-traffic-policy.cleartext]
   allowed-domains = ["192.168.1.20"]
   ```

   Do not commit this: it is for a development network only.

4. Install the packages from this repository and build:

   ```sh
   cd apps/demo
   npm install
   npm run use-core
   npm run build:release
   ```

5. Install and start the app on the device:

   ```sh
   vega run-app build/armv7-release/demo_armv7.vpkg -d DEVICE
   ```

   Use `build/aarch64-release/demo_aarch64.vpkg` on a 64-bit device.

## Remote

| Key          | Action                                                |
| ------------ | ----------------------------------------------------- |
| Select       | Play on the movie screen; play or pause in the player |
| Left / Right | Seek 10 s back or forward                             |
| Back         | Close the player                                      |

Seeking over a mid-roll plays that break first, then the movie continues where you seeked to.

## Tests

```sh
npm test
```
