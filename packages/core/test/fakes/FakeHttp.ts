import type { HttpPort, HttpRequestOptions, HttpResponse } from '../../src/ports';

type Rule =
  | { kind: 'answer'; status: number; body: string }
  | { kind: 'hang' }
  | { kind: 'fail' };

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

export class FakeHttp implements HttpPort {
  readonly requests: string[] = [];
  private rules = new Map<string, Rule>();

  on(url: string, answer: { status?: number; body: string }): this {
    this.rules.set(url, { kind: 'answer', status: answer.status ?? 200, body: answer.body });
    return this;
  }

  hang(url: string): this {
    this.rules.set(url, { kind: 'hang' });
    return this;
  }

  fail(url: string): this {
    this.rules.set(url, { kind: 'fail' });
    return this;
  }

  get(url: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    this.requests.push(url);
    const rule = this.rules.get(url) ?? { kind: 'answer', status: 404, body: '' };
    if (rule.kind === 'fail') {
      return Promise.reject(new TypeError('network request failed'));
    }
    if (rule.kind === 'hang') {
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => reject(abortError()));
      });
    }
    return Promise.resolve({
      status: rule.status,
      ok: rule.status >= 200 && rule.status < 300,
      text: () => Promise.resolve(rule.body),
    });
  }
}
