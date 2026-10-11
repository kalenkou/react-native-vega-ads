import { DOMParser } from '@xmldom/xmldom';

/**
 * Parses XML with a pure-JS parser (@xmldom/xmldom), so it runs on Vega and Hermes,
 * which have no DOMParser and no native XML module.
 * @returns the document, or null when the text is not well-formed XML
 */
export function parseXml(text: string): Document | null {
  let fatal = false;
  const parser = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: () => {
        fatal = true;
      },
      fatalError: () => {
        fatal = true;
      },
    },
  });
  const doc = parser.parseFromString(text, 'text/xml') as unknown as Document | undefined;
  if (fatal || !doc || !doc.documentElement) {
    return null;
  }
  return doc;
}
