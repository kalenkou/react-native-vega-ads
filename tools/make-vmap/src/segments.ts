/**
 * The parts of an Amazon Rekognition `SegmentDetection` record that this tool reads.
 * The AWS SDK output type is structurally compatible with it.
 */
export interface Segment {
  Type?: string;
  StartTimestampMillis?: number;
  EndTimestampMillis?: number;
  ShotSegment?: { Confidence?: number; Index?: number };
  TechnicalCueSegment?: { Confidence?: number; Type?: string };
}
