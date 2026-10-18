# Why react-native-vega-ads

Vega apps have no ready, open way to play VAST/VMAP ads:

- **No client-side IMA SDK on Vega.** Amazon's [supported libraries](https://developer.amazon.com/docs/vega-api/0.24/supported-libraries.html) list Google IMA DAI, Yospace, FreeWheel and TrueX: server-side insertion or partner services, mostly on request. There is no client-side VAST/VMAP SDK. Amazon's CSAI guide shows how to switch between two `VideoPlayer` instances. Ad requests, VAST/VMAP, tracking, pods, skip and error handling are left to each app ("App-specific logic"). See [Client-side ad insertion overview](https://developer.amazon.com/docs/vega/0.24/client-side-ad-insertion-overview-vega.html).
- **Player vendors do not cover it.** The Bitmovin Vega sample states: "No client-side ad support, due to the lack of video element reusability on Vega OS" ([sample README](https://github.com/bitmovin/bitmovin-player-web-sample-fire-tv-vega)).
- **The options that exist are closed.** FreeWheel's Vega AdManager is a beta for FreeWheel customers only ([forum t/5679](https://community.amazondeveloper.com/t/5679)). Logituit Logix Ads Manager runs the IMA HTML5 SDK inside a WebView, VOD only ([forum t/7536](https://community.amazondeveloper.com/t/7536)). Dolby OptiView for Vega uses the same Logix IMA integration, and its sample notes: "Skippable ads are not supported" ([OptiView Vega sample, ads.md](https://github.com/THEOplayer/react-native-optiview-vega-sample/blob/main/doc/ads.md)).
- **Developers ask for it.** "Dealing with ads these days usually means working with VAST XML data" ([forum t/20419](https://community.amazondeveloper.com/t/20419), 25.09.2025).

## Options on Vega today

| | react-native-vega-ads | Logix Ads Manager | Dolby OptiView Vega | FreeWheel AdManager |
|---|---|---|---|---|
| How ads are played | native w3cmedia players | IMA HTML5 SDK in a WebView | through the Logix IMA integration | FreeWheel SDK (beta) |
| Your own VAST/VMAP server | yes | through Google Ad Manager | through Google Ad Manager | FreeWheel ad server |
| Skippable ads | yes, Skip with D-pad focus | not supported in the integration the OptiView sample uses | "not supported" in the sample | not stated |
| Remote and Alexa during ads | yes (media controls) | upstream 0.3.0: the hidden ad WebView can keep remote focus after the break ([Dolby's patch notes](https://github.com/THEOplayer/react-native-optiview-vega-sample/blob/main/lib/LOGIX_AD_MANAGER_PATCH.md)) | yes, with Dolby's patched Logix build (React Native 0.83) | not stated |
| Licence and access | Apache-2.0, open | commercial | commercial | beta, FreeWheel customers |

Sources are in the list above. "Not stated" means the public pages do not say. If you need Google Ad Manager features (programmatic demand, Open Measurement), an IMA-based option fits better. `react-native-vega-ads` fits when you serve your own VAST/VMAP.

## Moving from react-native-video

On iOS and Android, `react-native-video` plays IMA ads. On Vega there is no official port. The community port [react-native-video-vega](https://github.com/TheWidlarzGroup/react-native-video-vega) (MIT) plays a URL and keeps the ad prop types, but has no ad playback. Amazon's [multi-TV sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample) uses separate `.vega.tsx` player files on w3cmedia. `react-native-vega-ads` adds VAST/VMAP ads to that w3cmedia player: keep your `adTagUrl` (a VMAP tag) and pass it as `source: { vmapUrl }`.
