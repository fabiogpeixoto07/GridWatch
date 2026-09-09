# GridWatch Design Tokens

## Contract

These values are the canonical design vocabulary for menus, race graphics, replays, results, and editors. Implementation may expose them as CSS custom properties or typed theme objects, but component styles consume semantic tokens rather than literal colors, spacing, shadows, or durations.

Dark is the reference theme. Light maps the same semantic names to alternate values. 3D materials and team livery colors are asset data and do not use UI surface tokens.

## Color

| Token | Dark | Light | Usage |
| --- | --- | --- | --- |
| `color.surface.canvas` | `#070A09` | `#EEF3EF` | Page and viewport surround |
| `color.surface.base` | `#0C110F` | `#FFFFFF` | Primary page surface |
| `color.surface.raised` | `#141B18` | `#F5F8F6` | Cards, rails, inspector groups |
| `color.surface.overlay` | `rgba(8, 12, 10, 0.94)` | `rgba(255, 255, 255, 0.96)` | Menus, dialogs, race overlays |
| `color.surface.selected` | `rgba(255, 70, 81, 0.14)` | `rgba(184, 15, 27, 0.10)` | Selected row or tile |
| `color.surface.scrim` | `rgba(0, 0, 0, 0.68)` | `rgba(10, 18, 14, 0.42)` | Modal backdrop |
| `color.text.primary` | `#F4F7F5` | `#16221C` | Headings and primary values |
| `color.text.secondary` | `#AAB5B0` | `#46584F` | Body copy and secondary values |
| `color.text.muted` | `#7F8C86` | `#617168` | Metadata with noncritical meaning |
| `color.text.disabled` | `#59635E` | `#89958F` | Disabled text only |
| `color.text.inverse` | `#07100C` | `#FFFFFF` | Text on filled accent/status controls |
| `color.brand.primary` | `#FF4651` | `#B80F1B` | Brand marker, current selection, primary action |
| `color.brand.hover` | `#FF6570` | `#96101A` | Brand-filled hover |
| `color.brand.pressed` | `#D92835` | `#760B13` | Brand-filled pressed |
| `color.border.subtle` | `rgba(255, 255, 255, 0.09)` | `rgba(22, 34, 28, 0.14)` | Layout separation |
| `color.border.default` | `rgba(255, 255, 255, 0.18)` | `rgba(22, 34, 28, 0.25)` | Control and panel boundary |
| `color.border.strong` | `rgba(255, 255, 255, 0.34)` | `rgba(22, 34, 28, 0.44)` | Emphasis and selected neutral control |
| `color.focus` | `#FF7A83` | `#8F1019` | Keyboard focus ring |
| `color.status.success` | `#58DF91` | `#08763C` | Saved, valid, completed |
| `color.status.warning` | `#FFD45B` | `#795B00` | Caution and recoverable risk |
| `color.status.failure` | `#FF6570` | `#B81724` | Error, invalid, retirement fault |
| `color.status.info` | `#67A7FF` | `#195DAF` | Informational status |
| `color.status.retired` | `#A0AAA5` | `#56635C` | Retired classification |
| `color.timing.personalBest` | `#62E99B` | `#08763C` | Personal-best sector/lap, with `PB` label |
| `color.timing.overallBest` | `#D18AFF` | `#75279F` | Overall-best sector/lap, with `BEST` label |
| `color.timing.leader` | `#F7E06F` | `#685100` | Leader marker, with position label |

`color.brand.primary` is not an error color even though both families are red. Error surfaces always include an error icon/title and use `color.status.failure`. Verify text contrast in the consuming component; muted text is not permitted below 12 px or for required instructions.

## Typography

Production builds bundle the licensed font files and do not depend on a runtime font CDN. Until the font assets land, use the fallbacks in the declared order.

| Token | Value | Usage |
| --- | --- | --- |
| `font.family.display` | `"Barlow Condensed", "Arial Narrow", Arial, sans-serif` | Event names, page titles, result hero values |
| `font.family.interface` | `Inter, "Segoe UI", Arial, sans-serif` | Controls, prose, editor labels |
| `font.family.numeric` | `"Roboto Mono", "SFMono-Regular", Consolas, monospace` | Timing and telemetry; enable tabular numerals |
| `font.weight.regular` | `400` | Body and descriptions |
| `font.weight.medium` | `500` | Controls and metadata |
| `font.weight.semibold` | `600` | Section and row emphasis |
| `font.weight.bold` | `700` | Titles and primary numeric values |

| Token | Size / line height / tracking | Usage |
| --- | --- | --- |
| `font.display.xl` | `64px / 0.92 / -0.035em` | Home hero at standard desktop |
| `font.display.lg` | `48px / 0.96 / -0.025em` | Page and results title |
| `font.display.md` | `32px / 1 / -0.015em` | Dialog and panel hero |
| `font.heading.lg` | `24px / 1.15 / -0.01em` | Major section |
| `font.heading.md` | `18px / 1.25 / 0` | Card and inspector section |
| `font.body.lg` | `16px / 1.55 / 0` | Primary explanatory copy |
| `font.body.md` | `14px / 1.5 / 0` | Default UI and fields |
| `font.body.sm` | `12px / 1.4 / 0.01em` | Secondary metadata |
| `font.label.md` | `12px / 1.2 / 0.12em` | Uppercase section label |
| `font.label.sm` | `11px / 1.2 / 0.10em` | Dense uppercase table label |
| `font.numeric.lg` | `28px / 1 / -0.03em` | Primary race time/lap |
| `font.numeric.md` | `16px / 1.15 / -0.01em` | Timing rows and results |
| `font.numeric.sm` | `12px / 1.2 / 0` | Sector and compact telemetry |

