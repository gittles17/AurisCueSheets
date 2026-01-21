const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const TICKS_PER_SECOND = 254016000000;

const prprojPath = '/Users/jonathan.gitlin/Desktop/TBY_edt_tv30_Smile_v09_lme_250107_OVC.prproj';

const fileBuffer = fs.readFileSync(prprojPath);

zlib.gunzip(fileBuffer, (err, decompressed) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  const xml = decompressed.toString('utf-8');
  
  // Find ALL Name tags and filter to audio files
  const namePattern = /<Name>([^<]+)<\/Name>/g;
  const audioFiles = new Set();
  let match;
  
  while ((match = namePattern.exec(xml)) !== null) {
    const name = match[1];
    if (name.match(/\.(wav|aif|aiff|mp3|m4a)$/i)) {
      audioFiles.add(name);
    }
  }
  
  console.log('Unique audio files in project:', audioFiles.size);
  console.log('');
  
  // For each audio file, count occurrences
  for (const filename of audioFiles) {
    const escapedName = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('<Name>' + escapedName + '</Name>', 'g');
    const matches = xml.match(regex) || [];
    console.log(filename.substring(0, 55).padEnd(58) + ' x' + matches.length);
  }
  
  console.log('\n--- Trying to link clips to timeline ---\n');
  
  // Look for timeline clip placements with short durations (music/SFX)
  // Find AudioClipTrackItem blocks
  const audioClipPattern = /<AudioClipTrackItem[^>]*>[\s\S]*?<Start>(\d+)<\/Start>[\s\S]*?<End>(\d+)<\/End>[\s\S]*?<SubClip ObjectRef="(\d+)"[\s\S]*?<\/AudioClipTrackItem>/g;
  
  const timelineClips = [];
  while ((match = audioClipPattern.exec(xml)) !== null) {
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    const subClipRef = match[3];
    const durationSec = (end - start) / TICKS_PER_SECOND;
    
    // Only short clips (< 30 seconds, likely music/SFX)
    if (durationSec < 30) {
      timelineClips.push({ start, end, subClipRef, durationSec });
    }
  }
  
  console.log('Short timeline clips (<30s):', timelineClips.length);
  
  // Build SubClip ObjectID -> Clip ObjectRef map
  const subClipToClip = new Map();
  const subClipPattern = /<SubClip[^>]*ObjectID="(\d+)"[^>]*>[\s\S]*?<Clip ObjectRef="(\d+)"\/>/g;
  while ((match = subClipPattern.exec(xml)) !== null) {
    subClipToClip.set(match[1], match[2]);
  }
  console.log('SubClip mappings:', subClipToClip.size);
  
  // Build Clip ObjectID -> Name map
  const clipToName = new Map();
  // Try multiple patterns to find clip names
  const clipNamePattern = /<Clip[^>]*ObjectID="(\d+)"[^>]*>[\s\S]*?<Name>([^<]+)<\/Name>/g;
  while ((match = clipNamePattern.exec(xml)) !== null) {
    clipToName.set(match[1], match[2]);
  }
  console.log('Clip name mappings:', clipToName.size);
  
  // Try to resolve timeline clips to names
  console.log('\n--- Timeline clips resolved ---\n');
  
  // Group by clip name and sum durations
  const clipDurations = new Map();
  
  for (const clip of timelineClips) {
    const clipRef = subClipToClip.get(clip.subClipRef);
    let clipName = clipRef ? clipToName.get(clipRef) : null;
    
    if (!clipName) {
      // Try to find name near the SubClip reference
      const subClipArea = xml.indexOf(`ObjectID="${clip.subClipRef}"`);
      if (subClipArea > 0) {
        const nearbyXml = xml.substring(subClipArea, subClipArea + 2000);
        const nearbyName = nearbyXml.match(/<Name>([^<]+\.(wav|aif|aiff|mp3))<\/Name>/i);
        if (nearbyName) clipName = nearbyName[1];
      }
    }
    
    if (clipName) {
      const current = clipDurations.get(clipName) || { count: 0, totalSec: 0 };
      current.count++;
      current.totalSec += clip.durationSec;
      clipDurations.set(clipName, current);
    }
  }
  
  console.log('Clip durations (short clips only):');
  for (const [name, data] of clipDurations) {
    const shortName = name.substring(0, 50).padEnd(52);
    console.log(`  ${shortName} ${data.count}x = ${data.totalSec.toFixed(2)}s`);
  }
});
