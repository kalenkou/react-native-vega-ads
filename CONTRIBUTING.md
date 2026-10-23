# Contributing

Issues and pull requests are welcome.

## Setup

You need Node.js 22 and npm 10.

```sh
npm ci
npm run check   # lint, format, types and the tests of the packages and tools
```

The demo app also needs the Vega SDK. It is not a workspace, so its 50 tests run on their own:

```sh
cd apps/demo && npm ci && cp src/media.example.ts src/media.local.ts && npm run use-core && npm test
```

More demo steps: [apps/demo](apps/demo/README.md).

`npm run test:mutation` runs Stryker on `react-native-ads-core`. It makes 3,452 small changes to the code, one at a time, and the tests catch 89 % of them (23.10.2026). Property tests with fast-check feed the VAST, VMAP and WebVTT parsers random input.

## Before a pull request

1. Write a failing test first, then the code.
2. Run `npm run format`, then `npm run check`. CI runs the same check on Node.js 22 and 24.
3. If the change touches playback, run it on a Fire TV device and add the result to [`apps/spike/DEVICE-TESTS.md`](apps/spike/DEVICE-TESTS.md). Failures too.
4. Update the docs and [CHANGELOG.md](CHANGELOG.md) when the API changes.
5. For a change in `packages/core`, run `npm run test:mutation` (about 5 minutes). Stryker changes the code one small step at a time and runs the tests. A change that no test catches shows a gap in the tests. The report is in `packages/core/reports/mutation/index.html`. CI runs it after each change to `packages/core` on `main`.

## Style

- Code: Prettier and ESLint, as configured in this repository.
- Commit messages: one line, `feat|fix|docs|test|chore(scope): what changed`.
- Docs: short sentences in plain English.

Security problems: please report them privately, see [SECURITY.md](SECURITY.md).

Everyone in this project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
