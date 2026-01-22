# Changelog

All notable changes to Auris Cue Sheets will be documented in this file.

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
