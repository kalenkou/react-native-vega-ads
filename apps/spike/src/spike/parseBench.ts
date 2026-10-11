import {VASTParser} from '@dailymotion/vast-client';
import {parseXml} from 'react-native-ads-core';
import {log} from './log';
import {SINGLE_INLINE_TAG} from './ads';

const RUNS = 30;

function stats(samples: number[]): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return (
    `median ${at(0.5).toFixed(1)} ms, p95 ${at(0.95).toFixed(1)} ms, ` +
    `min ${sorted[0].toFixed(1)}, max ${sorted[sorted.length - 1].toFixed(1)}`
  );
}

function now(): number {
  const perf = (globalThis as {performance?: {now(): number}}).performance;
  return perf ? perf.now() : Date.now();
}

/**
 * Device check: how long the pure-JS XML path takes on the stick.
 * Fetches one real VAST response, then parses it RUNS times without network:
 * (1) XML text -> DOM with @xmldom/xmldom, (2) DOM -> VAST model with vast-client.
 */
export async function runParseBench(): Promise<void> {
  const response = await fetch(
    SINGLE_INLINE_TAG.replace('[CACHEBUSTING]', String(Date.now())),
  );
  const xml = await response.text();
  log(`xml bench: VAST ${(xml.length / 1024).toFixed(1)} KB, ${RUNS} runs`);

  const domTimes: number[] = [];
  const modelTimes: number[] = [];
  const parser = new VASTParser();
  for (let i = 0; i < RUNS; i++) {
    const t0 = now();
    const doc = parseXml(xml);
    const t1 = now();
    if (!doc) {
      log('xml bench: parse failed');
      return;
    }
    await parser.parseVAST(doc as never);
    const t2 = now();
    domTimes.push(t1 - t0);
    modelTimes.push(t2 - t1);
  }
  log(`xml bench: xmldom text->DOM ${stats(domTimes)}`);
  log(`xml bench: vast-client DOM->model ${stats(modelTimes)}`);
  log(
    `xml bench: first run ${domTimes[0].toFixed(1)} + ${modelTimes[0].toFixed(
      1,
    )} ms`,
  );
}
