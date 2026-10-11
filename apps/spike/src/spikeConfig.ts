/**
 * Test switch: the app handles the remote play/pause key itself (like a
 * react-tv-space-navigation RemoteControlManager) instead of Vega media controls.
 * Use only with a manifest WITHOUT the media controls entries, or the key toggles twice.
 */
export const APP_HANDLES_PLAYPAUSE = false;

/**
 * Base URL of tools/demo-ads/serve.mjs on the local network, ending with "/".
 * When set, the hook demo plays the demo movie with the demo ads.
 * w3cmedia refuses plain http media unless the host is in the manifest:
 * [network-traffic-policy.cleartext] allowed-domains = ["<LAN IP>"]
 */
export const DEMO_MEDIA_BASE: string | null = null;
