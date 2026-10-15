# vast-samples

Runs every [IAB Tech Lab VAST sample](https://github.com/InteractiveAdvertisingBureau/VAST_Samples) through `react-native-ads-core`: the same request, wrapper and media file code the player uses, without a device. The samples are downloaded at a fixed commit and are not part of this repository.

```sh
npm run build -w packages/core
cd tools/vast-samples
sh get_samples.sh
node check.mjs            # offline: wrappers to other hosts count as unreachable
node check.mjs --online   # follows wrappers to their ad tag URLs (plain GET requests)
```

Result on 15.10.2026 (`--online`, samples commit `6a60797`):

| Sample | Plays |
|---|---|
| Linear video with an H.264 mp4 (VAST 2.0–4.2) | 46 of 46 |
| Wrapper (VAST 3.0–4.2) | 7 of 7 |
| Wrapper whose ad server no longer exists (VAST 2.0) | 0 of 4, VAST error 301 |
| Linear without an H.264 mp4: VPAID, Flash video, audio only | 0 of 5, VAST error 403, as intended |
| Non-linear or companion only | 0 of 7, no linear ad (error 200); non-linear ads are used as pause ads |
| VAST 1.0 | 0 of 6, not supported |

The first run found three ways real ad servers describe a plain H.264 file that the player had refused: `codec="H.264"`, `codec="0"` and `apiFramework="VAST"`. They play since then.
