# Auris Cue Sheets

Automated cue sheet generator for Adobe Premiere Pro projects. Extract music and sound effect information from .prproj files and export formatted Excel cue sheets.

## Features

- **Parse .prproj Files** - Extract audio clips and timeline durations from Premiere Pro projects
- **Auto-Lookup Metadata** - Search BMG Production Music and other libraries for track information
- **Contact Database** - Built-in contacts for major music libraries, plus custom contact import
- **Excel Export** - Generate formatted cue sheets matching your template
- **Auris Design System** - Clean, dark-themed UI with the Auris visual identity

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
cd cue-sheet-app
npm install
```

### Development

Run the app in development mode:

```bash
npm run electron:dev
```

This starts both the Vite dev server and Electron.

### Building

Create a production build:

```bash
npm run electron:build
```

The built app will be in `dist-electron/`.

## Usage

1. **Open a Project** - Drag and drop a .prproj file or click "Browse Files"
2. **Review Cues** - Edit any fields by clicking on them
3. **Auto-Lookup** - Click "Auto-Lookup All" to search for metadata
4. **Import Contacts** - Add your own contact database from an Excel/CSV file
5. **Export** - Generate the final Excel cue sheet

## Project Info Fields

- **Project** - The main project/show name
- **Spot Title** - Title of this specific spot/trailer
- **Type** - Format code (e.g., TV10, TV30)
- **Date Prepared** - Date the cue sheet was created

## Contact Import Format

Import contacts from Excel (.xlsx) or CSV with these columns:

| Library Name | Contact Email |
|--------------|---------------|
| My Library   | contact@example.com |

## Built-in Library Support

- BMG Production Music
- APM Music
- Extreme Music
- Universal Production Music
- Musicbed
- Artlist
- Epidemic Sound
- AudioJungle

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI components
- **Tailwind CSS** - Styling with Auris design tokens
- **Vite** - Build tool
- **ExcelJS** - Excel file generation
- **fast-xml-parser** - Parse Premiere Pro XML
- **music-metadata** - Audio file metadata reading

## File Structure

```
cue-sheet-app/
├── electron/
│   ├── main.js          # Electron main process
│   ├── preload.js       # Context bridge
│   ├── contacts.js      # Contact database
│   ├── metadata.js      # Audio metadata reader
│   └── bmg-lookup.js    # BMG API lookup
├── src/
│   ├── App.jsx          # Main React component
│   ├── index.css        # Tailwind + custom styles
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── DropZone.jsx
│   │   ├── CueTable.jsx
│   │   └── Sidebar.jsx
│   └── hooks/
│       └── useCueSheet.js
├── public/
│   └── fonts/           # Alpha Lyrae display font
└── package.json
```

## License

Proprietary - Auris
