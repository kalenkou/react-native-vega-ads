# Contributing

Issues and pull requests are welcome.

## Setup

You need Node.js 22 and npm 10.

```sh
npm ci
npm run check   # lint, format, types and the tests of the packages and tools
```

The demo app has its own steps: [apps/demo](apps/demo/README.md).

## Before a pull request

1. Write a failing test first, then the code.
2. Run `npm run format`, then `npm run check`. CI runs the same check on Node.js 22 and 24.
3. If the change touches playback, run it on a Fire TV device and add the result to [`apps/spike/DEVICE-TESTS.md`](apps/spike/DEVICE-TESTS.md). Failures too.
4. Update the docs and [CHANGELOG.md](CHANGELOG.md) when the API changes.

## Style

- Code: Prettier and ESLint, as configured in this repository.
- Commit messages: one line, `feat|fix|docs|test|chore(scope): what changed`.
- Docs: short sentences in plain English.

Security problems: please report them privately, see [SECURITY.md](SECURITY.md).
