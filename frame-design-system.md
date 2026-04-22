# FRAME Design System

Extracted from codebase on 2026-04-22. Use this file to replicate FRAME's visual style in other apps.

---

## 1. Color Tokens

All values are sourced directly from `tailwind.config.js` and `index.css`.

### Surface (backgrounds)

| Token | Hex | Usage |
|---|---|---|
| `surface-950` | `#09090d` | Page background, darkest base (`body`) |
| `surface-900` | `#111117` | Scrollbar track |
| `surface-800` | `#18181f` | Card backgrounds, panel backgrounds |
| `surface-700` | `#1f1f29` | Input areas, icon containers, hover fills |
| `surface-600` | *(no token — used inline)* | Secondary button hover, audio trim panel |
| `surface-500` | *(no token — used inline)* | Secondary button active hover |

> **Note:** `surface-600` and `surface-500` are referenced in JSX (`bg-surface-600`, `bg-surface-500`) but are not defined in the Tailwind config — they are missing tokens. Closest fix: add them as `#2a2a36` and `#35354a` respectively.

### Border

| Token | Hex | Usage |
|---|---|---|
| `border` (DEFAULT) | `#27272f` | All component borders, dividers |
| `border-light` | `#35353f` | Hover border state, scrollbar thumb |

### Accent (purple brand color)

| Token | Value | Usage |
|---|---|---|
| `accent` (DEFAULT) | `#7c3aed` | Primary buttons, active states, spinner border-top, shimmer bar base, scrollbar thumb hover |
| `accent-hover` | `#6d28d9` | Primary button hover |
| `accent-muted` | `rgba(124,58,237,0.18)` | Badge backgrounds, drop zone icon container (drag state), audio row (active state) |
| `accent-glow` | `rgba(124,58,237,0.35)` | `pulse-glow` keyframe max shadow |

### Ink (text)

| Token | Hex | Usage |
|---|---|---|
| `ink` (DEFAULT) | `#f0f0f5` | Primary text, headings, active labels |
| `ink-muted` | `#7070a0` | Secondary text, placeholders, icon color at rest |
| `ink-dim` | `#44445a` | Tertiary text, disabled hints, timestamps, small labels |

### Semantic / one-off colors

| Value | Usage |
|---|---|
| `#09090d` | Body background (matches `surface-950`) |
| `rgba(124,58,237,0.4)` / `rgba(124,58,237,0.9)` | Drop zone border-dance animation keyframes |
| `rgba(124,58,237,0.06)` | Drop zone active background |
| `rgba(124,58,237,0.25)` | Spinner ring base color |
| `rgba(139,92,246,0.88)` | Waveform bar — selected region |
| `rgba(139,92,246,0.22)` | Waveform bar — unselected region |
| `#12111a` | Waveform canvas background |
| `#a78bfa` | Shimmer bar highlight (violet-400 equivalent) |
| `bg-red-500/10` + `border-red-500/30` + `text-red-400` | Error banners |
| `bg-violet-500/10` + `border-violet-500/25` + `text-violet-300` | Info/notice banners |
| `text-violet-400` | Active audio label, drag icon highlight |
| `bg-accent/20` + `text-accent` | Small counter badge (effects active indicator) |
| `bg-accent/90` | Template card clip-count badge |
| `border-accent/40` | Done-state card border |
| `border-accent/50` | Hover border on secondary buttons, effect toggle hover |
| `border-violet-500/40` | Active audio row border |
| `border-accent/30` | Memory Reel thumbnail border |
| `bg-black/60` | Thumbnail overlay bar background |
| `bg-black/70` | Photo index badge background |
| `bg-red-500/80` | Remove/delete button background |
| `bg-black/40` | Hover overlay on photo cards |
| `bg-black/50` | Hover overlay on MR thumbnails |

### Style-tag badge colors (PhotoTemplateGallery)

| Style | Text | Border | Background |
|---|---|---|---|
| Classic | `text-violet-400` | `border-violet-500/40` | `bg-violet-500/10` |
| Neon | `text-cyan-400` | `border-cyan-500/40` | `bg-cyan-500/10` |
| Cinematic | `text-yellow-400` | `border-yellow-500/40` | `bg-yellow-500/10` |
| Vintage | `text-amber-400` | `border-amber-500/40` | `bg-amber-500/10` |
| Editorial | `text-pink-400` | `border-pink-500/40` | `bg-pink-500/10` |
| Minimal | `text-gray-400` | `border-gray-500/40` | `bg-gray-500/10` |

---

## 2. Typography

### Font Families

```js
// tailwind.config.js
fontFamily: {
  sans: ['"Inter"', 'system-ui', 'sans-serif'],   // body default
  mono: ['"JetBrains Mono"', 'monospace'],         // labels, code, timestamps
}
```

Both fonts must be loaded externally (Google Fonts or self-hosted). The app body sets `font-family: 'Inter', system-ui, sans-serif` in `index.css`.

### Font Smoothing

