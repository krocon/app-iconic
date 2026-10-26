# AppIconic

<img src="public/icon.svg" width="96" alt="AppIconic icon" align="right" />

A desktop editor for app icons in Apple's **`.icon`** format (Icon Composer): groups and layers of SVG artwork,
background fills, shadows and translucency, with export to SVG and PNG – for macOS, Windows and Linux.

Built with **Tauri 2 + Angular 22 (zoneless, Signals) + Rust**. The SVG document lives in the WebView's DOM (the
browser renders, parses and measures); Rust handles files, `.icon` bundles and ZIP, PNG export and fonts.

> Status: early development – see [prompts/README.md](prompts/README.md) for the roadmap and
> [docs/FEATURES.md](docs/FEATURES.md) for the feature checklist.

## Development

Requirements: Node ≥ 22.22.3, pnpm 10, Rust stable ≥ 1.93, and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) of your OS.

```sh
pnpm install
pnpm tauri dev      # app with hot reload (dev server on port 1450)
pnpm start          # frontend only, in the browser (fake backend with a sample .icon in memory)
pnpm test           # unit tests (Vitest)
pnpm e2e            # end-to-end tests (Playwright; once: pnpm e2e:install)
pnpm check          # format, lint, tests, build, cargo fmt/clippy/test
pnpm tauri build    # release bundle
```

Architecture and decisions: [docs/architecture.md](docs/architecture.md). Rules for contributors (and Claude):
[CLAUDE.md](CLAUDE.md).

## License

MIT © 2026 Marc Kronberg
