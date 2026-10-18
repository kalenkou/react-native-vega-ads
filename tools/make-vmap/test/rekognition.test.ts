import {
  GetSegmentDetectionRequest,
  GetSegmentDetectionResponse,
  RekognitionPort,
  rekognitionSegments,
  StartSegmentDetectionRequest,
} from '../src/rekognition';
import { cue, shot } from './helpers';

class FakeRekognition implements RekognitionPort {
  readonly starts: StartSegmentDetectionRequest[] = [];
  readonly gets: GetSegmentDetectionRequest[] = [];

  constructor(
    private readonly pages: GetSegmentDetectionResponse[],
    private readonly jobId: string | null = 'job-1',
  ) {}

  startSegmentDetection(request: StartSegmentDetectionRequest): Promise<{ JobId?: string }> {
    this.starts.push(request);
    return Promise.resolve(this.jobId === null ? {} : { JobId: this.jobId });
  }

  getSegmentDetection(request: GetSegmentDetectionRequest): Promise<GetSegmentDetectionResponse> {
    this.gets.push(request);
    const page = this.pages.shift();
    return page ? Promise.resolve(page) : Promise.reject(new Error('no more scripted pages'));
  }
}

function recordingSleep() {
  const waits: number[] = [];
  return { waits, sleep: (ms: number) => (waits.push(ms), Promise.resolve()) };
}

const VIDEO = { bucket: 'media-bucket', key: 'movies/trailer.mp4' };

describe('rekognitionSegments', () => {
  it('starts SHOT and TECHNICAL_CUE detection for the S3 object', async () => {
    const port = new FakeRekognition([{ JobStatus: 'SUCCEEDED', Segments: [] }]);
    await rekognitionSegments(port, VIDEO, { sleep: recordingSleep().sleep });
    expect(port.starts).toEqual([
      {
        Video: { S3Object: { Bucket: 'media-bucket', Name: 'movies/trailer.mp4' } },
        SegmentTypes: ['SHOT', 'TECHNICAL_CUE'],
      },
    ]);
  });

  it('polls while the job is in progress, then reads every page', async () => {
    const port = new FakeRekognition([
      { JobStatus: 'IN_PROGRESS' },
      { JobStatus: 'IN_PROGRESS' },
      {
        JobStatus: 'SUCCEEDED',
        Segments: [cue('BlackFrames', 0, 1)],
        NextToken: 'page-2',
        VideoMetadata: [{ DurationMillis: 600_000 }],
      },
      { JobStatus: 'SUCCEEDED', Segments: [shot(0, 300)], NextToken: 'page-3' },
      { JobStatus: 'SUCCEEDED', Segments: [shot(300, 600)] },
    ]);
    const { waits, sleep } = recordingSleep();

    const result = await rekognitionSegments(port, VIDEO, { sleep, pollIntervalMs: 2000 });

    expect(waits).toEqual([2000, 2000]);
    expect(port.gets).toEqual([
      { JobId: 'job-1', MaxResults: 1000 },
      { JobId: 'job-1', MaxResults: 1000 },
      { JobId: 'job-1', MaxResults: 1000 },
      { JobId: 'job-1', MaxResults: 1000, NextToken: 'page-2' },
      { JobId: 'job-1', MaxResults: 1000, NextToken: 'page-3' },
    ]);
    expect(result).toEqual({
      jobId: 'job-1',
      segments: [cue('BlackFrames', 0, 1), shot(0, 300), shot(300, 600)],
      durationSeconds: 600,
    });
  });

  it('reports no duration when the response has no video metadata', async () => {
    const port = new FakeRekognition([{ JobStatus: 'SUCCEEDED' }]);
    const result = await rekognitionSegments(port, VIDEO, { sleep: recordingSleep().sleep });
    expect(result).toEqual({ jobId: 'job-1', segments: [], durationSeconds: undefined });
  });

  it('fails with the status message when the job fails', async () => {
    const port = new FakeRekognition([
      { JobStatus: 'IN_PROGRESS' },
      { JobStatus: 'FAILED', StatusMessage: 'Unsupported codec' },
    ]);
    await expect(rekognitionSegments(port, VIDEO, { sleep: recordingSleep().sleep })).rejects.toThrow(
      'Segment detection job job-1 failed: Unsupported codec',
    );
  });

  it('fails when the job does not finish in time', async () => {
    const port = new FakeRekognition(Array.from({ length: 10 }, () => ({ JobStatus: 'IN_PROGRESS' })));
    const { waits, sleep } = recordingSleep();
    await expect(rekognitionSegments(port, VIDEO, { sleep, pollIntervalMs: 1000, maxWaitMs: 3000 })).rejects.toThrow(
      /did not finish in 3 s/,
    );
    expect(waits).toEqual([1000, 1000, 1000]);
  });

  it('fails when the service returns no job id or an unknown status', async () => {
    await expect(rekognitionSegments(new FakeRekognition([], null), VIDEO)).rejects.toThrow(/no JobId/);
    await expect(
      rekognitionSegments(new FakeRekognition([{ JobStatus: 'PAUSED' }]), VIDEO, { sleep: recordingSleep().sleep }),
    ).rejects.toThrow(/unexpected status PAUSED/);
  });

  it('waits with a real timer by default', async () => {
    const port = new FakeRekognition([{ JobStatus: 'IN_PROGRESS' }, { JobStatus: 'SUCCEEDED' }]);
    await expect(rekognitionSegments(port, VIDEO, { pollIntervalMs: 1 })).resolves.toMatchObject({ segments: [] });
  });
});