```css
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### Type Scale (Tailwind defaults used)

| Class | Size | Usage |
|---|---|---|
| `text-[10px]` | 10px | Optional hint labels, thumbnail index overlay |
| `text-[9px]` | 9px | Memory Reel thumbnail bottom label |
| `text-xs` | 12px | Badges, tags, secondary labels, meta text, button text (ghost) |
| `text-sm` | 14px | Card body text, button text (primary/ghost), input labels |
| `text-base` | 16px | Generate button (collage), body descriptions |
| `text-lg` | 18px | Upload zone headline |
| `text-xl` | 20px | Photo Templates section header |
| `text-3xl` | 30px | Duration counter (tabular mono) |
| `text-3xl sm:text-4xl` | 30px / 36px | Hero page titles |
| `text-96` | 96px | FFmpeg drawtext title overlay (not Tailwind — raw ffmpeg value) |

### Font Weights

| Class | Weight | Usage |
|---|---|---|
| `font-normal` | 400 | Body, secondary text |
| `font-medium` | 500 | Labels, card subtitles, nav items |
| `font-semibold` | 600 | Card titles, section headings, primary button |
| `font-bold` | 700 | Hero headings, duration counter |

### Letter Spacing

| Class | Value | Usage |
|---|---|---|
| `tracking-wide` | 0.025em | Primary button text |
| `tracking-wider` | 0.05em | App name "FRAME" in header |
| `tracking-widest` | 0.1em | Section labels (uppercase small caps style) |
| `tracking-tight` | -0.025em | Large hero titles |

### Text Treatments

- **Uppercase section labels**: `text-ink-dim text-xs font-semibold uppercase tracking-widest` — used for subsection headers inside panels ("Trim audio", "Apply to all photos", "Transition style")
- **Font mono for timestamps / counters**: `font-mono tabular-nums` — used on duration display, timestamps in trim panel, photo counts
- **Line clamp (2 lines)**: Uses inline style `WebkitLineClamp: 2` + `WebkitBoxOrient: 'vertical'` + `overflow: 'hidden'` — on template card descriptions
- **Truncation**: `truncate` — on audio file name in collage mode
- **`leading-snug`**: On card title headings
- **`leading-relaxed`**: On description text under section headers

---

## 3. Spacing & Layout

### Page Layout

```
min-h-screen flex flex-col        → full-height layout
header + main flex-1 + footer     → three-row structure
px-6 py-4                         → header / footer padding
px-4 sm:px-6 py-10               → main content horizontal / vertical padding
max-w-6xl mx-auto w-full         → main content max width
space-y-10                        → vertical gap between main sections
```

### Content Max Widths

| Value | Used where |
|---|---|
| `max-w-2xl` | Upload zone, collage mode container, done state description |
| `max-w-3xl` | TemplateBuilder form |
| `max-w-6xl` | App main content, PhotoTemplateBuilder |
| `max-w-md` | Collage generating state |
| `max-w-lg` | Collage done state, photo templates section header |

### Card / Panel Internal Padding

| Context | Padding |
|---|---|
| Template card info section | `p-4` |
| PhotoTemplateBuilder panels | `p-4` |
| Collage panels (audio row, duration row) | `px-4 py-3` |
| Effects panel inner sections | `px-4 pb-4` |
| TemplateBuilder done/error cards | `p-5` |
| Upload zone | `px-8 py-16` |
| Collage drop zone | `px-8 py-10` |
| Audio trim panel | `p-4` |

### Gap Values

| Value | Used where |
|---|---|
| `gap-1` | Tag lists inside cards, waveform time labels |
| `gap-1.5` | Badge rows, time label separators |
| `gap-2` | Header elements, mode toggle buttons, button icon + label |
| `gap-3` | Button rows (done state), info rows |
| `gap-4` | Panel rows (audio file row), step spacing |
| `gap-5` | Template grid cards, main panel gap |
| `gap-6` | PhotoTemplateBuilder three-panel layout |
| `gap-10` | (via `space-y-10`) main page section spacing |

### Grid Column Counts

| Grid | Columns |
|---|---|
| Template gallery | `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| Photo template gallery | `grid-cols-2 lg:grid-cols-3` |
| Photo Wall slots | `grid-cols-2 sm:grid-cols-4` |
| Collage photo thumbnails | `grid-cols-4 sm:grid-cols-5` |

### Sidebar Widths (PhotoTemplateBuilder three-panel)

```
lg:w-64   → Upload panel (left)
flex-1    → Preview panel (center)
lg:w-56   → Export panel (right)
```

---

## 4. Border & Radius

### Border Radius Values

| Class | Radius | Used on |
|---|---|---|
| `rounded-md` | 6px | Skeleton loading bars, small tag chips |
| `rounded-lg` | 8px | Primary button, ghost button, most buttons |
| `rounded-xl` | 12px | Cards (`.card`), panels, drop zones, photo thumbnails, audio row |
| `rounded-2xl` | 16px | Upload zone, PhotoTemplateBuilder panels, collage drop zone, PhotoTemplateCard |
| `rounded-full` | 9999px | Badges, pills, toggle switch, spinner, index number circles, waveform handles |
| `rounded` | 4px | Waveform bars |
| `rounded-[3px]` | 3px | Scrollbar thumb |

### Borders

| Pattern | Used where |
|---|---|
| `border border-border` | Default card, panel, input borders |
| `border border-border-light` | Ghost button hover border |
| `border-2 border-dashed border-border` | Upload / drop zone at rest |
| `border-2 border-dashed border-violet-400` | Drop zone active (dragging) |
| `border-2 border-dashed hover:border-accent/60` | Photo slot, clip slot at rest hover |
| `border-2 border-accent/40` | Photo slot with file loaded, done card |
| `border border-red-500/30` | Error banner |
| `border border-violet-500/25` | Info banner |
| `border border-violet-500/40` | Active audio row |
| `border border-accent/50` | Hover border on gallery add button |
| `border-2 border-border hover:border-border-light` | Reorderable photo card |
| `border-2 border-violet-400 scale-105` | Photo card drag-over state |

