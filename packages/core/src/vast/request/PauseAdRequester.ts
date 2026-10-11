import type { VASTClient } from '@dailymotion/vast-client';
import type { AdSourceRef, VastAd, VastExtension as Extension } from './types';
import { loadVast, TRAFFICKING_ERROR, VastRequestDeps, VastResult } from './VastRequester';

/** The NonLinear image of a pause ad, as vast-client parses it. */
interface NonLinearVariation {
  width: string | number | null;
  height: string | number | null;
  type: string | number | null;
  staticResource: string | null;
  nonlinearClickThroughURLTemplate: string | null;
}

interface NonLinearCreative {
  type: 'nonlinear';
  variations: NonLinearVariation[];
  creativeExtensions?: Extension[];
}

/**
 * A pause ad (IAB CTV Ad Portfolio): an image the viewer sees after pausing the content
 * themselves. It comes as a VAST `<NonLinear>` with a `<StaticResource>` image; a QR code
 * may come in the `tl_qrcode` creative extension.
 */
export interface PauseAd {
  ad: VastAd;
  creative: NonLinearCreative;
  variation: NonLinearVariation;
  imageUrl: string;
  width: number;
  height: number;
  clickThroughUrl: string | null;
  /** `tl_qrcode`: the page the QR code opens and, when the ad server drew it, its image. */
  qr: { scanUrl: string; imageUrl: string | null } | null;
  client: VASTClient;
}

export type PauseAdResult =
  | { status: 'ok'; ad: PauseAd }
  | { status: 'empty'; errorCodes: number[] }
  | Extract<VastResult, { status: 'failed' }>;

const childText = (ext: Extension, name: string): string | null =>
  ext.children.find((child) => child.name === name)?.value?.trim() || null;

function qrCode(creative: NonLinearCreative): PauseAd['qr'] {
  const ext = creative.creativeExtensions?.find((e) => e.attributes.type === 'tl_qrcode');
  const scanUrl = ext ? childText(ext, 'QrCodeScanUrl') : null;
  return ext && scanUrl ? { scanUrl, imageUrl: childText(ext, 'QrCodeImageUrl') } : null;
}

function imageOf(creative: { type: string }): { creative: NonLinearCreative; variation: NonLinearVariation } | null {
  if (creative.type !== 'nonlinear') {
    return null;
  }
  const nonLinear = creative as NonLinearCreative;
  const variation = nonLinear.variations.find(
    (v) => typeof v.type === 'string' && v.type.startsWith('image/') && !!v.staticResource?.trim(),
  );
  return variation ? { creative: nonLinear, variation } : null;
}

/** Requests a pause ad: the first ad of the answer with a NonLinear image. */
export async function requestPauseAd(source: string | AdSourceRef, deps: VastRequestDeps): Promise<PauseAdResult> {
  const loaded = await loadVast(source, deps);
  if ('status' in loaded) {
    return loaded;
  }
  for (const ad of loaded.ads) {
    const found = ad.creatives.map(imageOf).find((x) => x !== null);
    if (!found) {
      loaded.trackError(ad, TRAFFICKING_ERROR);
      continue;
    }
    const { creative, variation } = found;
    return {
      status: 'ok',
      ad: {
        ad,
        creative,
        variation,
        imageUrl: (variation.staticResource as string).trim(),
        width: Number(variation.width) || 0,
        height: Number(variation.height) || 0,
        clickThroughUrl: variation.nonlinearClickThroughURLTemplate?.trim() || null,
        qr: qrCode(creative),
        client: loaded.client,
      },
    };
  }
  return { status: 'empty', errorCodes: [...new Set(loaded.errorCodes)] };
}
