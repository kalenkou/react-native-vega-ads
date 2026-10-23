# Security

## Reporting a vulnerability

Please report security problems privately through GitHub: the repository's **Security** tab → **Report a vulnerability**. Do not open a public issue for them.

Include the package and version, what an attacker can do and the steps to reproduce. I aim to answer within 7 days.

## Supported versions

The project is at 0.x. Fixes go into the latest release only.

## Dependencies

- What the packages install for your app: `@dailymotion/vast-client`, `@dailymotion/vmap` and `@xmldom/xmldom`. CI runs `npm audit --omit=dev` on every push to main and every pull request, and fails on any known vulnerability in them.
- `npm audit` without `--omit=dev` also lists the development tools (Jest and the React Native 0.72 and 0.83 toolchains that Vega apps build with). They are not shipped in the packages. Some of their advisories have no fixed version yet.
- The Dependabot alerts on this repository come from the same tools in the lockfiles of the example apps (`apps/demo`, `apps/spike`) and of the workspace. One example: Amazon's `@amazon-devices/kepler-a11y-settings-interface-turbo` installs `react-native-tscodegen-types`, which brings its own React Native 0.60.6.
- Ad responses are untrusted input. VAST and VMAP are parsed with a pure-JS XML parser, without `eval` or a WebView. Media and tracking URLs from an ad server are requested as given. Serve your ad tags over HTTPS.
