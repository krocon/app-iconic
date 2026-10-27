# Test fixtures

Copied unchanged from the legacy app (`AppIconic/docs/`, Marc Kronberg, 26.10.2026).

- `svg/*.svg` – SVGs the legacy editor was tested with: basic elements (`demo-elemente*.svg`), nested and
  transformed groups (`nested_g*.svg`), paths (`some_pathes.svg`), real logos (`logo-*.svg`, `logo-artv.svg` ≈ 100 KB),
  a canvas that is not 1024 × 1024 (`_1014x1024_demo.svg`).
- `camscanner.icon/` – a real Icon Composer bundle: `icon.json` (two groups, shadow, translucency,
  supported platforms) + two SVG assets with spaces in their names.

Every fixture must import, render (snapshot) and round-trip without loss (prompt 002 / 004).
Do not edit these files; add new fixtures next to them.

Added for prompt 010 (written by hand, not from the legacy app):

- `all-fields.icon/` – every `icon.json` field documented in `prompts/done/010-icon-eigenschaften.design.md`
  (fills incl. orientation and specializations with `appearance`/`idiom`, group and layer fields, platform list)
  plus unknown `x-future-*` keys on every level; formatted like Icon Composer (sorted keys, empty list as
  `[\n\n  ]`). One SVG asset.