At compact desktop width, `display.xl` becomes 52 px and `display.lg` becomes 40 px. At 130% UI scale, type scales from the 100% base while layouts reflow. Do not achieve fit by truncating page titles, driver codes, positions, or timing values.

## Spacing and layout

| Token | Value |
| --- | --- |
| `space.0` | `0` |
| `space.1` | `4px` |
| `space.2` | `8px` |
| `space.3` | `12px` |
| `space.4` | `16px` |
| `space.5` | `24px` |
| `space.6` | `32px` |
| `space.7` | `40px` |
| `space.8` | `48px` |
| `space.9` | `64px` |

Use 4 px only inside compact indicators. Default control gaps are 8 or 12 px, panel padding is 16 or 24 px, and page gutters are 32 px at 1024–1279, 48 px at 1280–1599, and 64 px at 1600 and above. Maximum noneditor content width is 1440 px. Editor and race viewports may fill available width while retaining safe-zone insets.

| Token | Value | Usage |
| --- | --- | --- |
| `size.control.compact` | `32px` | Dense editor-only toolbar control |
| `size.control.default` | `44px` | Buttons, fields, menu rows |
| `size.control.large` | `52px` | Primary setup action |
| `size.rail.timing` | `320px` | Standard live timing rail |
| `size.rail.library` | `264px` | Standard editor library |
| `size.rail.inspector` | `320px` | Standard editor inspector |
| `size.content.max` | `1440px` | Menu/results content cap |
| `size.dialog.sm` | `440px` | Confirmation and short recovery |
| `size.dialog.md` | `640px` | Forms and import preview |
| `size.dialog.lg` | `960px` | Detailed result/recovery dialog |

## Radius and border

| Token | Value | Usage |
| --- | --- | --- |
| `radius.none` | `0` | Tables and flush viewport edges |
| `radius.xs` | `2px` | Timing markers and swatches |
| `radius.sm` | `4px` | Race graphics and dense controls |
| `radius.md` | `8px` | Fields, buttons, editor groups |
| `radius.lg` | `12px` | Cards and menus |
| `radius.xl` | `16px` | Dialogs and hero panels only |
| `radius.pill` | `999px` | Short status and segmented selection only |
| `border.hairline` | `1px` | Default separation at CSS-pixel scale |
| `border.emphasis` | `2px` | Selected/error emphasis without relying on fill |

## Elevation, blur, and layers

| Token | Value | Usage |
| --- | --- | --- |
| `elevation.0` | `none` | Inline/flush content |
| `elevation.1` | `0 4px 16px rgba(0, 0, 0, 0.22)` | Floating race graphic or menu |
| `elevation.2` | `0 12px 36px rgba(0, 0, 0, 0.30)` | Raised navigation and editor panel |
| `elevation.3` | `0 24px 72px rgba(0, 0, 0, 0.40)` | Modal dialog |
| `blur.overlay` | `16px` | Supported overlay backdrop; pair with opaque fallback |
| `layer.scene` | `0` | 3D canvas |
| `layer.hud` | `100` | Persistent race UI |
| `layer.popover` | `300` | Menu, tooltip, drawer |
| `layer.modal` | `500` | Modal and scrim |
| `layer.critical` | `700` | Renderer/session failure blocking surface |

Light theme uses the same shadows at 45% of the listed alpha. Blur is optional at Low graphics quality and must not be required for separation.

## Motion

| Token | Value | Usage |
| --- | --- | --- |
| `motion.duration.instant` | `0ms` | Direct simulation-driven updates |
| `motion.duration.fast` | `100ms` | Hover, press, selected border |
| `motion.duration.standard` | `180ms` | Menus, drawers, callout entry |
| `motion.duration.emphasis` | `300ms` | Route content and results reveal |
| `motion.duration.cinematic` | `600ms` | Noninteractive introduction/replay dissolve only |
| `motion.ease.standard` | `cubic-bezier(0.2, 0, 0, 1)` | Enter, exit, resize |
| `motion.ease.enter` | `cubic-bezier(0, 0, 0.2, 1)` | Entering content |
| `motion.ease.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exiting content |

Simulation data, live timing numbers, scrubber position, and direct manipulation are not eased. Do not use bounce or elastic curves. Under Reduced Motion, translate/scale/parallax/camera-shake transitions become opacity-only at `100ms` or direct cuts; loading state uses a static progress treatment with text updates.

## Interaction states

- **Default:** base surface, default border, primary or secondary text.
- **Hover:** raise border contrast and adjust filled action color; do not reveal required information only on hover.
- **Pressed:** use pressed color and at most 1 px visual translation; layout dimensions remain stable.
- **Selected/current:** selected surface plus a 2 px brand or neutral-strong marker and an accessible selected state.
- **Focus-visible:** `0 0 0 2px color.surface.canvas, 0 0 0 4px color.focus`; focus remains visible over scenes and both themes.
- **Disabled:** no elevation, disabled text, 55% overall opacity; preserve the explanatory label and expose the reason nearby when necessary.
- **Error:** failure border/icon/title and associated plain-language message; preserve user input.
- **Loading:** preserve dimensions, mark the region busy, and use text or determinate progress when a stage is measurable.

All token reviews must include Dark, Light, Reduced Motion, each UI scale, keyboard focus, 200% browser text zoom, and bright/dark circuit backgrounds.
