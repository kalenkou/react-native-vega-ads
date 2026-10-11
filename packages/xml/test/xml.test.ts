import { installDOMParser, parseXml, xmlToObject } from '../src';

describe('parseXml', () => {
  it('parses a document with namespaces and CDATA', () => {
    const doc = parseXml('<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap"><Ad id="1"><![CDATA[https://a.test/x?a=1&b=2]]></Ad></vmap:VMAP>');
    expect(doc?.documentElement.localName).toBe('VMAP');
    expect(doc?.getElementsByTagName('Ad')[0]?.getAttribute('id')).toBe('1');
    expect(doc?.getElementsByTagName('Ad')[0]?.textContent).toBe('https://a.test/x?a=1&b=2');
  });

  it('returns null for empty input and for text that is not XML', () => {
    expect(parseXml('')).toBeNull();
    expect(parseXml('not xml')).toBeNull();
  });

  // Ad servers send sloppy XML; like xmldom, an unclosed element is closed for you.
  it('repairs an unclosed element instead of failing', () => {
    expect(parseXml('<a><b></a>')?.documentElement.nodeName).toBe('a');
  });
});

describe('installDOMParser', () => {
  it('adds DOMParser and XMLSerializer where the runtime has none (Vega, Hermes)', () => {
    const target: Record<string, unknown> = {};
    expect(installDOMParser(target)).toBe(true);
    const Parser = target.DOMParser as new () => { parseFromString(text: string, type: string): Document };
    const Serializer = target.XMLSerializer as new () => { serializeToString(node: Node): string };
    const doc = new Parser().parseFromString('<a x="1"><b/></a>', 'text/xml');
    expect(doc.documentElement.getAttribute('x')).toBe('1');
    expect(new Serializer().serializeToString(doc)).toBe('<a x="1"><b/></a>');
  });

  it('keeps a DOMParser that the runtime already has', () => {
    const own = class {};
    const target: Record<string, unknown> = { DOMParser: own };
    expect(installDOMParser(target)).toBe(false);
    expect(target.DOMParser).toBe(own);
  });
});

describe('xmlToObject (xml2js-style defaults)', () => {
  it('maps attributes to $, repeated and single children to arrays, and text-only elements to strings', () => {
    const result = xmlToObject('<VAST version="4.2"><Ad id="a"><AdTitle>One</AdTitle></Ad><Ad id="b"><AdTitle>Two</AdTitle></Ad></VAST>');
    expect(result).toEqual({
      VAST: {
        $: { version: '4.2' },
        Ad: [
          { $: { id: 'a' }, AdTitle: ['One'] },
          { $: { id: 'b' }, AdTitle: ['Two'] },
        ],
      },
    });
  });

  it('keeps text next to attributes in _ and trims whitespace between elements', () => {
    const result = xmlToObject('<MediaFile type="video/mp4">\n  <![CDATA[ https://a.test/ad.mp4 ]]>\n</MediaFile>');
    expect(result).toEqual({ MediaFile: { $: { type: 'video/mp4' }, _: 'https://a.test/ad.mp4' } });
  });

  it('returns an empty string for an empty element and null for text that is not XML', () => {
    expect(xmlToObject('<Empty/>')).toEqual({ Empty: '' });
    expect(xmlToObject('not xml')).toBeNull();
  });
});
