#!/usr/bin/env node
/**
 * afterPack hook for electron-builder
 * Removes extended attributes and signs all binaries in correct order
 * Required because iCloud Desktop adds protected xattrs that break codesign
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const IDENTITY = 'Developer ID Application: Jonathan Gitlin (YP6TURPH32)';

function runCommand(cmd, description) {
  console.log(`  ${description}...`);
  try {
    execSync(cmd, { stdio: 'pipe' });
  } catch (error) {
    // Some commands may fail on non-existent files, that's ok
    console.log(`    Warning: ${error.message}`);
  }
}

function signBinary(filePath, entitlements = null) {
  const entitlementsArg = entitlements ? `--entitlements "${entitlements}"` : '';
  const cmd = `codesign --force --timestamp --options runtime --sign "${IDENTITY}" ${entitlementsArg} "${filePath}"`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`    Signed: ${path.basename(filePath)}`);
  } catch (error) {
    console.error(`    Failed to sign ${filePath}: ${error.message}`);
    throw error;
  }
}

function findFiles(dir, pattern) {
  const results = [];
  try {
    const output = execSync(`find "${dir}" -name "${pattern}" -type f 2>/dev/null`, { encoding: 'utf8' });
    results.push(...output.trim().split('\n').filter(Boolean));
  } catch (e) {
    // No matches found
  }
  return results;
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName } = context;
  
  if (electronPlatformName !== 'darwin') {
    return;
  }
  
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  const entitlements = path.resolve(__dirname, '../build/entitlements.mac.plist');
  
  console.log('\n=== afterPack: Preparing app for signing ===');
  console.log(`App: ${appPath}`);
  
  // Step 1: Remove extended attributes (may not work fully on iCloud, but try)
  console.log('\n1. Removing extended attributes...');
  runCommand(`xattr -cr "${appPath}" 2>/dev/null || true`, 'Clearing xattrs');
  
  // Step 2: Sign all dylibs first (innermost dependencies)
  console.log('\n2. Signing dynamic libraries...');
  const dylibs = findFiles(appPath, '*.dylib');
  for (const dylib of dylibs) {
    signBinary(dylib);
  }
  
  // Step 3: Sign .so files if any
  console.log('\n3. Signing .so files...');
  const soFiles = findFiles(appPath, '*.so');
  for (const so of soFiles) {
    signBinary(so);
  }
  
  // Step 4: Sign standalone executables inside frameworks
  console.log('\n4. Signing standalone executables...');
  const crashpadHandler = path.join(appPath, 'Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler');
  const shipIt = path.join(appPath, 'Contents/Frameworks/Squirrel.framework/Versions/A/Resources/ShipIt');
  
  if (fs.existsSync(crashpadHandler)) {
    signBinary(crashpadHandler);
  }
  if (fs.existsSync(shipIt)) {
    signBinary(shipIt);
  }
  
  // Step 5: Sign frameworks (after their contents)
  console.log('\n5. Signing frameworks...');
  const frameworks = [
    'Electron Framework.framework',
    'ReactiveObjC.framework',
    'Mantle.framework',
    'Squirrel.framework'
  ];
  
  for (const fw of frameworks) {
    const fwPath = path.join(appPath, 'Contents/Frameworks', fw);
    if (fs.existsSync(fwPath)) {
      signBinary(fwPath);
    }
  }
  
  // Step 6: Sign helper apps
  console.log('\n6. Signing helper apps...');
  const helpers = [
    `${appName} Helper.app`,
    `${appName} Helper (GPU).app`,
    `${appName} Helper (Plugin).app`,
    `${appName} Helper (Renderer).app`
  ];
  
  for (const helper of helpers) {
    const helperPath = path.join(appPath, 'Contents/Frameworks', helper);
    if (fs.existsSync(helperPath)) {
      signBinary(helperPath, entitlements);
    }
  }
  
  // Step 7: Sign the main app bundle
  console.log('\n7. Signing main app bundle...');
  signBinary(appPath, entitlements);
  
  // Step 8: Verify signature
  console.log('\n8. Verifying signature...');
  try {
    execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'pipe' });
    console.log('  Signature verification PASSED');
  } catch (error) {
    console.error('  Signature verification FAILED:', error.message);
    throw new Error('Code signing verification failed');
  }
  
  console.log('\n=== afterPack complete ===\n');
};
