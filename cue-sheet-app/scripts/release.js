#!/usr/bin/env node
/**
 * Auris Cue Sheets Release Script
 * 
 * Usage: node scripts/release.js <version> "<feature1>" "<feature2>" "<feature3>"
 * Example: node scripts/release.js 0.4 "New Feature One" "Bug fixes" "Performance improvements"
 * 
 * This script will:
 * 1. Update version in package.json
 * 2. Update version info in Header.jsx, LoginPage.jsx, SettingsModal.jsx
 * 3. Build the app
 * 4. Generate latest-mac.yml
 * 5. Commit, tag, and push to GitHub
 * 6. Create GitHub release and upload assets
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Configuration
const GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const REPO_OWNER = 'gittles17';
const REPO_NAME = 'AurisCueSheets';

// Paths
const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT_DIR, 'package.json');
const HEADER_JSX = path.join(ROOT_DIR, 'src/components/Header.jsx');
const LOGIN_PAGE_JSX = path.join(ROOT_DIR, 'src/components/LoginPage.jsx');
const SETTINGS_MODAL_JSX = path.join(ROOT_DIR, 'src/components/SettingsModal.jsx');
const DIST_DIR = path.join(ROOT_DIR, 'dist-electron');

function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { 
    cwd: ROOT_DIR, 
    stdio: options.silent ? 'pipe' : 'inherit',
    encoding: 'utf8',
    ...options 
  });
}

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function getMonthYear() {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const now = new Date();
  return `${months[now.getMonth()]} ${now.getFullYear()}`;
}

function updatePackageJson(version) {
  console.log('\n📦 Updating package.json...');
  const pkg = JSON.parse(readFile(PACKAGE_JSON));
  pkg.version = `${version}.0`;
  writeFile(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
}

function updateHeaderJsx(version, features) {
  console.log('\n📝 Updating Header.jsx...');
  let content = readFile(HEADER_JSX);
  
  // Find VERSION_HISTORY and add new version at top
  const newEntry = `  {
    version: 'v${version}',
    date: '${getMonthYear()}',
    features: [
      { title: '${features[0] || 'New Features'}', description: '${features[0] || 'New features and improvements'}', icon: CheckCircle },
      { title: '${features[1] || 'Improvements'}', description: '${features[1] || 'Various improvements and bug fixes'}', icon: CheckCircle },
      { title: '${features[2] || 'Bug Fixes'}', description: '${features[2] || 'Bug fixes and stability improvements'}', icon: CheckCircle },
    ]
  },`;
  
  // Insert after VERSION_HISTORY = [
  content = content.replace(
    /const VERSION_HISTORY = \[\n/,
    `const VERSION_HISTORY = [\n${newEntry}\n`
  );
  
  writeFile(HEADER_JSX, content);
}

function updateLoginPageJsx(version, features) {
  console.log('\n📝 Updating LoginPage.jsx...');
  let content = readFile(LOGIN_PAGE_JSX);
  
  // Update VERSION
  content = content.replace(
    /const VERSION = 'v[\d.]+';/,
    `const VERSION = 'v${version}';`
  );
  
  // Update WHATS_NEW
  const newWhatsNew = `const WHATS_NEW = [
  { title: '${features[0] || 'New Features'}', description: '${features[0] || 'New features and improvements'}' },
  { title: '${features[1] || 'Improvements'}', description: '${features[1] || 'Various improvements'}' },
  { title: '${features[2] || 'Bug Fixes'}', description: '${features[2] || 'Bug fixes and stability'}' },
];`;
  
  content = content.replace(
    /const WHATS_NEW = \[[\s\S]*?\];/,
    newWhatsNew
  );
  
  writeFile(LOGIN_PAGE_JSX, content);
}

function updateSettingsModalJsx(version) {
  console.log('\n📝 Updating SettingsModal.jsx...');
  let content = readFile(SETTINGS_MODAL_JSX);
  
  content = content.replace(
    /Version [\d.]+/,
    `Version ${version}.0`
  );
  
  writeFile(SETTINGS_MODAL_JSX, content);
}

function buildApp() {
  console.log('\n🔨 Building app...');
  run('npm run build');
  run('npx electron-builder --publish=never');
}

function generateLatestMacYml(version) {
  console.log('\n📄 Generating latest-mac.yml...');
  
  const dmgPath = path.join(DIST_DIR, `Auris Cue Sheets-v${version}.0-arm64.dmg`);
  
  if (!fs.existsSync(dmgPath)) {
    throw new Error(`DMG not found: ${dmgPath}`);
  }
  
  // Get file size
  const stats = fs.statSync(dmgPath);
  const size = stats.size;
  
  // Generate SHA512
  const sha512 = run(`shasum -a 512 "${dmgPath}" | awk '{print $1}' | xxd -r -p | base64`, { silent: true }).trim();
  
  const yml = `version: ${version}.0
files:
  - url: Auris-Cue-Sheets-v${version}.0-arm64.dmg
    sha512: ${sha512}
    size: ${size}
path: Auris-Cue-Sheets-v${version}.0-arm64.dmg
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;
  
  writeFile(path.join(DIST_DIR, 'latest-mac.yml'), yml);
  return { sha512, size };
}

function gitCommitAndTag(version) {
  console.log('\n📤 Committing and tagging...');
  run('git add -A');
  run(`git commit -m "Release v${version}"`);
  run(`git tag -f v${version}`);
  run('git push origin main');
  run(`git push origin v${version} --force`);
}

async function createGitHubRelease(version, features) {
  console.log('\n🚀 Creating GitHub release...');
  
  if (!GITHUB_TOKEN) {
    console.error('❌ GitHub token not found. Set GH_TOKEN or GITHUB_TOKEN environment variable.');
    console.log('   You can manually create the release at:');
    console.log(`   https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/new?tag=v${version}`);
    return null;
  }
  
  const body = `## Auris Cue Sheets v${version}

### New Features
- **${features[0] || 'New Features'}**
- **${features[1] || 'Improvements'}**
- **${features[2] || 'Bug Fixes'}**

### Installation
1. Download the DMG file below
2. Open the DMG and drag Auris Cue Sheets to Applications
3. Right-click the app and select Open (required for first launch on macOS)`;

  const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tag_name: `v${version}`,
      name: `v${version}`,
      body: body,
      draft: false,
      prerelease: false
    })
  });
  
  const release = await response.json();
  return release.id;
}

async function uploadReleaseAsset(releaseId, filePath, fileName) {
  console.log(`   Uploading ${fileName}...`);
  
  const fileContent = fs.readFileSync(filePath);
  const contentType = fileName.endsWith('.yml') ? 'text/yaml' : 'application/octet-stream';
  
  await fetch(`https://uploads.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`, {
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': contentType,
      'Content-Length': fileContent.length
    },
    body: fileContent
  });
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log(`
Auris Cue Sheets Release Script

Usage: node scripts/release.js <version> "<feature1>" "<feature2>" "<feature3>"

Example:
  node scripts/release.js 0.4 "Import Wizard" "Auto-Update System" "Performance improvements"

Environment:
  GH_TOKEN or GITHUB_TOKEN - GitHub personal access token for creating releases
`);
    process.exit(1);
  }
  
  const version = args[0];
  const features = args.slice(1);
  
  console.log(`\n🎉 Releasing Auris Cue Sheets v${version}`);
  console.log(`   Features: ${features.join(', ') || '(none specified)'}`);
  
  try {
    // 1. Update version files
    updatePackageJson(version);
    updateHeaderJsx(version, features);
    updateLoginPageJsx(version, features);
    updateSettingsModalJsx(version);
    
    // 2. Build
    buildApp();
    
    // 3. Generate latest-mac.yml
    generateLatestMacYml(version);
    
    // 4. Git commit and tag
    gitCommitAndTag(version);
    
    // 5. Create GitHub release
    const releaseId = await createGitHubRelease(version, features);
    
    if (releaseId) {
      // 6. Upload assets
      console.log('\n📎 Uploading release assets...');
      const dmgPath = path.join(DIST_DIR, `Auris Cue Sheets-v${version}.0-arm64.dmg`);
      const ymlPath = path.join(DIST_DIR, 'latest-mac.yml');
      
      await uploadReleaseAsset(releaseId, dmgPath, `Auris-Cue-Sheets-v${version}.0-arm64.dmg`);
      await uploadReleaseAsset(releaseId, ymlPath, 'latest-mac.yml');
    }
    
    console.log(`\n✅ Release v${version} complete!`);
    console.log(`   https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/v${version}`);
    
  } catch (error) {
    console.error('\n❌ Release failed:', error.message);
    process.exit(1);
  }
}

main();
