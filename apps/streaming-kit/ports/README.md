# Vega ports

The three Vega ports are open pull requests, not on npm yet. `package.json` installs them from
packed files in this folder. The `.tgz` files are not committed.

| Packed file | Pull request | Branch | Folder to pack |
|---|---|---|---|
| `react-native-video-7.0.0-beta.12.tgz` | [react-native-video #5171](https://github.com/TheWidlarzGroup/react-native-video/pull/5171) | `kalenkou/react-native-video` `feat/vega-backend` | `packages/react-native-video` |
| `react-native-community-slider-5.2.1.tgz` | [react-native-slider #839](https://github.com/callstack/react-native-slider/pull/839) | `kalenkou/react-native-slider` `feat/vega-support` | `package` |
| `react-native-bootsplash-7.3.4.tgz` | [react-native-bootsplash #808](https://github.com/zoontek/react-native-bootsplash/pull/808) | `kalenkou/react-native-bootsplash` `feat/vega-support` | the repository root |

For each one:

1. Clone the branch and install it with the repository's own package manager: bun for
   react-native-video, npm for the slider, yarn for bootsplash.
2. Build the package: `bun run build` (react-native-video), `npm run prepare` (slider),
   `yarn build` (bootsplash).
3. In the folder from the table, run `npm pack --ignore-scripts --pack-destination <this folder>`.

The file names must match the table. They are the names in `package.json`.
