# demo-ads

Ad creatives and a local media server for device tests and the demo.

The creatives are drawn frame by frame by `make_ads.py`: invented brands, the
Inter font (SIL Open Font License), no third-party footage or logos.

| Ad | Length | Skippable |
|---|---|---|
| Kettlo | 10 s | after 5 s (single ad) |
| Brewnord | 15 s | no |
| Voltaro | 12 s | after 5 s |
| Ferntop | 10 s | after 5 s |
| Quillary | 12 s | no |

The pause ad is a 600×600 Brewnord card (IAB CTV Ad Portfolio size, about 28 kB) with a
QR code that points to `https://brewnord.example/pause`, a reserved `.example` domain.

## Get all the media

Needs curl, shasum, unzip, ffmpeg with libx264 and aac, and Python 3. The script puts Pillow and segno
(for the QR code) into `media/.venv`. It downloads about 1.1 GB (Tears of Steel 372 MB, Sintel 681 MB).

```sh
sh get_media.sh
```

It fills `media/` (not committed). After the downloads, the rest takes about a minute:

- `tears_of_steel_720p.mp4`: the movie, (CC) Blender Foundation | [mango.blender.org](https://mango.blender.org), CC BY 3.0. Downloaded from `download.blender.org` and checked by SHA-256. The video is copied as it is. The MP3 sound becomes AAC, which w3cmedia plays, at -24 LUFS (the TV level of ATSC A/85, while the web release is about -12 LUFS).
- `poster.jpg`: a frame of the movie
- `sintel_720p.mp4` and `poster_sintel.jpg`: the second title, *Sintel*, © copyright Blender Foundation | [durian.blender.org](https://durian.blender.org), CC BY 3.0. The zip from `download.blender.org` is checked by SHA-256. The video is copied as it is, the 5.1 AC-3 sound becomes stereo AAC at -24 LUFS
- `fonts/Inter.ttf` and `fonts/OFL.txt`: [Inter](https://github.com/google/fonts/tree/main/ofl/inter), SIL Open Font License
- `ads/`: the five ads, the pause ad card and its QR code, drawn by `make_ads.py`
- `loudness.json`: the integrated loudness of the movie and the ads (LUFS, EBU R128), measured with ffmpeg. The server writes it into each ad's VAST.

Files that are already there are kept, so a second run does nothing.

## Make the creatives

`get_media.sh` runs this step. To run it alone (Python 3 with Pillow, segno for the QR code, ffmpeg with libx264 and aac):

```sh
python3 make_ads.py --font media/fonts/Inter.ttf --out media/ads
```

Each ad is written in 1080p (H.264 High 4.0) and 720p, AAC stereo, `+faststart`, at -16 LUFS: as loud as many web ads, 8 dB above the movie, so the player has to turn them down.
The pause ad is `brewnord_pause.png`. Its QR code is `brewnord_qr.png`.

## Serve them on the local network

```sh
npm run build --prefix ../make-vmap
node serve.mjs --dir media
```

`media/` holds `ads/` and the content movie (default `tears_of_steel_720p.mp4`).
The server prints its address and serves:

- `vast/single.xml`: Kettlo, skippable after 5 s (the pre-roll), with Ferntop standing by (a VAST buffet: no `sequence`). The demo app remembers shown creatives for 30 minutes across titles and launches, so a second launch within 30 minutes plays Ferntop
- `vast/pod.xml`: Brewnord, Voltaro, Kettlo as a pod. Kettlo comes again, as when two ad sources sell the same creative. The player leaves it out and sends its `notUsed` pixel
- `vast/ferntop.xml`: Ferntop, skippable after 5 s (the second mid-roll)
- `vast/quillary.xml`: Quillary (the post-roll)
- `vast/pause.xml`: the Brewnord pause ad: a `NonLinear` image with the `tl_qrcode` extension. Its pixels: `impression`, `creativeView`, `overlayViewDuration`, `close`
- `vmap/movie.xml`: pre-roll, the mid-rolls (the first one is the pod), post-roll
- `vmap/sintel.xml`: the same for Sintel, mid-rolls at 2:42.1 and 9:03.1 (`--sintel-midrolls`). Both carry the break context in `contexts/sintel.json`, written by `make-vmap --context-model` with Qwen3.6-35B-A3B. Before 2:42 the model heard a line about blood (`injury`), so the break blocks Life Insurance and Sporting Goods, and the player leaves out Kettlo (Sporting Goods) with error 205. Before 9:03 it saw a dead creature and a sword (`death`, `weapons`), so the break blocks Life Insurance, Toys and Games and alcohol. No demo ad is in those. `--sintel-context FILE` replaces it
- `vmap/timer.xml`: the same with mid-rolls at fixed times, 2:00 and 6:00, to compare with
- `vmap/classic.xml`: ads as usual, for the demo's "Compare" button: Kettlo as the pre-roll, then a mid-roll on a timer at 0:32 of Tears of Steel that cuts a line, with Kettlo again and Brewnord (`vast/classic-pre.xml`, `vast/classic-mid.xml`). The app plays it without the loudness guard and the no-repeat rules
- `captions/<ad>.en.vtt`: the ads' WebVTT captions (VAST `<ClosedCaptionFiles>`): `[calm music]`, then the ad's on-screen line. The ads have music and no speech
- `p?ad=...&e=...`: tracking pixels, logged to the console. `stats`: counts
- any other file in `media/`, for example a `poster.jpg`.

The mid-rolls of `vmap/movie.xml` are at 2:00 and 6:00 by default. To use the
quiet points that [`make-vmap`](../make-vmap) finds in the movie:

```sh
node ../make-vmap/dist/main.js --local media/tears_of_steel_720p.mp4 --vast-url http://localhost:8080/vast/single.xml --out /dev/null
# 2 mid-rolls: 00:02:19.917, 00:07:21.208
node serve.mjs --dir media --midrolls 139.917,441.208
```

`--context FILE` adds break contexts to `vmap/movie.xml`: a JSON array, one entry per mid-roll (`null` for none), each `{ mood, scene, signals, blockedAdCategories }`, as make-vmap writes them into its VMAP.

`--latency MS` answers every VAST and VMAP request after MS milliseconds, like a real ad
server, to measure what preloading saves. Media files are not delayed.

Vega's w3cmedia player refuses `http://` media unless the host is listed in the
app manifest:

```toml
[network-traffic-policy.cleartext]
allowed-domains = ["192.168.1.20"]
```

Use HTTPS hosting for anything outside a development network.

## Put them on AWS

`deploy-aws.sh` deploys [`pixel-collector`](../pixel-collector) (S3 + CloudFront +
Lambda function URL + DynamoDB), uploads the movies, the ads and the posters, and writes
the same documents as `serve.mjs`, pointing to CloudFront and to the pixel collector:

```sh
npm run build --prefix ../make-vmap
aws login --region eu-west-1
./deploy-aws.sh media --midrolls 139.917,441.208
```

It prints the `MEDIA_BASE` for the demo app (`apps/demo/src/media.local.ts`) and the
pixel report URL. Media over HTTPS needs no cleartext entry in the manifest. Run it again
after a change: the stack is updated, and only new or changed media files are uploaded.
`DRY_RUN=1` prints the AWS commands without running them. `STACK` and `AWS_REGION` choose
the stack (default `vega-ads-demo` in `eu-west-1`). `export-static.mjs` writes the documents
alone, for other hosting. `sam delete --stack-name vega-ads-demo` removes it all. Empty the
bucket first.
