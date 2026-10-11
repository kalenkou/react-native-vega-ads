import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

/**
 * Adds `DOMParser` and `XMLSerializer` to the global scope when the runtime has none,
 * for libraries that expect browser XML APIs.
 * @returns true when they were added, false when the runtime already had a DOMParser
 */
export function installDOMParser(target: Record<string, unknown> = globalThis as never): boolean {
  if (typeof target.DOMParser === 'function') {
    return false;
  }
  target.DOMParser = DOMParser;
  if (typeof target.XMLSerializer !== 'function') {
    target.XMLSerializer = XMLSerializer;
  }
  return true;
}
