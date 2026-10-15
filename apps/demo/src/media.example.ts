/**
 * Copy this file to media.local.ts and set the address of tools/demo-ads/serve.mjs,
 * ending with "/". w3cmedia plays plain http media only from hosts listed in the
 * manifest: [network-traffic-policy.cleartext] allowed-domains = ["<host>"].
 */
export const MEDIA_BASE = 'http://your-computer.local:8080/';

/** true mutes every player, content and ads: for device test runs where the TV must stay silent. */
export const MUTED = false;
