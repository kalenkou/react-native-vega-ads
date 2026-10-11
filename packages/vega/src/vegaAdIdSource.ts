import type { AdIdSource } from '@vega-ads/core';

/** The part of `AdIdRetriever` from @amazon-devices/kepler-adid-retriever that is used. */
export interface VegaAdIdRetriever {
  isAdvertisingTrackingEnabled(): boolean;
  fetchAdvertisingId(): string;
}

/**
 * The Fire TV advertising ID for `adIdMacros()`:
 * `macros: adIdMacros(vegaAdIdSource(AdIdRetriever))`. The user's opt-out of interest-based
 * ads, or a failing ID service, sends no ID and `LIMITADTRACKING=1`. Needs the
 * `com.amazon.admanager.service.main` service in the manifest.
 */
export function vegaAdIdSource(retriever: VegaAdIdRetriever): AdIdSource {
  return {
    isTrackingEnabled: () => retriever.isAdvertisingTrackingEnabled(),
    fetchId: () => retriever.fetchAdvertisingId(),
  };
}
