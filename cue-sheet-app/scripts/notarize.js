#!/usr/bin/env node
/**
 * Notarization script for macOS
 * 
 * This script is called automatically by electron-builder after signing.
 * It submits the app to Apple for notarization.
 * 
 * Required environment variables:
 *   APPLE_ID          - Your Apple ID email
 *   APPLE_APP_PASSWORD - App-specific password (NOT your Apple ID password)
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

  // Skip if not signing (e.g., local dev builds)
  if (!process.env.APPLE_ID || !process.env.APPLE_APP_PASSWORD || !process.env.APPLE_TEAM_ID) {
    console.log('Skipping notarization - Apple credentials not configured');
    console.log('Set APPLE_ID, APPLE_APP_PASSWORD, and APPLE_TEAM_ID to enable notarization');
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
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });
    console.log('Notarization complete!');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
};