### Dashed Border Drop Zones

All upload / drop zones use `border-2 border-dashed rounded-2xl` at rest. When dragging, border color transitions to `border-violet-400` and the custom class `drop-zone-active` animates the border-color pulse.

---

## 5. Shadows & Effects

### Box Shadows

No Tailwind `shadow-*` utilities are used on cards directly. Shadows are applied via:

- `shadow-lg` — on waveform drag handles (the accent pill handles)
- Custom `pulse-glow` keyframe — animates `box-shadow: 0 0 20px 4px rgba(124,58,237,0.35)` on elements with `animate-pulse-glow`

### Gradient Overlays (used on media previews)

```css
/* Template card and PhotoTemplateCard preview area */
bg-gradient-to-t from-surface-950/80 via-transparent to-transparent

/* Uploaded file preview in single-edit mode */
bg-gradient-to-t from-black/50 to-transparent

/* PhotoTemplateCard placeholder backdrop */
bg-gradient-to-br from-surface-700 via-surface-800 to-surface-950
```

### Backdrop / Canvas Background

The waveform canvas draws its own background in JS: `fillStyle = '#12111a'` (slightly lighter than `surface-900`).

### Opacity Overlays

| Value | Used where |
|---|---|
| `opacity-0 group-hover:opacity-100` | Edit button on template card, remove button on photo card, hover overlay |
| `opacity-60` | Upload zone when uploading (`pointer-events-none opacity-60`) |
| `opacity-40` | Film icon placeholder (no preview) |
| `opacity-30` | Empty state icon in PhotoTemplateBuilder |
| `bg-black/40` | Photo card hover overlay |
| `bg-black/50` | MR thumbnail hover overlay |
| `bg-black/60` | Thumbnail label bar, playing indicator badge |
| `bg-black/70` | Photo index number circle |
| `rgba(0,0,0,0.5)` | Waveform dim overlay on unselected region |

### Blur

- No `backdrop-blur` used anywhere.
- `.spinner` uses a CSS border technique (not blur).

---

## 6. Component Patterns

### Navigation Bar (header)

```jsx
<header className="border-b border-border px-6 py-4 flex items-center justify-between">
  {/* Logo mark */}
  <div className="flex items-center gap-3">
    <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
      <svg className="w-4 h-4 text-white" />
    </div>
    <span className="font-mono font-semibold text-ink tracking-wider text-sm">FRAME</span>
    <span className="text-ink-dim text-xs font-mono hidden sm:inline">/ AI Edit Generator</span>
  </div>

  {/* Mode toggle group */}
  <div className="flex items-center gap-1 p-1 bg-surface-800 border border-border rounded-lg">
    {/* Active tab */}
    <button className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent text-white shadow">
      Active
    </button>
    {/* Inactive tab */}
    <button className="px-3 py-1.5 rounded-md text-xs font-medium text-ink-muted hover:text-ink transition-all duration-150">
      Inactive
    </button>
  </div>
</header>
```

### Page Title (hero)

```jsx
<div className="text-center space-y-2 pt-4">
  <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
    Drop. Analyze. <span className="text-accent">Edit.</span>
  </h1>
  <p className="text-ink-muted text-base max-w-lg mx-auto">
    Supporting description text here.
  </p>
</div>
```

### Template / Feature Card

```jsx
<button
  className="bg-surface-800 border border-border rounded-xl overflow-hidden
    cursor-pointer hover:border-accent transition-all group text-left w-full"
>
  {/* Preview area: 9/16 aspect, max-height 220px */}
  <div className="relative w-full bg-surface-950 overflow-hidden" style={{ aspectRatio: '9/16', maxHeight: 220 }}>
    <img className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300" />
    {/* Gradient overlay — always present */}
    <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-transparent to-transparent pointer-events-none" />
    {/* Badge top-right */}
    <div className="absolute top-2.5 right-2.5">
      <span className="bg-accent/90 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
        4 clips
      </span>
    </div>
  </div>

  {/* Info section */}
  <div className="p-4 space-y-1.5">
    <div className="flex items-start justify-between gap-2">
      <h3 className="text-ink font-semibold text-sm group-hover:text-accent transition-colors leading-snug">
        Template Name
      </h3>
      <span className="text-ink-dim text-xs font-mono shrink-0 mt-0.5">30fps</span>
    </div>
    <p className="text-ink-muted text-xs leading-relaxed">Description (2-line clamped)</p>
    {/* Tag chips */}
    <div className="flex flex-wrap gap-1 pt-1">
      <span className="text-ink-dim text-xs px-1.5 py-0.5 bg-surface-700 rounded-md">tag</span>
    </div>
  </div>
</button>
```

### Photo Template Card (styled variant with style-tag badge)

