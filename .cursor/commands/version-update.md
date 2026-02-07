---
description: Bump version and update all feature sections with approval
---

Update Auris Cue Sheets version:

1. Get current version from cue-sheet-app/package.json
2. Increment minor version (0.6.0 -> 0.7.0)
3. Extract git commits since last tag as feature suggestions
4. **STOP and show me the suggested features for approval before proceeding**
5. After I approve, update these 4 files:
   - package.json: version field
   - CHANGELOG.md: new version section at top
   - LoginPage.jsx: VERSION constant + WHATS_NEW array
   - Header.jsx: VERSION_HISTORY array entry

Important:
- Show features BEFORE making any changes
- Wait for my approval or edits
- WHATS_NEW gets short descriptions, VERSION_HISTORY gets longer ones
