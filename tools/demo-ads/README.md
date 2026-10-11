# demo-ads

Ad creatives and a local media server for device tests and the demo.

The creatives are drawn frame by frame by `make_ads.py`: invented brands, the
Inter font (SIL Open Font License), no third-party footage or logos.

| Ad | Length | Skippable |
|---|---|---|
| Kettlo | 10 s | after 5 s (single ad) |
| Brewnord | 15 s | no |
| Voltaro | 12 s | after 5 s |

## Make the creatives

Needs Python 3 with Pillow, and ffmpeg with libx264 and aac.

```sh
python3 make_ads.py --font Inter.ttf --out media/ads
```

Each ad is written in 1080p (H.264 High 4.0) and 720p, AAC stereo, `+faststart`.

## Serve them on the local network

```sh
npm run build --prefix ../make-vmap
node serve.mjs --dir media
```

`media/` holds `ads/` and the content movie (default `tears_of_steel_720p.mp4`).
The server prints its address and serves:

- `vast/single.xml` – Kettlo, skippable after 5 s;
- `vast/pod.xml` – Brewnord, Voltaro, Kettlo as a pod;
- `vmap/movie.xml` – pre-roll, the mid-rolls (the first one is the pod), post-roll;
- `vmap/timer.xml` – the same with mid-rolls at fixed times, 2:00 and 6:00, to compare with;
- `p?ad=…&e=…` – tracking pixels, logged to the console; `stats` – counts;
- any other file in `media/`, for example a `poster.jpg`.

The mid-rolls of `vmap/movie.xml` are at 2:00 and 6:00 by default. To use the
quiet points that [`make-vmap`](../make-vmap) finds in the movie:

```sh
node ../make-vmap/dist/main.js --local media/tears_of_steel_720p.mp4 --vast-url http://localhost:8080/vast/single.xml --out /dev/null
# 2 mid-rolls: 00:02:19.917, 00:07:21.208
node serve.mjs --dir media --midrolls 139.917,441.208
```

`--latency MS` answers every VAST and VMAP request after MS milliseconds, like a real ad
server, to measure what preloading saves. Media files are not delayed.

Vega's w3cmedia player refuses `http://` media unless the host is listed in the
app manifest:

```toml
[network-traffic-policy.cleartext]
allowed-domains = ["192.168.1.20"]
```

Use HTTPS hosting for anything outside a development network.
