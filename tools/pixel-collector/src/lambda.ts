import type { HttpRequest } from './collector';

/** The part of a Lambda function URL event (payload format 2.0) that the collector reads. */
export interface FunctionUrlEvent {
  rawPath: string;
  queryStringParameters?: Record<string, string | undefined>;
  requestContext: { http: { method: string } };
}

export function toRequest(event: FunctionUrlEvent): HttpRequest {
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: event.queryStringParameters ?? {},
  };
}
