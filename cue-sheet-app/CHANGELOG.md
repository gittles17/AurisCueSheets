# Changelog

All notable changes to Auris Cue Sheets will be documented in this file.

## [0.13.0] - February 2026

### Fixed
- **Delete Key Reliability** - Delete/Backspace now reliably clears selected cells on the first keypress. Previously required multiple presses due to a focus management bug where `event.preventDefault()` blocked keyboard focus from reaching the table.

---

## [0.12.0] - February 2026

### Added
- **Open Project Supports .prproj** - The Open Project dialog now accepts both .acs and .prproj files. Selecting a Premiere Pro project triggers the Import Wizard automatically.
- **Network Volume Browsing** - The Open Project file browser can now navigate to and open files from mounted server and network drives.

---

## [0.11.0] - February 2026

### Added
- **Apple Notarization** - App is now code-signed and notarized by Apple. Users can double-click to open without any Terminal workarounds.
- **Feedback System Fix** - User feedback now reliably saves to the cloud and appears in the admin panel.

### Changed
- Release script automatically includes correct installation instructions based on whether the build is signed or unsigned.

---

## [0.10.0] - February 2026

### Added
- **Network Volume Search** - When a file isn't found locally, the app recursively searches all mounted volumes under /Volumes/ to find .prproj files on network drives

### Fixed
- Fixed exceljs crash on launch (pinned to v4.3.0 to resolve missing entry point in v4.4.0)
- Improved error messages for file-not-found to suggest using File > Open or copying locally

### Installation Note

The app is not notarized, so macOS will block it on first launch. To fix this, run the following in Terminal after installing:

```bash
xattr -cr "/Applications/Auris Cue Sheets.app"
```

---

## [0.9.0] - February 2026

### Added
- **SMB/Network Drive Support** - Import .prproj files directly from SMB and network drives without copying locally first
- **Security-Scoped Bookmarks** - Persistent file access for network volumes through macOS security-scoped bookmarks
- **Network Path Normalization** - Automatic handling of file://, smb://, and URL-encoded paths

### Changed
- Added network server and bookmark entitlements for macOS
- File open dialog now supports security-scoped bookmarks for network files

### Fixed
- File not found error when importing .prproj files from network/SMB drives
- Drop handler now uses URI list fallback when file.path is unavailable from network sources

---

## [0.8.0] - February 2026

### Added
- **Downloads Folder Import Support** - Import .prproj files dragged from the Downloads folder (previously only searched Desktop and Documents)
- **Graceful Unsigned Builds** - afterPack.js detects if signing certificate is missing and builds unsigned instead of failing

### Fixed
- File not found error when importing .prproj files from Downloads
- Build failure on machines without Apple signing certificate

---

## [0.7.0] - January 2026

### Added
- **Streamlined API Setup** - Add API sources with keys in one step. No more confusing two-step setup process.
- **Custom API Sources** - Custom sources with API keys are automatically marked as connected after setup.
- **Quick Access Header** - Gear icon for Settings and chat icon for Feedback now appear in the top right header.

---

## [0.6.0] - January 2026

### Added
- **Native macOS Menu Bar** - Full File, Edit, View, Window, and Help menus with standard keyboard shortcuts (Cmd+N, Cmd+O, Cmd+S, Cmd+E, etc.)
- **Table Virtualization** - react-window integration for smooth scrolling with large cue sheets (500+ tracks)
- **Lazy Loading** - Heavy components (Settings, Browser, Chat, Import Wizard) load on-demand for faster startup
- **Debounced Selection** - Smoother cell selection during drag operations with RAF-based updates

### Changed
- Initial load time reduced by ~178 KB through code splitting
- Auto-save now uses stable refs to prevent unnecessary effect re-runs
- Improved memory usage when scrolling large tables

### Fixed
- Cell selection lag during rapid mouse movements
- Unnecessary re-renders during auto-save debounce

---

## [0.5.0] - January 2026

### Added
- **Smart Fill in Sidebar** - Moved AI-powered field fill UI from floating modal to right sidebar Actions panel for better workflow integration

### Changed
- Smart Fill panel now appears inline under Actions when AI mode is enabled and cells are selected
- Smart Fill now respects column selection - only suggests for the field(s) you actually selected, not all empty fields
- Simplified Smart Fill UI - one-click suggestions, auto-learns patterns, removed confusing checkboxes and percentages

### Fixed
- Delete/Backspace now correctly clears all selected cells at once
- Single-click now only selects cells; double-click to edit (was entering edit mode on single click, blocking delete)
- Click-and-drag cell selection now works properly (background click handler was clearing selection after drag)

---

## [0.4.0] - January 2026

### Added
- **Import Wizard** - Step-by-step guided import for Premiere Pro projects with clip review, categorization, and stem grouping
- **Import Progress Indicator** - Real-time 8-step progress bar during project analysis (no more spinning beach ball)
- **AI-Assisted Classification** - Hybrid approach using fast pattern matching with targeted Opus AI for ambiguous clips
- **Confidence Scoring** - Visual confidence badges on track classifications
- **Stem Grouping** - Auto-detect and group stem files under parent tracks with drag-and-drop merge/ungroup
- **Learning System** - Wizard learns from corrections to improve future imports
- **Auto-Update System** - App automatically checks for and downloads updates in background
- **Batch Action Bar** - Always-visible action bar with smooth opacity transitions (no layout shifts)
- **Fixed Row Heights** - 48px table rows prevent layout jumping during interactions

### Changed
- Simplified step indicator to minimal horizontal dots/line design
- Applied JetBrains Mono font to all numerical data (counts, percentages, durations)
- Updated color scheme to use Auris accent colors (green/blue/purple/orange)
- Improved footer button hierarchy (ghost/secondary/primary)

### Fixed
- Memory leak in progress listener accumulation
- Race condition on unmounted component state updates
- Progress bar now correctly starts at 0% instead of 12.5%

## [0.3.0] - January 2026

### Added
- Cloud track database with Supabase integration
- Pattern learning engine for auto-fill suggestions
- Voyage AI semantic search for track matching
- Admin mode for managing cloud data sources
- Feedback system for user suggestions and bug reports
- Auris Chat AI assistant for cue sheet help

### Changed
- Migrated from local SQLite to cloud-first architecture
- Improved BMG lookup with multiple search strategies

## [0.2.0] - December 2025

### Added
- PRO lookup (BMI/ASCAP) for composer and publisher data
- iTunes search integration for artist verification
- Batch lookup for processing multiple tracks at once
- Contact database import from Excel/CSV

### Changed
- Improved Excel export formatting
- Better handling of stem files in duration calculation

## [0.1.0] - November 2025

### Added
- Initial release
- Parse Premiere Pro .prproj files
- Extract audio clips and timeline durations
- BMG Production Music lookup
- Excel cue sheet export
- Dark theme UI with Auris branding
