#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  whisper: {
    // whisper-cli writes the JSON to a file; its stdout is a copy of the text.
    runWhisper: (args) =>
      new Promise((resolve, reject) => {
        execFile('whisper-cli', args, { maxBuffer: 64 * 1024 * 1024 }, (error) =>
          error ? reject(new Error(`whisper-cli failed: ${error.message}`)) : resolve(),
        );
      }),
    readFile: (path) => readFile(path, 'utf8'),
    makeTempDir: () => mkdtemp(join(tmpdir(), 'make-vmap-')),
    removeDir: (path) => rm(path, { recursive: true, force: true }),
  },
  vision: {
    // llama.cpp prints its log to stderr and the answer to stdout.
    run: (args) =>
      new Promise((resolve, reject) => {
        execFile('llama-mtmd-cli', args, { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) =>
          error ? reject(new Error(`llama-mtmd-cli failed: ${error.message}`)) : resolve(stdout),
        );
      }),
    makeTempDir: () => mkdtemp(join(tmpdir(), 'make-vmap-context-')),
    removeDir: (path) => rm(path, { recursive: true, force: true }),
  },
}).then((code) => {
  process.exitCode = code;
});
