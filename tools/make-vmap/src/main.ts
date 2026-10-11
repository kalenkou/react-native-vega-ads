#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { awsRekognition, awsStorage } from './awsPorts';
import { runCli } from './cli';

void runCli(process.argv.slice(2), {
  createPorts: (region) => ({ rekognition: awsRekognition(region), storage: awsStorage(region) }),
  writeFile: (path, text) => writeFile(path, text, 'utf8'),
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
  // The detection filters log to stderr; a feature film logs a few MB.
  runFfmpeg: (args) =>
    new Promise((resolve, reject) => {
      execFile('ffmpeg', args, { maxBuffer: 256 * 1024 * 1024 }, (error, _stdout, stderr) =>
        error ? reject(new Error(`ffmpeg failed: ${error.message}`)) : resolve(stderr),
      );
    }),
}).then((code) => {
  process.exitCode = code;
});
