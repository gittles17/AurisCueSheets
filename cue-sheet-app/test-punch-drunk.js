/**
 * Test script to repeatedly run Smart Lookup on Punch Drunk until successful
 */

const path = require('path');

// Mock electron app for testing outside Electron
const mockApp = {
  getPath: (name) => {
    if (name === 'userData') return path.join(__dirname, 'test-data');
    return __dirname;
  }
};

// Inject mock before requiring modules
require('electron').app = mockApp;

async function runTest() {
  const { startBatchLookup } = require('./electron/batch-lookup');
  
  const testTrack = {
    id: 'test-1',
    trackName: 'Punch Drunk',
    originalName: 'RISERS DROPS mx BMGPM IATS021 Punch Drunk',
    duration: '0:30',
    artist: 'BMG',
    catalogCode: 'IATS021'
  };
  
  console.log('\n========================================');
  console.log('Testing Smart Lookup for: Punch Drunk');
  console.log('========================================\n');
  
  let attempt = 0;
  const maxAttempts = 5;
  
  while (attempt < maxAttempts) {
    attempt++;
    console.log(`\n--- Attempt ${attempt}/${maxAttempts} ---\n`);
    
    try {
      const results = await startBatchLookup([testTrack]);
      
      if (results && results.length > 0) {
        const result = results[0];
        console.log('\n--- RESULT ---');
        console.log('Success:', result.success);
        console.log('Confidence:', result.confidence?.label, `(${Math.round((result.confidenceScore || 0) * 100)}%)`);
        console.log('Error:', result.error || 'none');
        
        if (result.extractedData) {
          console.log('\nExtracted Data:');
          console.log('  Track:', result.extractedData.trackName);
          console.log('  Composer:', result.extractedData.composer);
          console.log('  Publisher:', result.extractedData.publisher);
          console.log('  Album:', result.extractedData.album);
          console.log('  Label:', result.extractedData.label);
          console.log('  Master:', result.extractedData.masterContact);
          console.log('  Catalog:', result.extractedData.catalogCode);
        }
        
        // Check if we got good data
        const hasComposer = result.extractedData?.composer && result.extractedData.composer.length > 2;
        const hasPublisher = result.extractedData?.publisher && result.extractedData.publisher.length > 2;
        
        if (hasComposer && hasPublisher) {
          console.log('\n*** SUCCESS! All required fields filled ***\n');
          break;
        } else {
          console.log('\n*** Missing fields, will retry... ***');
        }
      } else {
        console.log('No results returned');
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
    
    // Wait before retry
    console.log('Waiting 3 seconds before retry...');
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log('\n========================================');
  console.log('Test complete');
  console.log('========================================\n');
  
  process.exit(0);
}

runTest().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
