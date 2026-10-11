import { toRequest } from '../src/lambda';

describe('toRequest (Lambda function URL, payload 2.0)', () => {
  it('takes the method, path and query parameters', () => {
    expect(
      toRequest({
        rawPath: '/p',
        queryStringParameters: { ad: 'tos-30s', e: 'start' },
        requestContext: { http: { method: 'GET' } },
      }),
    ).toEqual({ method: 'GET', path: '/p', query: { ad: 'tos-30s', e: 'start' } });
  });

  it('works without query parameters', () => {
    expect(toRequest({ rawPath: '/report', requestContext: { http: { method: 'HEAD' } } })).toEqual({
      method: 'HEAD',
      path: '/report',
      query: {},
    });
  });
});