```jsx
<button
  className="group rounded-2xl bg-surface-800 border border-border overflow-hidden cursor-pointer
    hover:border-accent/50 transition-all text-left w-full focus:outline-none
    focus-visible:ring-2 focus-visible:ring-accent"
>
  {/* Placeholder preview (no actual preview image) */}
  <div className="relative w-full bg-surface-700 overflow-hidden" style={{ aspectRatio: '1/1', maxHeight: 220 }}>
    {/* ... placeholder content ... */}
    <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-transparent to-transparent" />
    <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
      <p className="text-ink text-xs font-semibold leading-snug line-clamp-1">{template.name}</p>
    </div>
  </div>

  <div className="p-4 space-y-2.5">
    <div className="flex items-start justify-between gap-2">
      <h3 className="text-ink font-bold text-sm leading-snug group-hover:text-accent transition-colors">
        {template.name}
      </h3>
      {/* Style tag — color varies by style */}
      <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border text-violet-400 border-violet-500/40 bg-violet-500/10">
        Classic
      </span>
    </div>
    <p className="text-ink-dim text-xs">3 photos</p>
    {/* Platform badges */}
    <div className="flex flex-wrap gap-1">
      <span className="text-[10px] text-ink-muted border border-border rounded-full px-2 py-0.5 bg-surface-950/40">
        IG Story
      </span>
    </div>
    {/* "Use Template" CTA — appears on hover */}
    <div className="pt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <span className="inline-flex items-center gap-1 text-accent text-xs font-semibold">
        Use Template
        <svg className="w-3 h-3" />
      </span>
    </div>
  </div>
</button>
```

### Upload Zone (dashed)

```jsx
<div
  className={`relative flex flex-col items-center justify-center gap-5 px-8 py-16
    border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300
    ${isDragging
      ? 'drop-zone-active border-violet-400'
      : 'border-border hover:border-violet-500/50 hover:bg-surface-700/40'
    }
    ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
>
  {/* Icon container */}
  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
    ${isDragging ? 'bg-accent-muted' : 'bg-surface-700'}`}>
    <svg className={`w-8 h-8 transition-colors duration-300
      ${isDragging ? 'text-violet-400' : 'text-ink-muted'}`} />
  </div>

  {/* Text */}
  <div className="text-center space-y-1">
    <p className="text-ink font-semibold text-lg">Drop your media here</p>
    <p className="text-ink-muted text-sm">or click to browse — JPG, PNG, MP4, MOV · max 150 MB</p>
  </div>

  {/* Format badges */}
  <div className="flex gap-2 flex-wrap justify-center">
    {['JPG', 'PNG', 'MP4', 'MOV'].map(fmt => (
      <span key={fmt} className="label-tag">{fmt}</span>
    ))}
  </div>
</div>
```

### Primary Button (purple)

```jsx
{/* Via custom class */}
<button className="btn-primary">Generate Edits</button>

{/* Equivalent Tailwind expansion */}
<button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
  bg-accent hover:bg-accent-hover active:scale-95
  text-white font-semibold text-sm tracking-wide
  transition-all duration-150 cursor-pointer
  disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100">
  Generate Edits
</button>

{/* Full-width variant (used in collage generate) */}
<button className="btn-primary w-full justify-center py-3 text-base">…</button>
```

### Secondary / Ghost Button (outline)

```jsx
{/* Via custom class */}
<button className="btn-ghost">New Upload</button>

{/* Equivalent Tailwind expansion */}
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
  border border-border hover:border-border-light hover:bg-surface-700
  text-ink-muted hover:text-ink text-sm font-medium
  transition-all duration-150 cursor-pointer">
  New Upload
</button>
```

### Disabled Button

Primary button disabled state is handled by the `.btn-primary` class:
```css
disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
```

Manual disabled pattern (render button in PhotoTemplateBuilder):
```jsx
<button
  disabled={!allReady || isRendering}
  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors
    ${allReady && !isRendering
      ? 'bg-accent text-white hover:opacity-90'
      : 'bg-surface-700 text-ink-dim opacity-50 cursor-not-allowed'}`}
>
```

### Badge / Pill Tag

```jsx
{/* Format badge (label-tag class) */}
<span className="label-tag">JPG</span>
{/* Expands to: */}
<span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-medium
  bg-accent-muted text-violet-300 border border-violet-500/20">
  JPG
</span>

{/* Platform badge (PhotoTemplateGallery) */}
<span className="text-[10px] text-ink-muted border border-border rounded-full px-2 py-0.5 bg-surface-950/40">
  IG Story
</span>

{/* Counter badge (effects active) */}
<span className="px-1.5 py-0.5 rounded-full bg-accent/20 text-accent text-xs font-mono">
  2 fx · crossfade
</span>

{/* Clip count badge (on card overlay) */}
<span className="bg-accent/90 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
  4 clips
</span>

{/* Generic tag chip (inside card) */}
<span className="text-ink-dim text-xs px-1.5 py-0.5 bg-surface-700 rounded-md">
  tag
</span>

{/* Duration highlight (waveform trim) */}
<span className="px-1.5 py-0.5 rounded bg-accent/20 text-accent font-semibold text-xs font-mono">
  30s
</span>
```

### Section Label (small caps / uppercase)

```jsx
<p className="text-ink-dim text-xs font-semibold uppercase tracking-widest">
  Apply to all photos
</p>
```

### Text Input / Textarea

No dedicated text input component exists. The closest patterns are:

```jsx
{/* Range slider (duration control) */}
<input
  type="range"
  min={5} max={60} step={1}
  className="w-full accent-accent"
/>

{/* Title text input (Memory Reel) — inline style in TemplateBuilder */}
<input
  type="text"
  placeholder="e.g. Summer 2024"
  className="w-full bg-surface-700 border border-border rounded-lg px-3 py-2
    text-ink text-sm placeholder-ink-dim focus:outline-none focus:border-accent/60
    transition-colors"
/>
```

### Toggle Switch

```jsx
<button
  onClick={() => setEnabled(v => !v)}
  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
    ${enabled ? 'bg-accent' : 'bg-surface-600'}`}
>
  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
    ${enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
  />
</button>
```

### Slider

