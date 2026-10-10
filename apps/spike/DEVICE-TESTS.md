# Spike device tests

Device: Fire TV Stick 4K Select (Vega OS ___), build: `build/armv7-debug/spike_armv7.vpkg`

| Gate | What | How | Result | Date |
|---|---|---|---|---|
| 6 | Runtime globals | first log lines `runtime: typeof …` | window= / Image= / DOMParser= / AbortController= / fetch= | |
| 6 | VAST in Metro bundle | log `ad: ready in … ms` | | |
| 1 | Content → ad without a visible black frame | log `SWITCH content->ad: … ms` (< 300) + phone video | | |
| 4 | Resume position ±1 s | log `RESUME drift: … s` | | |
| 5 | Impression and quartile pixels | log `pixel: …` (5 lines per ad) | | |
| 2 | 30+ min, 10 breaks, memory | button "10 breaks"; `vega exec perf memory-monitor` PSS < 400 MiB, JS heap < 200 MB | | |
| – | Media Controls during ad | "Alexa, pause" / remote play-pause during the ad | | |
