import { mirrorHttp } from '../src/mirrorHttp';

const CDN = 'https://cdn.example/';

function fakeFetch() {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve({ status: 200, ok: true, text: () => Promise.resolve(`body of ${url}`) });
  };
  return { fetch: fetch as never, calls };
}

describe('mirrorHttp', () => {
  it('reads VAST, VMAP and WebVTT files of the CDN from the page copy', async () => {
    const { fetch, calls } = fakeFetch();
    const http = mirrorHttp(CDN, 'cdn/', fetch);
    await http.get(`${CDN}vmap/movie.xml`);
    await http.get(`${CDN}captions/kettlo.en.vtt`);
    expect(calls.map((c) => c.url)).toEqual(['cdn/vmap/movie.xml', 'cdn/captions/kettlo.en.vtt']);
  });

  it('drops the query of a mirrored file: the copy is a static file', async () => {
    const { fetch, calls } = fakeFetch();
    const http = mirrorHttp(CDN, 'cdn/', fetch);
    await http.get(`${CDN}vast/pod.xml?breakmaxads=3`);
    expect(calls[0]?.url).toBe('cdn/vast/pod.xml');
  });

  it('requests any other URL as it is', async () => {
    const { fetch, calls } = fakeFetch();
    const http = mirrorHttp(CDN, 'cdn/', fetch);
    await http.get(`${CDN}ads/kettlo_720p.mp4`);
    await http.get('https://ads.example/vast.xml');
    expect(calls.map((c) => c.url)).toEqual([`${CDN}ads/kettlo_720p.mp4`, 'https://ads.example/vast.xml']);
  });

  it('passes the abort signal and returns status, ok and text', async () => {
    const { fetch, calls } = fakeFetch();
    const http = mirrorHttp(CDN, 'cdn/', fetch);
    const signal = new AbortController().signal;
    const response = await http.get(`${CDN}vast/single.xml`, { signal });
    expect(calls[0]?.init).toEqual({ signal });
    expect(response.status).toBe(200);
    expect(response.ok).toBe(true);
    await expect(response.text()).resolves.toBe('body of cdn/vast/single.xml');
  });
});