```jsx
{/* Native range input with Tailwind accent color override */}
<input
  type="range"
  min={5} max={60} step={1}
  value={value}
  onChange={e => setValue(Number(e.target.value))}
  className="w-full accent-accent"
/>
{/* Scale labels below */}
<div className="flex justify-between text-ink-dim text-xs font-mono">
  <span>5s</span><span>30s</span><span>60s</span>
</div>
```

### Progress Bar (shimmer)

```jsx
<div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden">
  <div className="h-full shimmer-bar w-full" />
</div>

{/* shimmer-bar CSS (from index.css): */}
{/*
  background: linear-gradient(90deg, #7c3aed 0%, #a78bfa 40%, #7c3aed 80%);
  background-size: 200% auto;
  animation: shimmer 1.8s linear infinite;
*/}
```

### Thumbnail Strip (Collage Mode)

```jsx
<div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
  {photos.map((photo, i) => (
    <div
      draggable
      className={`relative group aspect-square rounded-xl overflow-hidden cursor-grab active:cursor-grabbing
        border-2 transition-all duration-150
        ${isDragOver ? 'border-violet-400 scale-105' : 'border-border hover:border-border-light'}`}
    >
      <img src={photo.previewUrl} className="w-full h-full object-cover" />
      {/* Index number */}
      <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-black/70 text-white text-xs font-mono flex items-center justify-center">
        {i + 1}
      </div>
      {/* Remove button — visible on hover */}
      <button className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-red-500/80 text-white text-xs
        opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        ×
      </button>
      {/* Drag hint overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity
        flex items-center justify-center pointer-events-none">
        {/* Drag icon */}
      </div>
    </div>
  ))}
</div>
```

### Modal / Overlay

No modal component exists. The closest full-page overlay pattern is the `renderStage === 'generating'` state in CollageMode:

```jsx
<div className="w-full max-w-md mx-auto flex flex-col items-center gap-6 py-10 animate-fade-up">
  <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center">
    <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
  </div>
  <div className="text-center space-y-1">
    <p className="text-ink font-semibold">Building your collage…</p>
    <p className="text-ink-muted text-sm max-w-xs">{statusMsg}</p>
  </div>
  <div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden">
    <div className="h-full shimmer-bar w-full" />
  </div>
  <p className="text-ink-dim text-xs font-mono">This takes 20–60 seconds</p>
</div>
```

### Error Banner

```jsx
<div className="flex items-start gap-3 px-4 py-3 rounded-xl
  bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-up">
  <svg className="w-5 h-5 shrink-0 mt-0.5" />
  <span>{error}</span>
</div>
```

### Info / Notice Banner

```jsx
<div className="px-4 py-3 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 text-sm">
  <p className="font-medium mb-0.5">Notice title</p>
  <p className="text-xs text-violet-400/80">Supporting detail text.</p>
</div>
```

### Collapsible Panel (Effects & Style)

```jsx
<div className="rounded-xl border border-border bg-surface-800 overflow-hidden">
  {/* Header toggle */}
  <button
    onClick={() => setOpen(o => !o)}
    className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-700/40 transition-colors"
  >
    <div className="flex items-center gap-2">
      <svg className="w-4 h-4 text-accent" />
      <span className="text-ink text-sm font-medium">Effects &amp; Style</span>
    </div>
    <svg className={`w-4 h-4 text-ink-dim transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
  </button>

  {/* Body — animates in */}
  {open && (
    <div className="px-4 pb-4 space-y-5 border-t border-border animate-fade-up">
      {/* content */}
    </div>
  )}
</div>
```

### Breadcrumb Navigation

```jsx
<div className="flex items-center gap-3 pt-4">
  <button
    onClick={onBack}
    className="flex items-center gap-1.5 text-ink-muted hover:text-ink transition-colors text-sm"
  >
    <svg className="w-4 h-4" /> {/* left arrow */}
    Templates
  </button>
  <span className="text-ink-dim">/</span>
  <h2 className="text-ink font-semibold">Template Name</h2>
</div>
```

Simpler back-link variant (PhotoTemplateBuilder):
```jsx
<button onClick={onBack} className="text-sm text-ink-muted hover:text-ink transition-colors">
  ← Templates
</button>
```

### Done / Success Card

```jsx
<div className="bg-surface-800 border border-accent/40 rounded-2xl overflow-hidden animate-fade-up">
  <div className="p-5 space-y-4">
    {/* Success check */}
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
        <svg className="w-3 h-3 text-white" /> {/* checkmark */}
      </div>
      <p className="text-ink font-semibold">Render complete!</p>
    </div>
    <video className="w-full rounded-xl bg-black" style={{ maxHeight: 480 }} controls />
    <div className="flex flex-wrap gap-3">
      <a href={url} download
        className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors flex items-center gap-2">
        Download
      </a>
      <button className="bg-surface-700 text-ink px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-600 transition-colors">
        Make another
      </button>
    </div>
  </div>
</div>
```

### Skeleton Loading Card

```jsx
<div className="rounded-2xl bg-surface-800 border border-border overflow-hidden animate-pulse">
  <div className="w-full bg-surface-700" style={{ aspectRatio: '1/1', maxHeight: 220 }} />
  <div className="p-4 space-y-3">
    <div className="h-3.5 bg-surface-700 rounded-md w-3/4" />
    <div className="h-2.5 bg-surface-700 rounded-md w-1/4" />
    <div className="flex gap-1.5">
      <div className="h-4 bg-surface-700 rounded-full w-12" />
      <div className="h-4 bg-surface-700 rounded-full w-14" />
    </div>
  </div>
