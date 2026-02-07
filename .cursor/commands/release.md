---
description: Build, sign, and release to GitHub with auto-update support
---

Build and release Auris Cue Sheets:

1. Build frontend: `npm run build` in cue-sheet-app
2. Run electron-builder: `npx electron-builder --publish=never`
3. Submit for notarization if APPLE_ID/APPLE_APP_PASSWORD/APPLE_TEAM_ID are set
4. Generate latest-mac.yml for the ZIP file (required for auto-update)
5. Create GitHub Release via API using GH_TOKEN
6. Upload DMG, ZIP, and latest-mac.yml to the release

Output directory: /tmp/auris-build/

Required: GH_TOKEN environment variable
Optional: APPLE_ID, APPLE_APP_PASSWORD, APPLE_TEAM_ID for notarization
