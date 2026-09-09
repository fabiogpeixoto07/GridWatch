# GridWatch authored assets

This directory is the intake boundary for future high-resolution car, material, scenery, UI, effect, and audio sources. Runtime-ready SVG, WebP, PNG, and atlas exports are published to `public/assets` and registered in the versioned asset manifest.

Current legacy SVG sources remain in `public/assets` while their layered production originals are recreated. New work must keep editable sources here, use stable manifest IDs, define camera/view and anchor metadata, and run `npm run assets:sync` after exporting runtime files.

`npm run assets:validate` verifies unique IDs, safe SVG structure, tint-mask compliance, content hashes, byte sizes, view boxes, and exact IIS mirrors.
