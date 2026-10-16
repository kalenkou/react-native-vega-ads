# vega-ads demo

A small Vega OS app: one movie with ads that do not annoy. It shows what
`react-native-vega-ads` gives a real app with `<VegaAdsPlayer>` and a few lines of code:

- a pre-roll, a pod and a single ad as mid-rolls, a post-roll;
- no ad twice: the pod's answer repeats the pre-roll's ad, and the player leaves it out ("Ad 1 of 2");
- mid-rolls at quiet points of the movie, found by [`make-vmap`](../../tools/make-vmap), not on a timer;
- the breaks marked on the timeline, so the viewer knows where they are;
- "Ad in 5" before a mid-roll, so a break never comes as a surprise;
- Skip after 5 s on skippable ads, Back and the remote work as expected.

"Compare: ads as usual" on _Tears of Steel_ plays the same movie the way ads usually work, with a badge on screen: a mid-roll on a timer at 0:32 that cuts a line, the pre-roll's ad again, ads louder than the movie, no "Ad in 5".

The movies are _Tears of Steel_, (CC) Blender Foundation | [mango.blender.org](https://mango.blender.org), CC BY 3.0, and _Sintel_, © copyright Blender Foundation | [durian.blender.org](https://durian.blender.org), CC BY 3.0. "Next" on the details screen switches between them.
The ads are invented brands drawn by [`tools/demo-ads`](../../tools/demo-ads).

## Run it

You need Node.js 22, the Vega SDK (tested with 0.24.12112; `vega sdk list` shows the active
one), a Fire TV device on the same network as your computer, and the media from
[`tools/demo-ads`](../../tools/demo-ads).

1. From the repository root, install and build the tools, get the movie and the ads, and
   start the media server on your computer:

   ```sh
   npm ci
   npm run build -w tools/make-vmap
   cd tools/demo-ads
   sh get_media.sh
   node serve.mjs --dir media --midrolls 139.917,441.208
   ```

   It prints its address, for example `http://192.168.1.20:8080/`. Keep it running.

2. In another terminal, from the repository root, `cd apps/demo`. Copy `src/media.example.ts`
   to `src/media.local.ts` and set `MEDIA_BASE` to that address. `media.local.ts` is not committed.
   Set `MUTED = true` there to mute the movie and the ads, for test runs where the TV must stay silent.

3. Let the app load `http://` media from your computer. Add to `apps/demo/manifest.toml`:

   ```toml
   [network-traffic-policy.cleartext]
   allowed-domains = ["192.168.1.20"]
   ```

   Do not commit this: it is for a development network only.

4. Still in `apps/demo`, install the packages from this repository and build (step 1's
   `npm ci` at the root is needed for `use-core`):

   ```sh
   npm install
   npm run use-core
   npm run build:release
   ```

   The build adds `[[needs.module]]` entries to `manifest.toml` for the Amazon modules the app
   uses. That is expected.

5. Install and start the app on the device:

   ```sh
   vega run-app build/armv7-release/demo_armv7.vpkg -d DEVICE
   ```

   `vega device list` shows the device ID. Use `build/aarch64-release/demo_aarch64.vpkg` on a
   64-bit device.

## Launch

The system shows `assets/raw/SplashScreenImages.zip` (one frame: the app's background and a small break map) from the first frame until the movie page has its poster; then the app reports fully drawn and hides the splash (`src/launch.ts`). On a Fire TV Stick 4K Select, 30 cold launches with this look: first frame P90 1.09 s, fully drawn P90 3.46 s.

## Look

The movie page shows the title's **break map** before Play: where each ad break is (VMAP time) and what plays first, from `useAdPlan`. During a break the demo draws its own overlay through `renderOverlay` (`src/components/AdLayer.tsx`): the ad label, why the break looks as it does, Skip, and the movie's timeline; `useAdAnnouncements` keeps the library's VoiceView announcements. The ad creative's own bottom line stays visible. Fonts: IBM Plex Sans, Sans Condensed and Mono (`assets/fonts`, SIL Open Font License 1.1); on Vega a font file's name is its family name.

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
