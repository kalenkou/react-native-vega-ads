import { GetSegmentDetectionCommand, RekognitionClient, StartSegmentDetectionCommand } from '@aws-sdk/client-rekognition';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { StoragePort } from './cli';
import type { RekognitionPort } from './rekognition';

/*
 * Real AWS adapters. The clients take credentials and the default region from the standard
 * AWS credential chain (environment variables, shared config/credentials files, SSO, instance or task role).
 * Nothing here stores or logs credentials.
 */

export function awsRekognition(region: string | undefined): RekognitionPort {
  const client = new RekognitionClient(region ? { region } : {});
  return {
    startSegmentDetection: (request) => client.send(new StartSegmentDetectionCommand(request)),
    getSegmentDetection: (request) => client.send(new GetSegmentDetectionCommand(request)),
  };
}

export function awsStorage(region: string | undefined): StoragePort {
  const client = new S3Client(region ? { region } : {});
  return {
    putObject: async (request) => {
      await client.send(new PutObjectCommand(request));
    },
  };
}
