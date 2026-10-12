# Amazon requirements for ads on Fire TV / Vega

How `vega-ads` meets the Appstore advertising policy and the Fire TV / Vega test criteria that touch ads. Read on 11.10.2026. Device results are in [`apps/spike/DEVICE-TESTS.md`](../apps/spike/DEVICE-TESTS.md).

Status: **done** – implemented and checked (unit tests, device); **app** – the app's job, the library helps; **open** – not checked yet.

## Advertising policy

Source: [Amazon Appstore advertising policy](https://developer.amazon.com/docs/policy-center/amazon-appstore-advertising.html) (updated 12.03.2026).

| Rule | How vega-ads handles it | Status |
|---|---|---|
| Ad fraud: "Rendering ads that are not visible to the user" | The next ad is prebuffered on a hidden player; its impression is sent only when its surface is on screen | done (tests, device) |
| No ads "triggered by the user attempting to exit the app" | The library starts ads only at scheduled breaks; Home and Back never start one | done |
| Do not delay the user's choice to view content | Every error or timeout ends the ad and resumes the content | done (tests, device) |
| Ads that cannot be closed after 15 s are not allowed, except ads "within video-streaming content" and "during natural pauses" | Linear video ads in breaks fall under the exception; skippable ads show a Skip button | done |
| Ads must not invoke Alexa or mimic system UI | Content of the creatives: the ad server's job | app |
| Fire TV Inventory Optimization (APS, 30 % of impressions above 50,000 h/month in the US) | Not integrated; documented under Known limitations | app |

## Advertising ID and privacy

Sources: [Advertising ID policy](https://developer.amazon.com/docs/policy-center/advertising-id.html), [privacy labels](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html), [children](https://developer.amazon.com/docs/policy-center/privacy-children.html).

| Rule | How vega-ads handles it | Status |
|---|---|---|
| "Precede any call to retrieve the Advertising ID with a call that verifies the user's opt-out choice" | `adIdMacros(vegaAdIdSource(AdIdRetriever))` checks the opt-out first and sends no ID on opt-out or on any error (`LIMITADTRACKING=1`) | done (tests) |
| Without `com.amazon.admanager.service.main` in the manifest the ID service reports "do not track" | In the Quick start manifest | done |
| Privacy labels: data sent by third-party code must be declared | Sent to your ad server and tracking URLs: the ad tag macros you pass (Advertising ID only if the user allows), and the device's IP address and user agent with every request | app |
| No Amazon advertising to children; SDKs must be child-suitable | Do not pass the Advertising ID in child profiles or child-directed parts; use a child-safe ad tag | app |

## Test criteria

Sources: [Fire TV test criteria](https://developer.amazon.com/docs/app-testing/test-criteria.html) (updated 18.09.2026), [Vega: test before submission](https://developer.amazon.com/docs/vega/0.24/test-before-submission) (18.09.2026).

| Test | How vega-ads handles it | Status |
|---|---|---|
| Vega Alexa test, "with both on-demand, Ads and live playback": "After the Alexa card dismisses, audio/video playback in the app should resume correctly" | Fire TV stops the picture with no media event during a voice request; the ad gets 30 s before it counts as stalled, so it resumes and completes | done (device, 11.10.2026) |
| 2.18 Audio focus: "no audio overlap" | One ad sound at a time: the finishing ad is muted when the next one starts early | done (tests, device) |
| Vega Home test: "No audio leaks from app on the Fire TV launcher"; 2.22 exit ≤ 2 s | On background the ad players are released (audio stopped in the first 0.1 s on the device); the content continues on return | done (device) |
| 4.5 Back: no force close, no loop | Back during an ad goes to the app, as during the movie (the demo closes the player); `backDuringAd: 'content'` ends the break and goes on with the movie instead. Back on a pause ad closes it | done (device) |
| 4.6 Media buttons "behave as expected" | Play/pause act on the ad (remote and "Alexa, pause/play"); seek, fast-forward, rewind and speed are blocked during ads | done (device) |
| 2.3 Loading over 15 s must be shown | Ad requests time out after 4 s, a player that is not ready after 8 s or shows no frame in 5 s is skipped | done; worst case with a long wrapper chain not measured |
| 2.19 HDMI input change pauses playback | Not tested with ads | open |
| Vega screensaver test: playback stays paused, no audio over the screensaver | Not tested with ads | open |
| 3.14 Video apps must not enter standby while playing | Player behaviour, not the library's | open |

## Voice

`"Alexa, next"` during an ad is not delivered to the app on Vega OS 2.0, even with `Next` in `command_options` (see [friction log](friction-log.md)). Skippable ads are skipped with the Skip button.
