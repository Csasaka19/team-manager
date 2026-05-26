# Default Design System

Baseline visual conventions for every Forge project. Read before writing UI; reference when a value (spacing, radius, color shade) feels arbitrary.

## Overview

This file defines the *defaults*. Each project's `docs/design-brief.md` overrides anything that needs to be on-brand — fonts, primary color, motion, density. When the brief is silent, fall back to the rules here.

The 4px grid, mobile-first breakpoints, and CSS-variable color model are the same across every project. Spend design judgement on what differentiates the brand; let the rest be muscle memory. If the brief contradicts this file, the brief wins — document the override there so future contributors don't accidentally revert.

## Spacing System

Use a 4px base unit. Tailwind's default scale already lines up: `1 = 0.25rem = 4px`. Pick from this scale, never invent values:

| Tailwind | px | Use for |
|---|---|---|
| `1`, `2` | 4, 8 | Inline gaps inside a component (icon → label, badge → text) |
| `3`, `4` | 12, 16 | Padding inside cards, gap between form rows |
| `6`, `8` | 24, 32 | Section spacing, gap between cards in a list |
| `12`, `16` | 48, 64 | Page margins, hero padding, gap between major page sections |

For containers that scale: `px-4 sm:px-6 lg:px-8`. That's the default page gutter — apply it on every top-level layout wrapper. Internal sections get `py-8` on mobile, `py-12` on tablet, `py-16` on desktop. Don't try to be precise about the in-between; the scale is logarithmic on purpose.

Mobile gets tighter spacing than desktop. A modal that's `p-8` on desktop should be `p-4 sm:p-6 lg:p-8` — generous margins on a 375px viewport eat usable area.

## Typography Scale

Base: `16px` (`1rem`). Never reduce below 14px (`text-sm`) for body content — accessibility floor.

| Class | Size | Use for |
|---|---|---|
| `text-xs` | 12px | Metadata, badges, fine print |
| `text-sm` | 14px | Labels, secondary text, table cells |
| `text-base` | 16px | Body copy |
| `text-lg` | 18px | Lead paragraphs, large body |
| `text-xl` | 20px | Card titles, h4 |
| `text-2xl` | 24px | Section headings, h3 |
| `text-3xl` | 30px | Page headings, h2 |
| `text-4xl` | 36px | Hero headlines, h1 |

Line-height rules:

- **Headings** (`text-2xl` and up): `leading-tight` (1.25). Lets large text breathe without tower-of-airy.
- **Body**: `leading-normal` (1.5). The default.
- **Long-form content** (articles, docs, settings descriptions): `leading-relaxed` (1.75).

Font weight:

- `font-normal` (400) — body copy. Never make body bold; emphasize with shade or weight 500, not 700.
- `font-medium` (500) — labels, button text, secondary headings.
- `font-semibold` (600) — primary headings.
- `font-bold` (700) — emphasis within prose only (the `<strong>` you actually mean). Don't apply to whole headings.

Font stack default (when no brief specifies): `font-sans` falls back to `system-ui, -apple-system, sans-serif` for body. Headings inherit unless the brief sets a display face. Load custom faces via `@fontsource-variable/<name>` — never Google Fonts CDN.

## Color Architecture

Every project defines its palette in CSS variables at the root, with light and dark modes covered from day one. Tailwind's color utilities map to these variables via the shadcn pattern.

Required tokens (extend, never remove):

```
--background          page background
--foreground          primary text on background
--card                card surface
--card-foreground     text on card
--popover             popover/dropdown surface
--popover-foreground  text on popover
--primary             brand action color
--primary-foreground  text on primary
--secondary           secondary surfaces, quiet buttons
--secondary-foreground
--muted               muted surfaces (zebra rows, hover bg)
--muted-foreground    secondary text (timestamps, captions)
--accent              hover bg for interactive items
--accent-foreground
--destructive         danger, errors, delete
--destructive-foreground
--border              dividers, input borders
--input               input border (often = --border)
--ring                focus ring color (often = --primary)
```

Each named color (primary, accent, destructive) also gets a 50–900 shade scale in `tailwind.config` for occasional one-off use (`text-primary-700`, `bg-accent-100`). Default the neutral scale to **slate**, not gray — slate has a slight blue undertone that reads as deliberate rather than muddy.

Theme switch via class on `<html>`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 222 47% 11%;
  --primary-foreground: 0 0% 98%;
}

