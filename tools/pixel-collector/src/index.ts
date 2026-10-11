import { handle, HttpResult } from './collector';
import { dynamoCounters } from './dynamo';
import { FunctionUrlEvent, toRequest } from './lambda';

let counters: ReturnType<typeof dynamoCounters> | null = null;

/** Lambda entry point. TABLE_NAME comes from the function's environment (see template.yaml). */
export async function handler(event: FunctionUrlEvent): Promise<HttpResult> {
  counters ??= dynamoCounters(process.env.TABLE_NAME ?? '');
  return handle(toRequest(event), { counters, now: Date.now });
}
