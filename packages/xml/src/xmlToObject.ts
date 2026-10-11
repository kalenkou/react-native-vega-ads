import { parseXml } from './parseXml';

/** An element as xml2js returns it by default. */
export type XmlValue = string | XmlObject;
export interface XmlObject {
  /** Attributes. */
  $?: Record<string, string>;
  /** Text of an element that also has attributes or child elements. */
  _?: string;
  [child: string]: XmlValue[] | Record<string, string> | string | undefined;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

function convert(element: Element): XmlValue {
  const result: XmlObject = {};
  let text = '';
  for (let i = 0; i < element.attributes.length; i++) {
    const attribute = element.attributes.item(i);
    if (attribute) {
      result.$ = { ...result.$, [attribute.name]: attribute.value };
    }
  }
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === ELEMENT_NODE) {
      const child = node as Element;
      const list = (result[child.nodeName] as XmlValue[] | undefined) ?? [];
      list.push(convert(child));
      result[child.nodeName] = list;
    } else if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE) {
      text += node.nodeValue ?? '';
    }
  }
  text = text.trim();
  if (Object.keys(result).length === 0) {
    return text;
  }
  if (text) {
    result._ = text;
  }
  return result;
}

/**
 * XML to plain objects with xml2js's default shape: attributes in `$`, child elements in
 * arrays by name, text-only elements as strings, mixed text in `_`. For apps that used
 * xml2js, which needs Node built-ins that React Native on Vega does not have.
 * @returns `{ rootName: value }`, or null when the text is not well-formed XML
 */
export function xmlToObject(text: string): Record<string, XmlValue> | null {
  const doc = parseXml(text);
  if (!doc) {
    return null;
  }
  const root = doc.documentElement;
  return { [root.nodeName]: convert(root) };
}
