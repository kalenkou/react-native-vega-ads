#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { awsRekognition, awsStorage } from './awsPorts';
import { runCli } from './cli';

void runCli(process.argv.slice(2), {
  createPorts: (region) => ({ rekognition: awsRekognition(region), storage: awsStorage(region) }),
  writeFile: (path, text) => writeFile(path, text, 'utf8'),
  stdout: (text) => process.stdout.write(`${text}\n`),
  stderr: (text) => process.stderr.write(`${text}\n`),
}).then((code) => {
  process.exitCode = code;
});
