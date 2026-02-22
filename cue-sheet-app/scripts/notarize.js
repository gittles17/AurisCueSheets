#!/usr/bin/env node
/**
 * Notarization script for macOS
 * 
 * This script is called automatically by electron-builder after signing.
 * It submits the app to Apple for notarization.
 * 
 * Required environment variables:
 *   APPLE_ID          - Your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD - App-specific password (NOT your Apple ID password)
 *   APPLE_TEAM_ID     - Your Apple Developer Team ID
 */

const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization - not a macOS build');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appName}...`);
  console.log(`App path: ${appPath}`);

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      keychainProfile: 'AurisCueSheets',
    });
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
