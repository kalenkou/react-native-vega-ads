# Spike device tests

Device: Fire TV Stick 4K Select (OS 1.2, TV Ship/547, armv7l), build: `build/armv7-debug/spike_armv7.vpkg`

| Gate | What | How | Result | Date |
|---|---|---|---|---|
| 6 | Runtime globals | first log lines `runtime: typeof …` | window=object, Image=undefined, DOMParser=undefined, AbortController=function, fetch=function, XMLHttpRequest=function → PASS (polyfill + xmldom needed, as expected) | 11.10.2026 |
| 6 | VAST in Metro bundle | log `ad: ready in … ms` | 132–319 ms, VAST 35 KB in 64–238 ms → PASS | 11.10.2026 |
| 1 | Content → ad without a visible black frame | log `SWITCH content->ad: … ms` (< 300) + phone video | 68 ms; phone video: hard cut both ways, no dark frame at ~30 fps → PASS | 11.10.2026 |
| 4 | Resume position ±1 s | log `RESUME drift: … s` | 0.00 s; ad player released in 220 ms → PASS | 11.10.2026 |
| 5 | Impression and quartile pixels | log `pixel: …` (5 lines per ad) | 1 impression + 5 interaction pixels (start, quartiles, complete), 2.5 s apart → PASS (all responses HTTP 200, checked 11.10.2026) | 11.10.2026 |
| 2 | 30+ min, 10 breaks, memory | button "10 breaks"; `vega exec perf memory-monitor` PSS < 400 MiB, JS heap < 200 MB | 10/10 breaks, 11 min: PSS 32 → 109 MB peak, plateau 106–107 MB after break 7; switch 68–151 ms; drift 0.00 s every time; ad player released in 220–378 ms → PASS (JS heap not measured; 30+ min run still to do) | 11.10.2026 |
| – | Media Controls during ad | "Alexa, pause" / remote play-pause during the ad | Run 1: FAIL (no focus, no manifest entry). Run 2 (11.10.2026, keys injected with `inputd-cli button_press KEY_PLAYPAUSE`): `setMediaControlFocus` + manifest `interface.provider` / `IMediaPlaybackServer` → content pause/resume OK; during the ad focus moves in 197–217 ms, ad pauses and resumes, content stays paused → remote PASS. "Alexa, pause"/resume confirmed by hand on the device → PASS | 11.10.2026 |

Notes:
- The Google sample bucket (gtv-videos-bucket) answers 403; content moved to archive.org BigBuckBunny_512kb.mp4.
- System log drops info lines above 300 lines/s; the on-screen log is the reliable source.