</div>
```

### Spinner

```jsx
{/* Via custom class */}
<div className="spinner" />
{/* With size override */}
<div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />

{/* From index.css: */}
{/*
  width: 20px; height: 20px;
  border: 2px solid rgba(124,58,237,0.25);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin-arc 0.75s linear infinite;
*/}
```

SVG spinner variant (PhotoTemplateBuilder):
```jsx
<svg className="w-5 h-5 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
</svg>
```

---

## 7. Animation & Transitions

### Transition Durations & Easing

| Pattern | Duration | Easing | Used on |
|---|---|---|---|
| `transition-all duration-150` | 150ms | default (ease) | Buttons (primary, ghost), mode tabs |
| `transition-all duration-200` | 200ms | default | Drop zone hover, collage photo card |
| `transition-all duration-300` | 300ms | default | Upload zone, icon container |
| `transition-colors` | default (150ms) | default | Most hover text/border color changes |
| `transition-colors duration-200` | 200ms | default | Drop zone icon |
| `transition-opacity duration-300` | 300ms | default | Template card video fade in/out |
| `transition-opacity duration-200` | 200ms | default | "Use Template" CTA hover fade |
| `transition-transform duration-200` | 200ms | default | Collapsible chevron rotate |
| `transition-transform` | default | default | Toggle switch knob translate |

### Keyframe Animations

```js
// tailwind.config.js keyframes
'pulse-glow': {
  '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,58,237,0)' },
  '50%':       { boxShadow: '0 0 20px 4px rgba(124,58,237,0.35)' },
}

'fade-up': {
  from: { opacity: '0', transform: 'translateY(16px)' },
  to:   { opacity: '1', transform: 'translateY(0)' },
}
```

```css
/* index.css keyframes */
@keyframes border-dance {
  0%, 100% { border-color: rgba(124,58,237,0.4); }
  50%       { border-color: rgba(124,58,237,0.9); }
}

@keyframes spin-arc {
  to { transform: rotate(360deg); }
}

