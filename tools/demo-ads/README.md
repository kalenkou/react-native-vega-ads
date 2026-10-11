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
- `vmap/movie.xml` – pre-roll, mid-rolls at 2:00 (pod) and 6:00, post-roll;
- `p?ad=…&e=…` – tracking pixels, logged to the console; `stats` – counts.

Vega's w3cmedia player refuses `http://` media unless the host is listed in the
app manifest:

```toml
[network-traffic-policy.cleartext]
allowed-domains = ["192.168.1.20"]
```

Use HTTPS hosting for anything outside a development network.
