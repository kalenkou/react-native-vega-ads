import { isHttpUrl, scheduleFor, tagFromQuery, tagProblem, tagQuery, SAMPLE_TAGS } from '../src/adTag';

describe('isHttpUrl', () => {
  it('accepts http and https URLs only', () => {
    expect(isHttpUrl('https://ads.example/vmap.xml')).toBe(true);
    expect(isHttpUrl('http://localhost:8080/vast.xml')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/xml,<VAST/>')).toBe(false);
    expect(isHttpUrl('ads.example/vmap.xml')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
  });
});

describe('scheduleFor', () => {
  it('reads a VMAP as it is', () => {
    expect(scheduleFor({ kind: 'vmap', url: 'https://ads.example/vmap.xml' })).toEqual({
      vmapUrl: 'https://ads.example/vmap.xml',
    });
  });

  it('plays a VAST tag as a pre-roll', () => {
    expect(scheduleFor({ kind: 'vast', url: 'https://ads.example/vast.xml' })).toEqual({
      breaks: [{ offset: 'start', vastUrl: 'https://ads.example/vast.xml' }],
    });
  });
});

describe('tagFromQuery', () => {
  it('reads ?vmap= and ?vast= from the page address', () => {
    const url = 'https://ads.example/tag?a=1&b=2';
    expect(tagFromQuery(`?vmap=${encodeURIComponent(url)}`)).toEqual({ kind: 'vmap', url });
    expect(tagFromQuery(`?vast=${encodeURIComponent(url)}`)).toEqual({ kind: 'vast', url });
  });

  it('prefers the VMAP when both are given', () => {
    expect(tagFromQuery('?vast=https://a.example/1&vmap=https://b.example/2')).toEqual({
      kind: 'vmap',
      url: 'https://b.example/2',
    });
  });

  it('ignores a missing tag and anything that is not an http URL', () => {
    expect(tagFromQuery('')).toBeNull();
    expect(tagFromQuery('?movie=sintel')).toBeNull();
    expect(tagFromQuery('?vmap=javascript:alert(1)')).toBeNull();
    expect(tagFromQuery('?vast=')).toBeNull();
  });
});

describe('tagQuery', () => {
  it('writes a tag back into a query that tagFromQuery reads', () => {
    const tag = { kind: 'vast' as const, url: 'https://ads.example/tag?a=1&b=[CACHEBUSTING]' };
    const query = tagQuery(tag);
    expect(query.startsWith('?vast=')).toBe(true);
    expect(tagFromQuery(query)).toEqual(tag);
  });
});

describe('SAMPLE_TAGS', () => {
  it('are http URLs of the kind they say', () => {
    for (const tag of Object.values(SAMPLE_TAGS)) {
      expect(isHttpUrl(tag.url)).toBe(true);
      expect(tag.url.includes(tag.kind === 'vmap' ? 'output=vmap' : 'output=vast')).toBe(true);
    }
  });
});

describe('tagProblem', () => {
  it('accepts an https tag on any page and an http tag on an http page', () => {
    expect(tagProblem('https://ads.example/vmap.xml', 'https:')).toBeNull();
    expect(tagProblem('http://ads.example/vmap.xml', 'http:')).toBeNull();
  });

  it('asks for a URL when the text is not one', () => {
    expect(tagProblem('ads.example/vmap.xml', 'https:')).toBe('Enter an http or https URL of a VAST or VMAP tag.');
    expect(tagProblem('', 'http:')).toBe('Enter an http or https URL of a VAST or VMAP tag.');
  });

  it('names the real cause of an http tag on an https page: the browser blocks it as mixed content', () => {
    expect(tagProblem('http://ads.example/vmap.xml', 'https:')).toBe(
      'This page is HTTPS, so the browser blocks an http:// tag. Use the https:// address of the tag.',
    );
    expect(tagProblem('HTTP://ads.example/vmap.xml', 'https:')).not.toBeNull();
  });

  it('allows http on this computer, which browsers do not block', () => {
    expect(tagProblem('http://localhost:8080/vast.xml', 'https:')).toBeNull();
    expect(tagProblem('http://127.0.0.1:8080/vast.xml', 'https:')).toBeNull();
    expect(tagProblem('http://[::1]:8080/vast.xml', 'https:')).toBeNull();
    expect(tagProblem('http://localhost.ads.example/vast.xml', 'https:')).not.toBeNull();
  });
});
