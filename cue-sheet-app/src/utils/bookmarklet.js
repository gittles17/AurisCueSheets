/**
 * BMG Bookmarklet Generator
 * 
 * Creates a JavaScript bookmarklet that extracts track data from BMG Production Music pages
 * and sends it to the Auris app via custom URL protocol.
 */

/**
 * The raw bookmarklet JavaScript code
 * This will be minified and URL-encoded for the bookmarklet href
 */
const BOOKMARKLET_SOURCE = `
(function() {
  // Check if we're on a BMG page
  if (!window.location.hostname.includes('bmgproductionmusic.com')) {
    alert('This bookmarklet only works on BMG Production Music pages.\\n\\nNavigate to a track page first.');
    return;
  }

  var data = {};
  
  // Get track name from the main heading
  var h1 = document.querySelector('h1');
  if (h1) {
    data.trackName = h1.textContent.trim();
  }
  
  // Helper to find text content after a label
  function findField(labelText) {
    // Try multiple approaches to find the field
    
    // Approach 1: Look for exact text in spans/divs
    var elements = document.querySelectorAll('span, div, p, td');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var text = el.textContent.trim().toUpperCase();
      if (text === labelText || text === labelText + ':') {
        // Get the next sibling or parent's next sibling
        var next = el.nextElementSibling;
        if (next) {
          var val = next.textContent.trim();
          // Check for links inside
          var link = next.querySelector('a');
          if (link) val = link.textContent.trim();
          if (val && val.length > 0 && val.toUpperCase() !== labelText) {
            return val;
          }
        }
        // Try parent's next sibling
        if (el.parentElement && el.parentElement.nextElementSibling) {
          var val2 = el.parentElement.nextElementSibling.textContent.trim();
          if (val2 && val2.length > 0) {
            return val2;
          }
        }
      }
    }
    
    // Approach 2: Look for aria-labels or data attributes
    var ariaEl = document.querySelector('[aria-label*="' + labelText.toLowerCase() + '"]');
    if (ariaEl) {
      return ariaEl.textContent.trim();
    }
    
    return '';
  }
  
  // Extract all the fields we need
  data.composer = findField('COMPOSER');
  data.album = findField('ALBUM');
  data.albumCode = findField('ALBUM CODE');
  data.label = findField('LABEL');
  data.trackNumber = findField('TRACK NUMBER');
  data.artist = findField('ARTIST');
  
  // Include the current URL for reference
  data.url = window.location.href;
  
  // Log what we found for debugging
  console.log('[Auris Bookmarklet] Extracted data:', data);
  
  // Check if we found anything useful
  if (!data.trackName && !data.composer) {
    alert('Could not find track data on this page.\\n\\nMake sure you are on a track detail page (not search results).');
    return;
  }
  
  // Build the URL and open it
  var params = new URLSearchParams();
  Object.keys(data).forEach(function(key) {
    if (data[key]) {
      params.append(key, data[key]);
    }
  });
  
  var aurisUrl = 'auris://bmg?' + params.toString();
  
  // Try to open the Auris app
  window.location.href = aurisUrl;
  
  // Show confirmation
  setTimeout(function() {
    alert('Data sent to Auris app!\\n\\nTrack: ' + (data.trackName || 'Unknown') + '\\nComposer: ' + (data.composer || 'Not found'));
  }, 100);
})();
`;

/**
 * Generate the bookmarklet href value
 * Minifies and encodes the JavaScript for use in a bookmark
 */
export function generateBookmarkletHref() {
  // Minify by removing comments and extra whitespace
  const minified = BOOKMARKLET_SOURCE
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\s+/g, ' ')     // Collapse whitespace
    .replace(/\s*([{}();,:])\s*/g, '$1') // Remove space around punctuation
    .trim();
  
  return `javascript:${encodeURIComponent(minified)}`;
}

/**
 * Get the bookmarklet as a displayable code snippet
 */
export function getBookmarkletCode() {
  return BOOKMARKLET_SOURCE.trim();
}

/**
 * Get installation instructions
 */
export function getInstallInstructions() {
  return [
    'Drag the button below to your browser\'s bookmarks bar',
    'Navigate to a track page on BMG Production Music',
    'Click the "Send to Auris" bookmark',
    'The track data will be automatically sent to the app'
  ];
}

export default {
  generateBookmarkletHref,
  getBookmarkletCode,
  getInstallInstructions
};
