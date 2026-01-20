/**
 * Puppeteer Scraper - Browser automation for music database lookups
 * 
 * Features:
 * - Visible browser mode for manual intervention
 * - Auto-scraping with intelligent waiting
 * - Manual takeover when automation fails
 * - Multi-site support (BMG, PRO databases)
 */

const { BrowserWindow, ipcMain, app } = require('electron');
const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e) {
  console.log('[Puppeteer] puppeteer-core not installed');
  puppeteer = null;
}

// Track active browser instances
let activeBrowser = null;
let activePage = null;
let browserWindow = null;
let isManualMode = false;

/**
 * Find Chrome/Chromium executable
 */
function findChromePath() {
  const platform = process.platform;
  
  const possiblePaths = {
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
    ],
    win32: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ]
  };
  
  const fs = require('fs');
  const paths = possiblePaths[platform] || [];
  
  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  return null;
}

/**
 * Initialize browser (hidden by default)
 */
async function initBrowser(visible = false) {
  if (!puppeteer) {
    throw new Error('Puppeteer not available. Install puppeteer-core.');
  }

  if (activeBrowser) {
    return activeBrowser;
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('Chrome/Chromium not found. Please install Google Chrome.');
  }

  console.log('[Puppeteer] Launching browser...');
  
  activeBrowser = await puppeteer.launch({
    executablePath: chromePath,
    headless: !visible, // 'new' for new headless mode, false for visible
    defaultViewport: { width: 1200, height: 800 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--disable-default-apps'
    ]
  });

  activePage = await activeBrowser.newPage();
  
  // Set user agent to avoid detection
  await activePage.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Handle browser close
  activeBrowser.on('disconnected', () => {
    console.log('[Puppeteer] Browser disconnected');
    activeBrowser = null;
    activePage = null;
    isManualMode = false;
  });

  return activeBrowser;
}

/**
 * Close browser
 */
async function closeBrowser() {
  if (activeBrowser) {
    await activeBrowser.close();
    activeBrowser = null;
    activePage = null;
    isManualMode = false;
  }
}

/**
 * Show browser for manual intervention
 */
async function showBrowserForManual(url, trackInfo = {}) {
  // Close any existing browser
  await closeBrowser();
  
  // Launch visible browser
  await initBrowser(true);
  
  if (url) {
    await activePage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  }
  
  isManualMode = true;
  
  return {
    success: true,
    message: 'Browser opened for manual lookup',
    trackInfo
  };
}

/**
 * Search BMG Production Music website
 */
