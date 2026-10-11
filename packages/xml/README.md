# react-native-vega-xml

XML for React Native on Amazon Vega OS, and for any runtime without `DOMParser` (Hermes). Pure JavaScript, no native module.

Part of [react-native-vega-ads](https://github.com/kalenkou/vega-ads).

## Why

Vega has no `DOMParser`, and XML packages that need native code or Node built-ins (`react-native-xml2js`, `xml2js`) do not run there. Developers asked for an XML parser on the Amazon forum ([t/20419](https://community.amazondeveloper.com/t/20419)): "Dealing with ads these days usually means working with VAST XML data". This package wraps `@xmldom/xmldom` and is tested on a Fire TV Stick (Vega OS 2.0): a 34.4 KB VAST document parses in about 60 ms in a Release build.

## Use

```ts
import { installDOMParser, parseXml, xmlToObject } from 'react-native-vega-xml';

// 1. A DOM, like the browser's DOMParser. Null if the text is not XML.
const doc = parseXml('<VAST version="4.2"><Ad id="1"/></VAST>');
doc?.getElementsByTagName('Ad')[0]?.getAttribute('id'); // '1'

// 2. Plain objects in the xml2js default shape.
xmlToObject('<VAST version="4.2"><Ad id="1"><AdTitle>One</AdTitle></Ad></VAST>');
// { VAST: { $: { version: '4.2' }, Ad: [{ $: { id: '1' }, AdTitle: ['One'] }] } }

// 3. Global DOMParser and XMLSerializer for libraries that expect them.
installDOMParser(); // false if the runtime already has a DOMParser
```

| Export | What it does |
|---|---|
| `parseXml(text)` | `Document`, or `null` for empty input or text that is not XML. Like xmldom, an unclosed element is closed for you, because ad servers send sloppy XML |
| `xmlToObject(text)` | xml2js-style object: attributes in `$`, child elements in arrays, text-only elements as strings, mixed text in `_` |
| `installDOMParser(target?)` | adds `DOMParser` and `XMLSerializer` to `globalThis` when missing |

## License

Apache-2.0
