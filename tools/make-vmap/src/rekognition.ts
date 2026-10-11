import type { Segment } from './segments';

/** Valid `SegmentTypes` values. Some AWS guide examples spell the second one `TECHNICAL_CUES`; the API rejects that. */
export type SegmentType = 'SHOT' | 'TECHNICAL_CUE';

export interface StartSegmentDetectionRequest {
  Video: { S3Object: { Bucket: string; Name: string } };
  SegmentTypes: SegmentType[];
}

export interface GetSegmentDetectionRequest {
  JobId: string;
  MaxResults?: number;
  NextToken?: string;
}

export interface GetSegmentDetectionResponse {
  JobStatus?: string;
  StatusMessage?: string;
  Segments?: Segment[];
  NextToken?: string;
  VideoMetadata?: Array<{ DurationMillis?: number }>;
}

/** The two Amazon Rekognition Video calls this tool needs. Tests use a fake; `awsPorts.ts` has the real one. */
export interface RekognitionPort {
  startSegmentDetection(request: StartSegmentDetectionRequest): Promise<{ JobId?: string }>;
  getSegmentDetection(request: GetSegmentDetectionRequest): Promise<GetSegmentDetectionResponse>;
}

export interface SegmentDetectionOptions {
  /** Waits between status checks. Default: a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Time between status checks. Default 5000 ms. */
  pollIntervalMs?: number;
  /** Gives up after waiting this long in total. Default 2 hours. */
  maxWaitMs?: number;
}

export interface SegmentDetectionResult {
  jobId: string;
  segments: Segment[];
  /** Video length from the job metadata, when Rekognition returns it. */
  durationSeconds: number | undefined;
}

/** The largest page size GetSegmentDetection allows. */
const PAGE_SIZE = 1000;

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs Rekognition segment detection (shots and technical cues) on a video in S3,
 * waits for the job and returns all segments from all result pages.
 */
export async function rekognitionSegments(
  port: RekognitionPort,
  video: { bucket: string; key: string },
  options: SegmentDetectionOptions = {},
): Promise<SegmentDetectionResult> {
  const sleep = options.sleep ?? realSleep;
  const interval = options.pollIntervalMs ?? 5000;
  const maxWait = options.maxWaitMs ?? 2 * 60 * 60 * 1000;

  const { JobId: jobId } = await port.startSegmentDetection({
    Video: { S3Object: { Bucket: video.bucket, Name: video.key } },
    SegmentTypes: ['SHOT', 'TECHNICAL_CUE'],
  });
  if (!jobId) throw new Error('StartSegmentDetection returned no JobId');

  let waited = 0;
  let page = await port.getSegmentDetection({ JobId: jobId, MaxResults: PAGE_SIZE });
  while (page.JobStatus === 'IN_PROGRESS') {
    if (waited + interval > maxWait) {
      throw new Error(`Segment detection job ${jobId} did not finish in ${Math.round(maxWait / 1000)} s`);
    }
    await sleep(interval);
    waited += interval;
    page = await port.getSegmentDetection({ JobId: jobId, MaxResults: PAGE_SIZE });
  }
  if (page.JobStatus === 'FAILED') {
    throw new Error(`Segment detection job ${jobId} failed: ${page.StatusMessage ?? 'no status message'}`);
  }
  if (page.JobStatus !== 'SUCCEEDED') {
    throw new Error(`Segment detection job ${jobId} has an unexpected status ${page.JobStatus ?? '(none)'}`);
  }

  const durationMillis = page.VideoMetadata?.[0]?.DurationMillis;
  const segments: Segment[] = [...(page.Segments ?? [])];
  while (page.NextToken) {
    page = await port.getSegmentDetection({ JobId: jobId, MaxResults: PAGE_SIZE, NextToken: page.NextToken });
    segments.push(...(page.Segments ?? []));
  }

  return {
    jobId,
    segments,
    durationSeconds: durationMillis === undefined ? undefined : durationMillis / 1000,
  };
}
