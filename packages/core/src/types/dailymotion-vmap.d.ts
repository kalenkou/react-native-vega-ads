declare module '@dailymotion/vmap' {
  export interface VMAPAdSource {
    id: string | null;
    allowMultipleAds: string | null;
    followRedirects: string | null;
    vastAdData: Node | null;
    adTagURI: { templateType: string | null; uri: string } | null;
    customData: Node | null;
  }

  export interface VMAPAdBreak {
    timeOffset: string | null;
    breakType: string | null;
    breakId: string | null;
    repeatAfter: string | null;
    adSource: VMAPAdSource | null;
    trackingEvents: Array<{ event: string; uri: string }>;
    track(event: string, errorCode?: number): void;
  }

  export default class VMAP {
    constructor(xml: Document);
    version: string | null;
    adBreaks: VMAPAdBreak[];
  }
}
