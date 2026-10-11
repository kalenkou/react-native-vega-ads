import type { LinearAd } from './request/VastRequester';

/**
 * The ad's integrated loudness in LUFS (EBU R128 / ITU-R BS.1770), measured when the ad was
 * packaged. VAST 4.x has no field for it, so it comes in a creative extension:
 *
 * ```xml
 * <CreativeExtension type="loudness">
 *   <IntegratedLoudness unit="LUFS">-16.0</IntegratedLoudness>
 * </CreativeExtension>
 * ```
 */
export function adLoudness(linear: LinearAd): number | null {
  const ext = linear.creative.creativeExtensions?.find((e) => e.attributes.type === 'loudness');
  const value = ext?.children.find((child) => child.name === 'IntegratedLoudness')?.value?.trim();
  const lufs = value ? Number(value) : NaN;
  return Number.isFinite(lufs) ? lufs : null;
}

/**
 * The player volume that brings an ad down to the content's loudness: never above 1, so a
 * quieter ad is not made louder (that would only raise its noise and peaks).
 */
export function loudnessGain(adLufs: number, contentLufs: number): number {
  return Math.min(1, Math.round(10 ** ((contentLufs - adLufs) / 20) * 1000) / 1000);
}