@keyframes shimmer {
  from { background-position: -200% center; }
  to   { background-position:  200% center; }
}
```

### Animation Classes

| Class | Definition | Duration | Used on |
|---|---|---|---|
| `animate-fade-up` | fade-up keyframe | 0.4s ease forwards | Error banners, done state cards, collage states |
| `animate-pulse-glow` | pulse-glow keyframe | 2s ease-in-out infinite | (Available, rarely used explicitly) |
| `animate-spin-slow` | Tailwind spin | 3s linear infinite | (Defined, not observed in JSX) |
| `animate-pulse` | Tailwind built-in | 2s cubic-bezier infinite | Skeleton cards, playing indicator dot |
| `animate-spin` | Tailwind built-in | 1s linear infinite | SVG spinner |
| `drop-zone-active` | border-dance | 1s ease-in-out infinite | Active drag over upload zone |
| `spinner` | spin-arc | 0.75s linear infinite | All loading spinners |
| `shimmer-bar` | shimmer | 1.8s linear infinite | Progress bars |

### Hover Effects

| Effect | Pattern |
|---|---|
| Text color shift | `text-ink-muted hover:text-ink` |
| Border glow | `border-border hover:border-accent/50` |
| Accent text on card title | `group-hover:text-accent transition-colors` |
| Button press | `active:scale-95` |
| Drag-over card | `border-violet-400 scale-105` |
| Opacity fade in on hover | `opacity-0 group-hover:opacity-100 transition-opacity` |
| Fill color shift | `hover:bg-surface-700/40`, `hover:bg-surface-700` |
| Icon opacity | `opacity-40 group-hover:opacity-70 transition-opacity` |

---

## 8. Ready-to-use CSS Variables

```css
:root {
  /* ── Surfaces ── */
  --surface-950: #09090d;
  --surface-900: #111117;
  --surface-800: #18181f;
  --surface-700: #1f1f29;
  --surface-600: #2a2a36;   /* inferred — not in config, add manually */
  --surface-500: #35354a;   /* inferred — not in config, add manually */

  /* ── Borders ── */
  --border:       #27272f;
  --border-light: #35353f;

  /* ── Accent (brand purple) ── */
  --accent:       #7c3aed;
  --accent-hover: #6d28d9;
  --accent-muted: rgba(124, 58, 237, 0.18);
  --accent-glow:  rgba(124, 58, 237, 0.35);

  /* ── Text ── */
  --ink:       #f0f0f5;
  --ink-muted: #7070a0;
  --ink-dim:   #44445a;

  /* ── Fonts ── */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* ── Animation timing ── */
  --duration-fast:   150ms;
  --duration-normal: 200ms;
  --duration-slow:   300ms;

  /* ── Spinner ── */
  --spinner-ring:  rgba(124, 58, 237, 0.25);
  --spinner-top:   #7c3aed;

  /* ── Shimmer ── */
  --shimmer-from: #7c3aed;
  --shimmer-mid:  #a78bfa;
}
```

---

## 9. Ready-to-use Tailwind Config Extension

```js
// tailwind.config.js — theme.extend block
theme: {
  extend: {
    colors: {
      surface: {
        950: '#09090d',
        900: '#111117',
        800: '#18181f',
        700: '#1f1f29',
        600: '#2a2a36',  // add — used in JSX but missing from original config
        500: '#35354a',  // add — used in JSX but missing from original config
      },
      border: {
        DEFAULT: '#27272f',
        light:   '#35353f',
      },
      accent: {
        DEFAULT: '#7c3aed',
        hover:   '#6d28d9',
        muted:   'rgba(124,58,237,0.18)',
        glow:    'rgba(124,58,237,0.35)',
      },
      ink: {
        DEFAULT: '#f0f0f5',
        muted:   '#7070a0',
        dim:     '#44445a',
      },
    },
    fontFamily: {
      sans: ['"Inter"',          'system-ui', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'monospace'],
    },
    animation: {
      'spin-slow':   'spin 3s linear infinite',
      'pulse-glow':  'pulse-glow 2s ease-in-out infinite',
      'fade-up':     'fade-up 0.4s ease forwards',
    },
    keyframes: {
      'pulse-glow': {
        '0%, 100%': { boxShadow: '0 0 0 0 rgba(124,58,237,0)' },
        '50%':      { boxShadow: '0 0 20px 4px rgba(124,58,237,0.35)' },
      },
      'fade-up': {
        from: { opacity: '0', transform: 'translateY(16px)' },
        to:   { opacity: '1', transform: 'translateY(0)' },
      },
    },
  },
},
```

---

## 10. Component Recipes

Copy-paste ready JSX + Tailwind for each component type. All assume the Tailwind config extension above is applied and `index.css` component classes are available.

---

### Recipe: Navigation Bar

```jsx
export function NavBar({ modes, activeMode, onModeChange }) {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between">
      {/* Wordmark */}
      <div className="flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3h14M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2" />
          </svg>
        </div>
        <span className="font-mono font-semibold text-ink tracking-wider text-sm">FRAME</span>
        <span className="text-ink-dim text-xs font-mono hidden sm:inline">/ AI Edit Generator</span>
      </div>

      {/* Mode tabs */}
      <div className="flex items-center gap-1 p-1 bg-surface-800 border border-border rounded-lg">
        {modes.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onModeChange(key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150
              ${activeMode === key
                ? 'bg-accent text-white shadow'
                : 'text-ink-muted hover:text-ink'}`}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  );
}
```

---

### Recipe: Page Title (Hero)

```jsx
export function PageHero({ title, accent, description }) {
  return (
    <div className="text-center space-y-2 pt-4">
      <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
        {title} <span className="text-accent">{accent}</span>
      </h1>
      <p className="text-ink-muted text-base max-w-lg mx-auto">{description}</p>
    </div>
  );
}
```

---

### Recipe: Template Card

```jsx
export function TemplateCard({ name, description, clipCount, tags, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className="bg-surface-800 border border-border rounded-xl overflow-hidden
        cursor-pointer hover:border-accent transition-all group text-left w-full"
    >
      {/* Preview */}
      <div className="relative w-full bg-surface-950" style={{ aspectRatio: '9/16', maxHeight: 220 }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <svg className="w-10 h-10 text-accent opacity-40 group-hover:opacity-70 transition-opacity"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 via-transparent to-transparent" />
        <div className="absolute top-2.5 right-2.5">
          <span className="bg-accent/90 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
            {clipCount} clips
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-1.5">
        <h3 className="text-ink font-semibold text-sm group-hover:text-accent transition-colors leading-snug">
          {name}
        </h3>
        <p className="text-ink-muted text-xs leading-relaxed line-clamp-2">{description}</p>
        {tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map(tag => (
              <span key={tag} className="text-ink-dim text-xs px-1.5 py-0.5 bg-surface-700 rounded-md">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
```

---

### Recipe: Upload Zone

```jsx
import { useRef, useState } from 'react';

export function UploadZone({ onFile, accept = '.jpg,.jpeg,.png', isUploading = false }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    onFile?.(e.dataTransfer.files[0]);
  };

  return (
    <div
      onClick={() => !isUploading && inputRef.current?.click()}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      className={`relative flex flex-col items-center justify-center gap-5 px-8 py-16
        border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300
        ${isDragging
          ? 'drop-zone-active border-violet-400'
          : 'border-border hover:border-violet-500/50 hover:bg-surface-700/40'}
        ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
        ${isDragging ? 'bg-accent-muted' : 'bg-surface-700'}`}>
        {isUploading
          ? <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
          : <svg className={`w-8 h-8 transition-colors duration-300 ${isDragging ? 'text-violet-400' : 'text-ink-muted'}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
        }
      </div>

      <div className="text-center space-y-1">
        <p className="text-ink font-semibold text-lg">
          {isUploading ? 'Uploading…' : isDragging ? 'Drop to upload' : 'Drop your file here'}
        </p>
        <p className="text-ink-muted text-sm">or click to browse</p>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        {['JPG', 'PNG', 'MP4', 'MOV'].map(fmt => (
          <span key={fmt} className="label-tag">{fmt}</span>
        ))}
      </div>

      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => onFile?.(e.target.files[0])} />
    </div>
  );
}
```

---

### Recipe: Primary Button

```jsx
export function PrimaryButton({ children, onClick, disabled, fullWidth = false, large = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`btn-primary ${fullWidth ? 'w-full justify-center' : ''} ${large ? 'py-3 text-base' : ''}`}
    >
      {children}
    </button>
  );
}
// Or inline:
// <button className="btn-primary">Click me</button>
```

---

### Recipe: Ghost / Secondary Button

```jsx
export function GhostButton({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn-ghost">
      {children}
    </button>
  );
}
```

---

### Recipe: Badge / Label Tag

```jsx
// Format/type badge
export function LabelTag({ children }) {
  return <span className="label-tag">{children}</span>;
}

