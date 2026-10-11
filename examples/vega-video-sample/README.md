# vega-ads in Amazon's vega-video-sample

This patch adds client-side ads to [AmazonAppDev/vega-video-sample](https://github.com/AmazonAppDev/vega-video-sample) (React Native 0.83, Vega SDK 0.24). The sample plays MP4 through the w3cmedia player and DASH/HLS through Shaka; ads work for both.

What the patch changes (two files, about 60 lines):

- `src/ads/adsConfig.ts` (new): `ADS_ENABLED` and the VMAP URL (a public Google test VMAP: pre-roll, a pod of 3 at 0:15, post-roll).
- `src/screens/PlayerScreen.tsx`:
  - hands the content `VideoPlayer` to `useVegaAds` once its surface is set, instead of calling `play()`; the library starts the content after the pre-roll;
  - passes the sample's own media controls handler (`AppOverrideMediaControlHandler`) as `contentMediaControlHandler`, so it is restored after every break;
  - renders `AdSurfaceLayers` above the content surface and captions, and `AdOverlay` on top;
  - hides the player UI, the buffering view and captions while `ads.playing`;
  - waits for `ads.ended` (post-roll) before leaving the screen at the end.

The sample's `manifest.toml` already declares media controls, so the remote and Alexa control ads without changes.

## Run it

1. Clone the sample at the tested commit:
   ```
   git clone https://github.com/AmazonAppDev/vega-video-sample.git
   cd vega-video-sample
   git checkout ef8e4da
   ```
2. Follow the sample's README to set up Shaka and install dependencies.
3. Install the library: `npm install @vega-ads/vega`. Before it is published on npm, build and pack it from this repository (`npm pack ./packages/vast ./packages/core ./packages/vega`) and install the three `.tgz` files with `npm install --no-save`.
4. Apply the patch from this folder: `git apply path/to/vega-ads.patch`
5. Build and run with Vega SDK 0.24: `npm run build:release`, then `vega run-app <path to the .vpkg> -d <device>`.

Set `ADS_ENABLED = false` in `src/ads/adsConfig.ts` to compare with the original behaviour.

## Tested

Fire TV Stick 4K Select, Vega OS 1.2, SDK 0.24.12112, 11.10.2026: MP4 and DASH (Shaka) titles; pre-roll, mid-roll pod, remote play/pause during an ad, Back during an ad. Details in `apps/spike/DEVICE-TESTS.md`.