async function searchBMG(trackName) {
  const BMG_SEARCH_URL = 'https://www.bmgproductionmusic.com/en/search';
  
  try {
    await initBrowser(false);
    
    console.log(`[BMG Scraper] Searching for: ${trackName}`);
    
    // Navigate to search page
    await activePage.goto(BMG_SEARCH_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for search input
    await activePage.waitForSelector('input[type="search"], input[name="q"], .search-input', { timeout: 10000 });
    
    // Type search query
    const searchInput = await activePage.$('input[type="search"], input[name="q"], .search-input');
    if (searchInput) {
      await searchInput.click({ clickCount: 3 });
      await searchInput.type(trackName, { delay: 50 });
      await activePage.keyboard.press('Enter');
      
      // Wait for results
      await activePage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Extract results
      const results = await extractBMGResults();
      
      return {
        success: true,
        results,
        url: activePage.url()
      };
    }
    
    return { success: false, error: 'Search input not found' };
  } catch (error) {
    console.error('[BMG Scraper] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Extract results from BMG search page
 */
async function extractBMGResults() {
  if (!activePage) return [];
  
  try {
    // Wait for results to load
    await activePage.waitForSelector('.track-item, .search-result, .track-row', { timeout: 5000 }).catch(() => {});
    
    const results = await activePage.evaluate(() => {
      const tracks = [];
      
      // Try different selectors that BMG might use
      const trackElements = document.querySelectorAll('.track-item, .search-result, .track-row, [data-track]');
      
      trackElements.forEach((el, index) => {
        if (index >= 20) return; // Limit results
        
        const track = {
          trackName: '',
          artist: '',
          album: '',
          catalog: '',
          composers: [],
          publishers: [],
          duration: ''
        };
        
        // Extract track name
        const nameEl = el.querySelector('.track-name, .track-title, h3, h4');
        if (nameEl) track.trackName = nameEl.textContent.trim();
        
        // Extract artist/library
        const artistEl = el.querySelector('.artist, .library, .track-artist');
        if (artistEl) track.artist = artistEl.textContent.trim();
        
        // Extract album/catalog
        const albumEl = el.querySelector('.album, .catalog, .track-album');
        if (albumEl) track.album = albumEl.textContent.trim();
        
        // Extract composers
        const composerEls = el.querySelectorAll('.composer, .writer, [data-composer]');
        composerEls.forEach(c => {
          const text = c.textContent.trim();
          if (text) track.composers.push(text);
        });
        
        // Extract publishers
        const publisherEls = el.querySelectorAll('.publisher, [data-publisher]');
        publisherEls.forEach(p => {
          const text = p.textContent.trim();
          if (text) track.publishers.push(text);
        });
        
        // Extract duration
        const durationEl = el.querySelector('.duration, .time, .track-duration');
        if (durationEl) track.duration = durationEl.textContent.trim();
        
        if (track.trackName) {
          tracks.push(track);
        }
      });
      
      return tracks;
    });
    
    return results;
  } catch (error) {
    console.error('[BMG Scraper] Extract error:', error.message);
    return [];
  }
}

/**
 * Search BMI Repertoire
 */
async function searchBMIRepertoire(trackName, writerName = '') {
  const BMI_URL = 'https://repertoire.bmi.com/Search/Search';
  
  try {
    await initBrowser(false);
    
    console.log(`[BMI Scraper] Searching for: ${trackName}`);
    
    await activePage.goto(BMI_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Select "Title" search type
    await activePage.waitForSelector('select, #SearchType', { timeout: 5000 });
    await activePage.select('select#SearchType, [name="SearchType"]', 'Title').catch(() => {});
    
    // Enter track name
    const searchInput = await activePage.$('input[name="SearchTerm"], #SearchTerm, input[type="text"]');
    if (searchInput) {
      await searchInput.click({ clickCount: 3 });
      await searchInput.type(trackName, { delay: 30 });
      
      // Click search button
      const searchBtn = await activePage.$('button[type="submit"], input[type="submit"], .search-btn');
      if (searchBtn) {
        await searchBtn.click();
        await activePage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Extract results
      const results = await extractBMIResults();
      
      return {
        success: true,
        results,
        url: activePage.url()
      };
    }
    
    return { success: false, error: 'Search input not found' };
  } catch (error) {
    console.error('[BMI Scraper] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Extract results from BMI search
 */
async function extractBMIResults() {
  if (!activePage) return [];
  
  try {
    await activePage.waitForSelector('.songView, .result-row, table tbody tr', { timeout: 5000 }).catch(() => {});
    
    const results = await activePage.evaluate(() => {
      const tracks = [];
      const rows = document.querySelectorAll('.songView, .result-row, table tbody tr');
      
      rows.forEach((row, index) => {
        if (index >= 20) return;
        
        const track = {
          title: '',
          writers: [],
          publishers: [],
          workNumber: ''
        };
        
        // Extract title
        const titleEl = row.querySelector('.title, td:first-child, a');
        if (titleEl) track.title = titleEl.textContent.trim();
        
        // Extract writers
        const writerEls = row.querySelectorAll('.writer, .composer, td:nth-child(2)');
        writerEls.forEach(w => {
          const text = w.textContent.trim();
          if (text && !text.includes('Publisher')) track.writers.push(text);
        });
        
        // Extract work number
        const workEl = row.querySelector('.work-number, td:last-child');
        if (workEl) {
          const match = workEl.textContent.match(/\d{6,}/);
          if (match) track.workNumber = match[0];
        }
        
        if (track.title) {
          tracks.push(track);
        }
      });
      
      return tracks;
    });
    
    return results;
  } catch (error) {
    return [];
  }
}

/**
 * Search ASCAP Repertoire
 */
async function searchASCAPRepertoire(trackName, writerName = '') {
  const ASCAP_URL = 'https://www.ascap.com/repertory';
  
  try {
    await initBrowser(false);
    
    console.log(`[ASCAP Scraper] Searching for: ${trackName}`);
    
    await activePage.goto(ASCAP_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait for and fill search
    await activePage.waitForSelector('input[type="text"], #searchText', { timeout: 5000 });
    
    const searchInput = await activePage.$('input[type="text"], #searchText');
    if (searchInput) {
      await searchInput.click({ clickCount: 3 });
      await searchInput.type(trackName, { delay: 30 });
      await activePage.keyboard.press('Enter');
      
      await activePage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const results = await extractASCAPResults();
      
      return {
        success: true,
        results,
        url: activePage.url()
      };
    }
    
    return { success: false, error: 'Search input not found' };
  } catch (error) {
    console.error('[ASCAP Scraper] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Extract results from ASCAP
 */
async function extractASCAPResults() {
  if (!activePage) return [];
  
  try {
    await activePage.waitForSelector('.result, .work-result, table tbody tr', { timeout: 5000 }).catch(() => {});
    
    const results = await activePage.evaluate(() => {
      const tracks = [];
      const rows = document.querySelectorAll('.result, .work-result, table tbody tr, [data-work]');
      
      rows.forEach((row, index) => {
        if (index >= 20) return;
        
        const track = {
          title: '',
          writers: [],
          publishers: [],
          workId: ''
        };
        
        const titleEl = row.querySelector('.title, td:first-child, h3');
        if (titleEl) track.title = titleEl.textContent.trim();
        
        const writerEls = row.querySelectorAll('.writer, .creator');
        writerEls.forEach(w => {
          track.writers.push(w.textContent.trim());
        });
        
        if (track.title) {
          tracks.push(track);
        }
      });
      
      return tracks;
    });
    
    return results;
  } catch (error) {
    return [];
  }
}

/**
 * Get current page URL
 */
function getCurrentUrl() {
  return activePage ? activePage.url() : null;
}

/**
 * Check if browser is active
 */
function isBrowserActive() {
  return activeBrowser !== null && activePage !== null;
}

/**
 * Check if in manual mode
 */
function isInManualMode() {
  return isManualMode;
}

/**
 * Get page content for manual data extraction
 */
async function getPageContent() {
  if (!activePage) return null;
  
  return activePage.evaluate(() => {
    return {
      url: window.location.href,
      title: document.title,
      body: document.body.innerText.substring(0, 10000)
    };
  });
}

/**
 * Extract BMG track data from the current page
 * This runs the bookmarklet extraction logic on the active page
 */
async function extractBMGTrackData() {
  if (!activePage) {
    return { success: false, error: 'No browser page active' };
  }
  
  const currentUrl = activePage.url();
  console.log('[BMG Extract] Extracting from:', currentUrl);
  
  // Check if we're on a BMG page
  if (!currentUrl.includes('bmgproductionmusic.com')) {
    return { 
      success: false, 
      error: 'Not on a BMG page. Navigate to a BMG track page first.' 
    };
  }
  
  try {
    // Run extraction script on the page
    const data = await activePage.evaluate(() => {
      const result = {
        trackName: '',
        composer: '',
        publisher: '',
        album: '',
        albumCode: '',
        label: '',  // This is actually Master/Contact
        trackNumber: '',
        artist: '',
        url: window.location.href
      };
      
      // Get track name from h1
      const h1 = document.querySelector('h1');
      if (h1) {
        result.trackName = h1.textContent.trim();
      }
      
      // Get the page text content for searching
      const pageText = document.body.innerText;
      
      // Helper to find simple key-value pairs in the top section
      function findSimpleField(labelText) {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent.trim();
          if (text === labelText || text === labelText + ':') {
            // Look for next sibling or parent's next sibling
            let next = el.nextElementSibling;
            if (next) {
              const link = next.querySelector('a');
              if (link) return link.textContent.trim();
              const val = next.textContent.trim();
              if (val && val !== labelText) return val;
            }
            // Check parent container
            const parent = el.parentElement;
            if (parent) {
              const siblings = parent.querySelectorAll('*');
              for (const sib of siblings) {
                if (sib !== el) {
                  const val = sib.textContent.trim();
                  if (val && val !== labelText && val.length < 200) {
                    return val;
                  }
                }
              }
            }
          }
        }
        return '';
      }
      
      // Extract simple fields from top section
      result.trackNumber = findSimpleField('TRACK NUMBER');
      result.album = findSimpleField('ALBUM');
      result.albumCode = findSimpleField('ALBUM CODE');
      result.artist = findSimpleField('ARTIST');
      result.label = findSimpleField('LABEL');  // This is Master/Contact
      
      // Now look for COMPOSER(S) and PUBLISHER(S) sections with full details
      // These have tables with Name, PRO, IPI, Share columns
      
      // Find COMPOSER(S) section
      const composerSection = Array.from(document.querySelectorAll('*')).find(el => 
        el.textContent.trim().match(/^COMPOSER\(S\)$/i)
      );
      
      if (composerSection) {
        // Look for the table/list after this heading
        let container = composerSection.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          const rows = container.querySelectorAll('tr, [class*="row"], [class*="item"]');
          if (rows.length > 0) {
            // Find the data row (skip header)
            for (const row of rows) {
              const cells = row.querySelectorAll('td, [class*="cell"], span, div');
              const rowText = row.textContent;
              // Look for PRO indicators
              if (rowText.includes('ASCAP') || rowText.includes('BMI') || rowText.includes('SESAC') || rowText.includes('PRS')) {
                // Extract name and PRO
                const proMatch = rowText.match(/(ASCAP|BMI|SESAC|PRS)/i);
                const shareMatch = rowText.match(/(\d+\.?\d*%)/);
                
                // Get the name (first cell or text before PRO)
                let name = '';
                if (cells.length > 0) {
                  name = cells[0].textContent.trim();
                }
                
                if (name && proMatch) {
                  const pro = proMatch[1].toUpperCase();
                  const share = shareMatch ? shareMatch[1] : '100%';
                  result.composer = `${name} (${pro})(${share})`;
                  break;
                }
              }
            }
            break;
          }
          container = container.parentElement;
        }
      }
      
      // Fallback: simple composer field from top
      if (!result.composer) {
        result.composer = findSimpleField('COMPOSER');
      }
      
      // Find PUBLISHER(S) section
      const publisherSection = Array.from(document.querySelectorAll('*')).find(el => 
        el.textContent.trim().match(/^PUBLISHER\(S\)$/i)
      );
      
      if (publisherSection) {
        let container = publisherSection.parentElement;
        for (let i = 0; i < 5 && container; i++) {
          const rows = container.querySelectorAll('tr, [class*="row"], [class*="item"]');
          if (rows.length > 0) {
            for (const row of rows) {
              const cells = row.querySelectorAll('td, [class*="cell"], span, div');
              const rowText = row.textContent;
              // Look for PRO indicators
              if (rowText.includes('ASCAP') || rowText.includes('BMI') || rowText.includes('SESAC') || rowText.includes('PRS')) {
                const proMatch = rowText.match(/(ASCAP|BMI|SESAC|PRS)/i);
                const shareMatch = rowText.match(/(\d+\.?\d*%)/);
                
                let name = '';
                if (cells.length > 0) {
                  name = cells[0].textContent.trim();
                }
                
                if (name && proMatch) {
                  const pro = proMatch[1].toUpperCase();
                  const share = shareMatch ? shareMatch[1] : '100%';
                  result.publisher = `${name} (${pro})(${share})`;
                  break;
                }
              }
            }
            break;
          }
          container = container.parentElement;
        }
      }
      
      // Try __NEXT_DATA__ for structured data
      const nextDataScript = document.querySelector('script#__NEXT_DATA__');
      if (nextDataScript) {
        try {
          const nextData = JSON.parse(nextDataScript.textContent);
          const pageProps = nextData?.props?.pageProps;
          const track = pageProps?.track || pageProps?.data?.track || pageProps?.initialData?.track;
          
          if (track) {
            result.trackName = result.trackName || track.title || track.name;
            result.album = result.album || track.album?.name || track.albumName;
            result.albumCode = result.albumCode || track.album?.code || track.catalogNumber;
            result.trackNumber = result.trackNumber || track.trackNumber || track.position;
            
            // Composers with full formatting
            if (!result.composer && track.composers && Array.isArray(track.composers)) {
              result.composer = track.composers.map(c => {
                const name = c.name || c.fullName || c;
                const pro = c.pro || c.performingRightsOrg || '';
                const share = c.share || c.percentage || '100%';
                if (pro) {
                  return `${name} (${pro})(${share})`;
                }
                return name;
              }).join(', ');
            }
            
            // Publishers with full formatting
            if (!result.publisher && track.publishers && Array.isArray(track.publishers)) {
              result.publisher = track.publishers.map(p => {
                const name = p.name || p.fullName || p;
                const pro = p.pro || p.performingRightsOrg || '';
                const share = p.share || p.percentage || '100%';
                if (pro) {
                  return `${name} (${pro})(${share})`;
                }
                return name;
              }).join(', ');
            }
          }
        } catch (e) {
          console.log('Could not parse __NEXT_DATA__');
        }
      }
      
      // Clean up values
      Object.keys(result).forEach(key => {
        if (typeof result[key] === 'string') {
          result[key] = result[key].trim();
        }
      });
      
      return result;
    });
    
    console.log('[BMG Extract] Extracted data:', data);
    
    // Check if we got useful data
    if (!data.trackName && !data.composer) {
      return {
        success: false,
        error: 'Could not find track data. Make sure you are on a track detail page (not search results).',
        data
      };
    }
    
    return {
      success: true,
      data
    };
    
  } catch (error) {
    console.error('[BMG Extract] Error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Navigate to URL
 */
async function navigateTo(url) {
  if (!activePage) {
    await initBrowser(true);
  }
  
  await activePage.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  return { success: true, url: activePage.url() };
}

// Export functions
module.exports = {
  initBrowser,
  closeBrowser,
  showBrowserForManual,
  searchBMG,
  searchBMIRepertoire,
  searchASCAPRepertoire,
  extractBMGResults,
  extractBMGTrackData,
  getCurrentUrl,
  isBrowserActive,
  isInManualMode,
  getPageContent,
  navigateTo,
  findChromePath
};