// Platform badge
export function PlatformBadge({ children }) {
  return (
    <span className="text-[10px] text-ink-muted border border-border rounded-full px-2 py-0.5 bg-surface-950/40">
      {children}
    </span>
  );
}

// Style-tag badge (colored variants)
const STYLE_COLORS = {
  Classic:   'text-violet-400 border-violet-500/40 bg-violet-500/10',
  Neon:      'text-cyan-400   border-cyan-500/40   bg-cyan-500/10',
  Cinematic: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
  Vintage:   'text-amber-400  border-amber-500/40  bg-amber-500/10',
  Editorial: 'text-pink-400   border-pink-500/40   bg-pink-500/10',
  Minimal:   'text-gray-400   border-gray-500/40   bg-gray-500/10',
};

export function StyleTagBadge({ style }) {
  const cls = STYLE_COLORS[style] ?? 'text-ink-muted border-border bg-surface-700';
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {style}
    </span>
  );
}
```

---

### Recipe: Section Label (small caps)

```jsx
export function SectionLabel({ children }) {
  return (
    <p className="text-ink-dim text-xs font-semibold uppercase tracking-widest">
      {children}
    </p>
  );
}
```

---

### Recipe: Toggle Switch

```jsx
import { useState } from 'react';

export function Toggle({ value, onChange, label, hint }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        {label && <p className="text-ink text-sm font-medium">{label}</p>}
        {hint  && <p className="text-ink-muted text-xs mt-0.5">{hint}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors
          ${value ? 'bg-accent' : 'bg-surface-600'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
          ${value ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}
```

---

### Recipe: Slider

```jsx
export function Slider({ value, onChange, min = 0, max = 100, step = 1, labels }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-ink text-3xl font-bold font-mono tabular-nums">{value}</span>
        <span className="text-ink-muted text-sm">units</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
      {labels && (
        <div className="flex justify-between text-ink-dim text-xs font-mono">
          {labels.map(l => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
```

---

### Recipe: Progress Bar (shimmer)

```jsx
export function ProgressBar({ message, hint }) {
  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <div className="w-14 h-14 rounded-2xl bg-accent-muted flex items-center justify-center">
        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
      </div>
      {message && (
        <div className="text-center space-y-1">
          <p className="text-ink font-semibold">{message}</p>
          {hint && <p className="text-ink-muted text-sm max-w-xs">{hint}</p>}
        </div>
      )}
      <div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden">
        <div className="h-full shimmer-bar w-full" />
      </div>
    </div>
  );
}
```

---

### Recipe: Error Banner

```jsx
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl
      bg-red-500/10 border border-red-500/30 text-red-400 text-sm animate-fade-up">
      <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      <span>{message}</span>
    </div>
  );
}
```

---

### Recipe: Skeleton Loading Card

```jsx
export function SkeletonCard({ aspectRatio = '1/1' }) {
  return (
    <div className="rounded-2xl bg-surface-800 border border-border overflow-hidden animate-pulse">
      <div className="w-full bg-surface-700" style={{ aspectRatio, maxHeight: 220 }} />
      <div className="p-4 space-y-3">
        <div className="h-3.5 bg-surface-700 rounded-md w-3/4" />
        <div className="h-2.5 bg-surface-700 rounded-md w-1/4" />
        <div className="flex gap-1.5">
          <div className="h-4 bg-surface-700 rounded-full w-12" />
          <div className="h-4 bg-surface-700 rounded-full w-14" />
        </div>
      </div>
    </div>
  );
}
```

---

### Required global CSS (paste into your `index.css`)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *, *::before, *::after { box-sizing: border-box; }

  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    background-color: #09090d;
    color: #f0f0f5;
    font-family: 'Inter', system-ui, sans-serif;
    min-height: 100vh;
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #111117; }
  ::-webkit-scrollbar-thumb { background: #35353f; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #7c3aed; }
}

@layer components {
  .btn-primary {
    @apply inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
           bg-accent hover:bg-accent-hover active:scale-95
           text-white font-semibold text-sm tracking-wide
           transition-all duration-150 cursor-pointer
           disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100;
  }

  .btn-ghost {
    @apply inline-flex items-center gap-2 px-4 py-2 rounded-lg
           border border-border hover:border-border-light hover:bg-surface-700
           text-ink-muted hover:text-ink text-sm font-medium
           transition-all duration-150 cursor-pointer;
  }

  .card {
    @apply bg-surface-800 border border-border rounded-xl overflow-hidden;
  }

  .label-tag {
    @apply inline-block px-2.5 py-0.5 rounded-full text-xs font-mono font-medium
           bg-accent-muted text-violet-300 border border-violet-500/20;
  }
}

@keyframes border-dance {
  0%, 100% { border-color: rgba(124,58,237,0.4); }
  50%       { border-color: rgba(124,58,237,0.9); }
}
.drop-zone-active {
  animation: border-dance 1s ease-in-out infinite;
  background: rgba(124,58,237,0.06);
}

@keyframes spin-arc {
  to { transform: rotate(360deg); }
}
.spinner {
  width: 20px; height: 20px;
  border: 2px solid rgba(124,58,237,0.25);
  border-top-color: #7c3aed;
  border-radius: 50%;
  animation: spin-arc 0.75s linear infinite;
}

@keyframes shimmer {
  from { background-position: -200% center; }
  to   { background-position:  200% center; }
}
.shimmer-bar {
  background: linear-gradient(90deg, #7c3aed 0%, #a78bfa 40%, #7c3aed 80%);
  background-size: 200% auto;
  animation: shimmer 1.8s linear infinite;
}
```
