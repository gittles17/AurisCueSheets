# Auris Design System

A comprehensive design system for dark-themed, data-rich applications. This guide documents every visual pattern, component, and convention used in the Auris project.

---

## Table of Contents

1. [Logo & Brand Assets](#1-logo--brand-assets)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Layout Patterns](#4-layout-patterns)
5. [Component Patterns](#5-component-patterns)
6. [Interactive States](#6-interactive-states)
7. [Animation & Transitions](#7-animation--transitions)
8. [Spacing System](#8-spacing-system)
9. [Icon System](#9-icon-system)
10. [Special Effects](#10-special-effects)
11. [Skeleton & Loading States](#11-skeleton--loading-states)
12. [Empty & Error States](#12-empty--error-states)
13. [Keyboard Shortcuts](#13-keyboard-shortcuts)

---

## 1. Logo & Brand Assets

### Primary Wordmark

**File:** `auris-logo.svg`

The full horizontal wordmark with a diagonal gradient fill. Use for headers, login screens, and prominent branding.

```html
<img src="/auris-logo.svg" alt="Auris" className="h-8" />
```

**Gradient Stops:**
```css
#4a5a6a → #6a8a7a → #8aa5c5 → #c5a5a5 → #8a8a8a
```

| Context | Size | Tailwind Class |
|---------|------|----------------|
| Login/splash screen | 112px | `h-28` |
| Main header | 40-56px | `h-10 md:h-14` |
| Compact header | 32px | `h-8` |

### Icon/Symbol

**File:** `auris_logo_blackBG_small.png`

Square geometric mark optimized for dark backgrounds. Use for avatars, loaders, favicons, and compact spaces.

```html
<img src="/auris_logo_blackBG_small.png" alt="" className="w-10 h-10 object-contain" />
```

| Context | Size | Tailwind Class |
|---------|------|----------------|
| Chat avatar | 40x40px | `w-10 h-10` |
| Loading spinner | 50% of loader | Dynamic |
| Button icon | 20x20px | `w-5 h-5` |
| Favicon | 32x32, 16x16 | N/A |

### Usage Guidelines

**Do:**
- Use wordmark on dark backgrounds (#0a0a0a or darker)
- Maintain aspect ratio when scaling
- Allow adequate whitespace around logos

**Don't:**
- Place on light backgrounds without modification
- Stretch or distort the logo
- Use icon where wordmark is more appropriate

---

## 2. Color System

### CSS Custom Properties

Add these to your `:root` in `index.css`:

```css
:root {
  /* Core backgrounds - Dark with subtle blue tint */
  --bg-primary: #0a0d12;
  --bg-secondary: #090b0f;
  --bg-card: #08090d;
  --bg-card-hover: #0c0e14;
  --bg-surface: #090b0f;
  
  /* Borders */
  --border-color: #262626;
  --border-color-light: #333333;
  
  /* Text hierarchy */
  --text-primary: #ffffff;
  --text-secondary: #a3a3a3;
  --text-muted: #737373;
  
  /* Accent colors - Soft gradient palette */
  --accent-green: #5BB09A;
  --accent-green-dim: rgba(91, 176, 154, 0.15);
  --accent-blue: #7AAED4;
  --accent-blue-dim: rgba(122, 174, 212, 0.15);
  --accent-purple: #9A85C9;
  --accent-purple-dim: rgba(154, 133, 201, 0.15);
  --accent-orange: #E09055;
  --accent-orange-dim: rgba(224, 144, 85, 0.15);
  --accent-red: #D4918A;
  --accent-red-dim: rgba(212, 145, 138, 0.15);
}
```

### Tailwind Theme Extension

Add to `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      'auris': {
        // Backgrounds
        'bg': '#090b10',
        'surface': '#0d0d0d',
        'card': '#141414',
        'card-hover': '#1a1a1a',
        // Borders
        'border': '#262626',
        'border-light': '#333333',
        // Text
        'text': '#ffffff',
        'secondary': '#a3a3a3',
        'muted': '#737373',
        // Accents
        'green': '#5BB09A',
        'blue': '#7AAED4',
        'purple': '#9A85C9',
        'orange': '#E09055',
        'red': '#D4918A'
      }
    },
    fontFamily: {
      'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      'display': ['Alpha Lyrae', 'Inter', 'sans-serif'],
      'mono': ['JetBrains Mono', 'SF Mono', 'Monaco', 'monospace']
    },
    boxShadow: {
      'card': '0 2px 8px rgba(0, 0, 0, 0.4)',
      'card-hover': '0 4px 16px rgba(0, 0, 0, 0.5)',
      'modal': '0 24px 48px rgba(0, 0, 0, 0.7)'
    }
  }
}
```

### Semantic Color Usage

#### Category Colors (News/Ticker)
```js
const CATEGORY_COLORS = {
  DEAL: 'text-red-400',
  PRODUCTION: 'text-amber-400',
  CASTING: 'text-violet-400',
  RELEASE: 'text-cyan-400',
  FRANCHISE: 'text-pink-400',
  AWARDS: 'text-yellow-400',
}
```

#### Content Type Colors
```js
const TYPE_COLORS = {
  film: 'text-cyan-400',
  series: 'text-violet-400',
  tv: 'text-violet-400',
  content: 'text-amber-400'
}
```

#### Pipeline Stage Colors
```js
const STAGE_COLORS = {
  watching: { color: '#6b7280', bg: 'bg-zinc-800/50' },
  reached_out: { color: '#3b82f6', bg: 'bg-blue-950/50' },
  in_conversation: { color: '#8b5cf6', bg: 'bg-violet-950/50' },
  proposal_sent: { color: '#f59e0b', bg: 'bg-amber-950/50' },
  closed_won: { color: '#22c55e', bg: 'bg-green-950/50' },
  closed_lost: { color: '#ef4444', bg: 'bg-red-950/50' }
}
```

#### Status Colors
```css
.status-active { background: var(--accent-green-dim); color: var(--accent-green); }
.status-pending { background: var(--accent-orange-dim); color: var(--accent-orange); }
.status-error { background: var(--accent-red-dim); color: var(--accent-red); }
.status-info { background: var(--accent-blue-dim); color: var(--accent-blue); }
```

---

## 3. Typography

### Font Loading

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* Custom display font (optional) */
@font-face {
  font-family: 'Alpha Lyrae';
  src: url('/fonts/AlphaLyrae-Medium.woff2') format('woff2'),
       url('/fonts/AlphaLyrae-Medium.woff') format('woff');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
```

### Font Stack

| Purpose | Font Family | Usage |
|---------|-------------|-------|
| UI Text | Inter | Body copy, buttons, labels |
| Display | Alpha Lyrae | Hero headings (optional) |
| Data/Code | JetBrains Mono | Numbers, KPIs, code blocks |

### Base Styles

```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Inter', -apple-system, sans-serif;
  font-weight: 600;
}

h1 {
  letter-spacing: -0.02em;
}
```

### Size Scale

| Element | Size | Weight | Tailwind |
|---------|------|--------|----------|
| Tiny labels | 9-10px | 500-600 | `text-[9px]`, `text-[10px]` |
| Small labels | 11px | 500 | `text-[11px]` |
| Body small | 12-13px | 400 | `text-xs`, `text-[13px]` |
| Body | 14px | 400 | `text-sm` |
| Subheading | 15px | 600 | `text-[15px] font-semibold` |
| Heading | 18-20px | 600 | `text-lg`, `text-xl` |

### Letter Spacing

```css
/* Uppercase labels */
.section-header {
  font-size: 10-11px;
  font-weight: 500-600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Headings */
h1 { letter-spacing: -0.02em; }

/* Badges */
.badge { letter-spacing: 0.02em; }
```

### Monospace Usage

Apply to numbers, data values, and code:

```css
.font-mono, code, pre, .kpi-value, .data-value, .stat-number {
  font-family: 'JetBrains Mono', 'SF Mono', 'Monaco', monospace !important;
}
```

---

## 4. Layout Patterns

### App Shell Structure

```jsx
<div className="h-screen flex flex-col overflow-hidden">
  {/* Top ticker (optional) */}
  <IntelTicker />
  
  <div className="flex-1 flex overflow-hidden">
    {/* Sidebar - hidden on mobile */}
    <aside className="hidden md:flex w-14 h-full bg-[#0a0a0a] border-r border-[#1f1f1f] flex-col">
      {/* Navigation */}
    </aside>
    
    {/* Main content */}
    <div className="flex-1 flex flex-col overflow-hidden">
      <header>{/* Header */}</header>
      <main className="flex-1 overflow-y-auto">
        {/* Page content */}
      </main>
    </div>
  </div>
</div>
```

### Page Padding

```jsx
// Standard page content
<div className="px-3 md:pl-10 md:pr-6 py-3 md:py-4">
  {/* Content */}
</div>

// With more vertical space
<div className="px-3 md:pl-10 md:pr-6 py-4 md:py-6">
  {/* Content */}
</div>
```

### Grid Systems

```jsx
// 3-column grid (desktop), 1-column (mobile)
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

// 2-column grid
<div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

// 4-column KPI row
<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
```

### Responsive Breakpoints

Primary breakpoint is `md:` (768px):

```jsx
// Mobile-first pattern
className="px-3 md:pl-10"      // Padding
className="hidden md:flex"      // Show on desktop
className="md:hidden"           // Hide on desktop
className="text-sm md:text-base" // Font size
```

### Z-Index Scale

| Layer | Z-Index | Usage |
|-------|---------|-------|
| Base content | 1 | Main content |
| Panels | 50-55 | Side panels, drawers |
| Chat panel | 60 | Slide-out chat |
| Modals | 100 | Modal dialogs |
| Dropdowns | 100 | Menu dropdowns |
| Tooltips | 9999 | Tooltip portals |

---

## 5. Component Patterns

### Cards

```css
.card {
  background: #080808;
  border: 1px solid #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  transition: border-color 0.2s ease;
}

.card:hover {
  border-color: #262626;
}
```

```jsx
// Basic card
<div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4">

// Card with warm gradient (existing relationships)
<div className="bg-gradient-to-br from-amber-500/[0.03] to-orange-500/[0.02] border border-amber-500/10 hover:border-amber-500/20 rounded-xl">

// Card with cold gradient (new opportunities)
<div className="bg-gradient-to-br from-sky-500/[0.03] to-cyan-500/[0.02] border border-sky-500/10 hover:border-sky-500/20 rounded-xl">
```

### Buttons

```css
/* Primary - White */
.btn-primary {
  background: #ffffff;
  color: #000000;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover { background: #e5e5e5; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* Secondary - Outline */
.btn-secondary {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  padding: 10px 20px;
  border-radius: 8px;
}

.btn-secondary:hover {
  border-color: var(--border-color-light);
  background: var(--bg-card);
}

/* Ghost - Text only */
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: none;
  padding: 8px 12px;
  border-radius: 6px;
}

.btn-ghost:hover {
  color: var(--text-primary);
  background: var(--bg-card);
}
```

```jsx
// Primary button
<button className="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-lg hover:bg-[#e5e5e5] transition-colors disabled:opacity-50">
  Save
</button>

// Secondary button
<button className="px-5 py-2.5 text-sm text-[#a3a3a3] hover:text-white border border-[#262626] rounded-lg hover:border-[#333] transition-colors">
  Cancel
</button>

// Gradient glow button
<div className="relative">
  <div className="absolute -inset-0.5 rounded-full blur-sm bg-gradient-to-r from-auris-purple/50 to-auris-orange/50 opacity-70" />
  <button className="relative px-4 py-2 bg-[#141414] border border-[#333] rounded-full text-[#ccc] hover:text-white">
    Ask Auris
  </button>
</div>
```

### Badges & Pills

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.badge-green { background: var(--accent-green-dim); color: var(--accent-green); }
.badge-blue { background: var(--accent-blue-dim); color: var(--accent-blue); }
.badge-purple { background: var(--accent-purple-dim); color: var(--accent-purple); }
.badge-orange { background: var(--accent-orange-dim); color: var(--accent-orange); }
.badge-red { background: var(--accent-red-dim); color: var(--accent-red); }
```

```jsx
// Genre badge
<span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-400 font-semibold uppercase">
  ACT
</span>

// Stage badge
<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-violet-950/50" style={{ color: '#8b5cf6' }}>
  In Conversation
</span>

// Pill with border
<span className="inline-flex items-center px-2 py-0.5 rounded border border-emerald-500 bg-emerald-500/15 text-emerald-400 text-xs font-mono">
  ACTIVE
</span>
```

### Inputs

```css
input[type="text"],
input[type="email"],
input[type="password"],
textarea,
select {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 12px 14px;
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

input:focus,
textarea:focus,
select:focus {
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px var(--accent-blue-dim);
}

input::placeholder {
  color: var(--text-muted);
}
```

```jsx
<input
  type="text"
  placeholder="Search..."
  className="w-full px-4 py-3 bg-[#141414] border border-[#262626] rounded-lg text-white placeholder-[#737373] focus:outline-none focus:border-auris-blue focus:ring-2 focus:ring-auris-blue/20 transition-colors"
/>
```

### Tables

```css
.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  text-align: left;
  padding: 10px 12px;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #666;
  border-bottom: 1px solid #1a1a1a;
  background: #0a0a0a;
}

.data-table td {
  padding: 8px 12px;
  font-size: 13px;
  color: #d4d4d4;
  border-bottom: 1px solid #151515;
}

.data-table tr:hover td {
  background: #0d0d0d;
}
```

### Sidebar Navigation

```jsx
// Icon-only sidebar
<aside className="hidden md:flex w-14 h-full bg-[#0a0a0a] border-r border-[#1f1f1f] flex-col items-center">
  <nav className="flex-1 flex flex-col items-center justify-center gap-1">
    {/* Nav item with active indicator */}
    <div className="relative flex items-center">
      {isActive && (
        <div className="absolute -right-[7px] w-[2px] h-6 bg-blue-500 rounded-l-full" />
      )}
      <button className={`w-10 h-10 flex items-center justify-center transition-all ${
        isActive ? 'text-[#888]' : 'text-[#555] hover:text-[#888]'
      }`}>
        <House size={24} weight="thin" />
      </button>
    </div>
  </nav>
</aside>

// Hover tooltip
{isHovered && (
  <div className="absolute left-14 top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-[#1a1a1a] border border-[#333] rounded text-xs text-white whitespace-nowrap z-50">
    Dashboard
  </div>
)}
```

### Modals

```jsx
<motion.div
  data-modal-root
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center"
  style={{ zIndex: 9999 }}
  onClick={onClose}
>
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    onClick={(e) => e.stopPropagation()}
    className="bg-[#0d0d0d] border border-[#262626] rounded-xl shadow-2xl w-[450px] max-w-[90vw]"
  >
    {/* Header */}
    <div className="px-6 py-5 border-b border-[#262626] flex items-center justify-between">
      <h2 className="text-white font-medium text-lg">Modal Title</h2>
      <button className="text-[#a3a3a3] hover:text-white transition-colors">
        <X className="w-5 h-5" />
      </button>
    </div>
    
    {/* Content */}
    <div className="p-6">
      {/* ... */}
    </div>
    
    {/* Footer */}
    <div className="px-6 py-5 border-t border-[#262626] flex justify-end gap-3">
      <button className="btn-secondary">Cancel</button>
      <button className="btn-primary">Save</button>
    </div>
  </motion.div>
</motion.div>
```

### Dropdown Menus

```jsx
<div className="absolute right-0 top-full mt-2 w-56 bg-[#0d0d0d] border border-[#262626] rounded-xl shadow-2xl z-[100] py-2">
  {/* Section label */}
  <p className="px-4 py-1.5 text-[10px] text-[#555] uppercase tracking-wider">
    Navigate
  </p>
  
  {/* Menu item */}
  <button className={`w-full px-4 py-2.5 flex items-center gap-3 text-sm transition-colors ${
    isActive ? 'text-white bg-[#1a1a1a]' : 'text-[#888] hover:text-white hover:bg-[#151515]'
  }`}>
    <House size={18} weight="thin" />
    Dashboard
  </button>
  
  {/* Divider */}
  <div className="my-2 border-t border-[#262626]" />
</div>
```

### Command Palette / Global Search

```jsx
<motion.div
  initial={{ opacity: 0, y: -10, scale: 0.95 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, y: -10, scale: 0.95 }}
  transition={{ duration: 0.15 }}
  className="absolute right-0 top-full mt-2 w-[380px] bg-[#0d0d0d] border border-[#262626] rounded-xl shadow-2xl overflow-hidden z-[100]"
>
  {/* Search input */}
  <div className="flex items-center gap-3 px-4 py-3 border-b border-[#262626]">
    <MagnifyingGlass className="w-4 h-4 text-[#555]" />
    <input
      type="text"
      placeholder="Search releases, clients..."
      className="flex-1 bg-transparent text-sm text-white placeholder-[#555] focus:outline-none"
    />
  </div>
  
  {/* Results */}
  <div className="max-h-[400px] overflow-y-auto">
    {/* Section header */}
    <div className="px-4 py-2 bg-[#111] border-b border-[#1a1a1a]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#555]">
        Releases (5)
      </span>
    </div>
    {/* Results list */}
  </div>
  
  {/* Footer hint */}
  <div className="px-4 py-2 border-t border-[#1a1a1a] bg-[#0a0a0a]">
    <p className="text-[10px] text-[#444] text-center">
      Press <kbd className="px-1.5 py-0.5 bg-[#1a1a1a] rounded text-[#666]">Esc</kbd> to close
    </p>
  </div>
</motion.div>
```

### News Ticker

```css
.ticker-wrapper { 
  overflow: hidden; 
  width: 100%; 
}

.ticker-track { 
  display: flex; 
  width: max-content; 
  animation: ticker-scroll linear infinite; 
}

@keyframes ticker-scroll { 
  0% { transform: translateX(0); } 
  100% { transform: translateX(-50%); } 
}
```

```jsx
<div className="w-full bg-[#0a0a0a] border-b border-[#1a1a1a] overflow-hidden">
  <div 
    className="ticker-wrapper"
    onMouseEnter={() => setIsPaused(true)}
    onMouseLeave={() => setIsPaused(false)}
  >
    <div 
      className="ticker-track"
      style={{
        animationDuration: `${duration}s`,
        animationPlayState: isPaused ? 'paused' : 'running'
      }}
    >
      {/* Duplicate items for seamless loop */}
      {items.map(item => <TickerItem key={`a-${item.id}`} item={item} />)}
      {items.map(item => <TickerItem key={`b-${item.id}`} item={item} />)}
    </div>
  </div>
</div>
```

---

## 6. Interactive States

### Hover States

```jsx
// Background hover
className="hover:bg-[#151515]"
className="hover:bg-[#1a1a1a]"
className="hover:bg-[#262626]"

// Text hover
className="text-[#888] hover:text-white"
className="text-[#666] hover:text-[#888]"

// Border hover
className="border-[#262626] hover:border-[#333]"
className="border-[#333] hover:border-[#444]"

// Combined
className="text-[#888] hover:text-white hover:bg-[#151515] transition-colors"
```

### Focus States

```jsx
className="focus:outline-none focus:border-auris-blue focus:ring-2 focus:ring-auris-blue/20"
```

### Active States

```jsx
// Navigation active
className={isActive ? 'text-white bg-[#1a1a1a]' : 'text-[#888] hover:text-white'}

// With indicator bar
{isActive && (
  <div className="absolute -right-[7px] w-[2px] h-6 bg-blue-500 rounded-l-full" />
)}
```

### Disabled States

```jsx
className="disabled:opacity-50 disabled:cursor-not-allowed"
```

### Copy Feedback

```jsx
const [copied, setCopied] = useState(false)

const handleCopy = async () => {
  await navigator.clipboard.writeText(text)
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}

// Visual feedback
{copied ? (
  <Check className="w-3 h-3 text-emerald-400" />
) : (
  <Copy className="w-3 h-3" />
)}
```

---

## 7. Animation & Transitions

### Default Transitions

```jsx
// Color transitions
className="transition-colors"

// All properties
className="transition-all duration-150"
className="transition-all 0.15s ease"

// Transform transitions
className="transition-transform"
```

### Framer Motion Configurations

```jsx
// Slide panel
<motion.div
  initial={{ x: 520, opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  exit={{ x: 520, opacity: 0 }}
  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
>

// Scale/fade modal
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.15 }}
>

// Collapse/expand
<motion.div
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: 'auto', opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{ duration: 0.15 }}
>
```

### Keyframe Animations

```css
/* Shimmer loading effect */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.animate-shimmer {
  background: linear-gradient(90deg, #1a1a1a 0%, #252525 50%, #1a1a1a 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* Typing indicator */
@keyframes typing-bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-6px); }
}

.typing-dot {
  animation: typing-bounce 1.4s ease-in-out infinite;
}
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

/* Logo glint effect */
@keyframes glint {
  0% { transform: translateX(-200%); }
  100% { transform: translateX(200%); }
}
```

### Loading Spinner

```jsx
// Simple spinner
<div className="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin" />

// Gradient arc spinner (AurisLoader)
const GRADIENT_STOPS = [
  { offset: '0%', color: '#4A7C59' },
  { offset: '25%', color: '#5B8FB9' },
  { offset: '50%', color: '#7B68A6' },
  { offset: '75%', color: '#C4785C' },
  { offset: '100%', color: '#D4856A' },
]
```

---

## 8. Spacing System

### Gap Scale

| Token | Size | Usage |
|-------|------|-------|
| `gap-1` | 4px | Tight groups |
| `gap-2` | 8px | Related items |
| `gap-3` | 12px | Standard spacing |
| `gap-4` | 16px | Section gaps |
| `gap-6` | 24px | Large sections |

### Padding Patterns

```jsx
// Cards
className="p-4"        // Standard card
className="p-3"        // Compact card
className="p-6"        // Modal content

// Table cells
className="px-4 py-3"  // Header
className="px-4 py-2"  // Body

// Buttons
className="px-5 py-2.5"  // Primary
className="px-4 py-2"    // Secondary
className="px-3 py-1.5"  // Small

// Input fields
className="px-4 py-3"
```

### Section Spacing

```jsx
// Vertical spacing between sections
className="space-y-3 md:space-y-4"

// Grid gaps
className="gap-3"      // Compact
className="gap-4"      // Standard
```

---

## 9. Icon System

### Library

Use [Phosphor Icons](https://phosphoricons.com/) with React:

```bash
npm install @phosphor-icons/react
```

### Default Configuration

```jsx
import { IconContext } from '@phosphor-icons/react'

<IconContext.Provider value={{ size: 20, weight: "thin" }}>
  {children}
</IconContext.Provider>
```

### Size Conventions

| Context | Size | Example |
|---------|------|---------|
| Navigation | 22-24px | `<House size={24} />` |
| Buttons | 18-20px | `<Plus size={18} />` |
| Inline text | 14-16px | `<Check size={14} />` |
| Tiny indicators | 12px | `<Warning size={12} />` |

### Common Icons

```jsx
import { 
  House,           // Dashboard
  FilmStrip,       // Films
  Television,      // Series
  VideoCamera,     // Content
  Lightning,       // Feed/alerts
  Funnel,          // Pipeline
  Gear,            // Settings
  MagnifyingGlass, // Search
  X,               // Close
  Check,           // Success
  Plus,            // Add
  PencilSimple,    // Edit
  Trash,           // Delete
  CaretDown,       // Expand
  CaretRight,      // Collapse
  ArrowSquareOut,  // External link
  Copy,            // Copy
  User,            // User/contact
  ChatCircle,      // Chat/feedback
  SignOut,         // Logout
} from '@phosphor-icons/react'
```

---

## 10. Special Effects

### Noise Texture

```css
.noise-bg::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.10;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='2' intercept='-0.5'/%3E%3CfeFuncG type='linear' slope='2' intercept='-0.5'/%3E%3CfeFuncB type='linear' slope='2.2' intercept='-0.4'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 350px 350px;
  z-index: 0;
}

.noise-bg > *:not([data-modal-root]) {
  position: relative;
  z-index: 1;
}
```

### Gradient Glow

```jsx
<div className="relative">
  {/* Glow layer */}
  <div className="absolute -inset-1 bg-gradient-to-r from-auris-purple/50 via-[#c4a07a]/40 to-auris-orange/50 rounded-lg blur-sm opacity-70" />
  {/* Content */}
  <button className="relative ...">Button</button>
</div>
```

### Backdrop Blur

```jsx
// Modal overlay
className="bg-black/80 backdrop-blur-sm"

// Lighter blur
className="bg-black/30 backdrop-blur-[2px]"
```

### Custom Scrollbar

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-color-light);
}

/* Hide scrollbar */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
```

---

## 11. Skeleton & Loading States

### Base Skeleton

```jsx
const Skeleton = ({ className = '' }) => (
  <div className={`bg-[#1a1a1a] rounded animate-pulse ${className}`} />
)
```

### Shimmer Effect

```css
.animate-shimmer {
  background: linear-gradient(90deg, #1a1a1a 0%, #252525 50%, #1a1a1a 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

### Skeleton Patterns

```jsx
// Text line
<div className="h-4 w-3/4 bg-[#1a1a1a] rounded animate-pulse" />

// Avatar
<div className="w-10 h-10 bg-[#1a1a1a] rounded-full animate-pulse" />

// Card
<div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4">
  <div className="h-4 w-32 bg-[#1a1a1a] rounded animate-pulse mb-2" />
  <div className="h-8 w-16 bg-[#1a1a1a] rounded animate-pulse" />
</div>

// Table row
<div className="flex items-center gap-4 py-3 px-4 border-b border-[#151515]">
  <div className="h-4 w-[30%] bg-[#1a1a1a] rounded animate-pulse" />
  <div className="h-4 w-[15%] bg-[#1a1a1a] rounded animate-pulse" />
  <div className="h-4 w-[15%] bg-[#1a1a1a] rounded animate-pulse" />
</div>
```

---

## 12. Empty & Error States

### Empty State

```jsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  <p className="text-[#555] text-sm">No results found</p>
  <p className="text-[#444] text-xs mt-1">Try adjusting your search</p>
</div>
```

### Error State

```jsx
<div className="flex flex-col items-center justify-center h-full gap-4">
  <div className="text-red-400">Error: {error.message}</div>
  <button 
    onClick={retry}
    className="px-4 py-2 bg-auris-purple text-white rounded-lg hover:bg-auris-purple/80"
  >
    Retry
  </button>
</div>
```

### Loading State

```jsx
<div className="flex items-center justify-center py-8">
  <div className="w-5 h-5 border-2 border-[#333] border-t-white rounded-full animate-spin" />
  <span className="ml-2 text-[#555] text-sm">Loading...</span>
</div>
```

---

## 13. Keyboard Shortcuts

### Global Search

```jsx
useEffect(() => {
  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      setSearchOpen(prev => !prev)
    }
  }
  
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [])
```

### Escape to Close

```jsx
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }
  
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [onClose])
```

---

## Quick Reference

### Essential Imports

```jsx
// Styling
import { motion, AnimatePresence } from 'framer-motion'
import { IconContext } from '@phosphor-icons/react'

// Common icons
import { House, X, Check, Plus, Gear } from '@phosphor-icons/react'
```

### CSS File Setup

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Paste color variables here */
}

/* Paste component classes here */
```

### Package Dependencies

```json
{
  "dependencies": {
    "framer-motion": "^10.x",
    "@phosphor-icons/react": "^2.x",
    "react-markdown": "^9.x"
  },
  "devDependencies": {
    "tailwindcss": "^3.x",
    "postcss": "^8.x",
    "autoprefixer": "^10.x"
  }
}
```

---

## Usage with Cursor AI

To use this style guide in other projects:

1. Copy `STYLE.md` to your new project root
2. Reference it in prompts: `@STYLE.md`
3. Or add to `.cursor/rules/` for automatic inclusion

See the project's `.cursor/rules/` folder for Cursor-specific configuration.