.dark {
  --background: 222 47% 11%;
  --foreground: 0 0% 98%;
  --primary: 0 0% 98%;
  --primary-foreground: 222 47% 11%;
}
```

Values are space-separated HSL (no `hsl(...)`) so Tailwind can wrap them with opacity: `bg-primary/50`. The same trick works with oklch in Tailwind v4.

Dark mode rule of thumb: invert the shade scale. `bg-white` becomes `bg-slate-900`, `text-slate-900` becomes `text-slate-100`. Don't pick arbitrary dark-mode-only colors unless the brief demands it.

## Component Sizing

| Element | Default | Variants |
|---|---|---|
| Button | `h-9` | `h-8` compact, `h-10` large, `h-11` mobile/touch |
| Input | `h-10` | Match adjacent button height when side-by-side |
| Card | `p-4 rounded-lg` | `p-6` spacious, `p-3` dense |
| Avatar | `h-8 w-8` | `h-6` small, `h-10` large, `h-12` xl |
| Icon (UI) | `h-4 w-4` | `h-5` slightly bigger, `h-6` prominent |

Minimum touch target on mobile: 44×44px (`min-h-11 min-w-11`). Apply to anything tappable — icon buttons, links in long lists, dropdown triggers. If the visual size is smaller, increase hit area with padding while keeping the visual the same.

Border radius scale:

- `rounded` (4px) — badges, tag chips
- `rounded-md` (6px) — inputs, small buttons
- `rounded-lg` (8px) — cards, larger buttons, panels
- `rounded-xl` (12px) — modals, sheets
- `rounded-2xl` (16px) — full-bleed marketing tiles
- `rounded-full` — avatars, pill buttons

Don't mix radii within one component. A card with `rounded-lg` outer and `rounded` inner thumbnails looks fine; a card with `rounded-lg` outer and `rounded-md` inner button looks accidental.

## Responsive Breakpoints

Tailwind defaults are the right answer; don't add custom breakpoints unless the brief insists.

| Prefix | Min width | Mental model |
|---|---|---|
| (none) | 0 | Mobile baseline — design here first |
| `sm:` | 640px | Large phones landscape, small tablets |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Wide displays — usually unnecessary |

Mobile-first means: write base styles for a 375px iPhone, then add `sm:`, `md:`, `lg:` overrides as the viewport grows. Don't start with desktop and reverse with `max-md:` — every project that does ends up with mobile bugs nobody notices.

Container widths follow the same scale. For text-heavy pages, cap content width with `max-w-prose` (~65ch) so lines don't sprawl across a 1440px monitor and become unreadable.

## Shadows and Elevation

Shadows signal depth. Use them sparingly — too much elevation makes everything feel important, which means nothing does.

| Class | Use for |
|---|---|
| (none) | List items, table rows, flat sections |
| `shadow-sm` | Subtle cards, input field on focus |
| `shadow` | Default cards in a grid, dropdowns |
| `shadow-md` | Modals, popovers, command palettes |
| `shadow-lg` | Floating elements (FABs, toasts), tooltips |
| `shadow-xl` | Full-screen overlays, image lightboxes |

In dark mode, shadows do almost nothing visually (dark on dark). Pair shadow with a 1px border (`border border-border`) so depth still reads when the lights are off.

## Common Mistakes

1. **Arbitrary spacing values.** `w-[347px]` shows up in PR reviews — replace with the nearest scale value. The only legitimate arbitrary values are font sizes from the brief or pixel-perfect logo placements.
2. **Mixed radii in one component.** Pick one radius per "group" — card and its primary button can both be `rounded-lg`, or one is `rounded-md`. Not three different.
3. **Skipping dark-mode validation.** Every new color, every new component — check the dark variant before merging. Bake `.dark` test screenshots into PR checklists if anyone forgets.
4. **Opacity for muting text.** `text-black/50` looks fine on white and unreadable on a tinted card. Use a real lighter shade (`text-slate-500`) so it reads on any background.
5. **No `min-h-screen` on layouts.** Short pages show the page background through where the footer should be. Wrap the layout root in `min-h-screen flex flex-col` so footer pins to bottom.
6. **Custom breakpoints.** "We need `tablet-md` between `md` and `lg`" is a smell. The default scale handles 99% of designs.
7. **Loading fonts via Google Fonts `<link>`.** Self-host with `@fontsource-variable`. Avoids a render-blocking third-party request and works offline in dev.
8. **Hardcoded hex colors in components.** `bg-[#FF6600]` breaks themability. Promote it to a CSS variable and reference via Tailwind.

## Checklist

Before merging UI work:

- [ ] All colors defined as CSS variables, not hardcoded hex
- [ ] Dark mode tested on every page
- [ ] Touch targets ≥ 44px on mobile (`min-h-11 min-w-11` on icon buttons)
- [ ] No horizontal scroll at 375px viewport
- [ ] Typography scale used consistently (no arbitrary `text-[15px]`)
- [ ] Spacing uses the 4px grid (no `p-[7px]`, no `mt-[13px]`)
- [ ] Focus state visible on every interactive element
- [ ] Loading, empty, and error states designed (not just the happy path)
