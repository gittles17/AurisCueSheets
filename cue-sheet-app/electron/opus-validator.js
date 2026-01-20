/**
 * Opus Validator - Data validation and formatting for cue sheets
 * 
 * Ensures scraped and user-entered data is properly formatted:
 * - Composer: "Name (PRO)(percentage%)"
 * - Publisher: "Company Name (PRO)(percentage%)"
 * - Validates PRO affiliations
 * - Catches common errors
 */

const sourcesManager = require('./sources-manager');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-20250514';

/**
 * Valid PRO (Performing Rights Organization) codes
 */
const VALID_PROS = ['ASCAP', 'BMI', 'SESAC', 'PRS', 'SOCAN', 'GEMA', 'SACEM', 'APRA', 'IMRO'];

/**
 * Common formatting patterns
 */
const COMPOSER_PATTERN = /^(.+?)\s*\((\w+)\)\s*\((\d+)%\)$/;
const PUBLISHER_PATTERN = /^(.+?)\s*\((\w+)\)\s*\((\d+)%\)$/;

/**
 * Get API key
 */
function getApiKey() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.config?.apiKey || null;
}

/**
 * Check if Opus is enabled
 */
function isOpusEnabled() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.enabled && sources.opus?.config?.apiKey;
}

/**
 * Parse a composer/publisher string
 */
function parseEntity(str) {
  if (!str) return null;
  
  const match = str.match(/^(.+?)\s*\((\w+)\)\s*\((\d+)%?\)$/);
  if (match) {
    return {
      name: match[1].trim(),
      pro: match[2].toUpperCase(),
      percentage: parseInt(match[3])
    };
  }
  
  // Try without percentage
  const match2 = str.match(/^(.+?)\s*\((\w+)\)$/);
  if (match2) {
    return {
      name: match2[1].trim(),
      pro: match2[2].toUpperCase(),
      percentage: null
    };
  }
  
  return {
    name: str.trim(),
    pro: null,
    percentage: null
  };
}

/**
 * Format a composer string properly
 */
function formatComposer(name, pro = null, percentage = 100) {
  if (!name) return '';
  
  const cleanName = name.trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  if (pro && percentage !== null) {
    const validPro = VALID_PROS.includes(pro.toUpperCase()) ? pro.toUpperCase() : pro;
    return `${cleanName} (${validPro})(${percentage}%)`;
  } else if (pro) {
    const validPro = VALID_PROS.includes(pro.toUpperCase()) ? pro.toUpperCase() : pro;
    return `${cleanName} (${validPro})`;
  }
  
  return cleanName;
}

/**
 * Format a publisher string properly
 */
function formatPublisher(name, pro = null, percentage = 100) {
  if (!name) return '';
  
  // Publisher names stay as-is (company names)
  const cleanName = name.trim();
  
  if (pro && percentage !== null) {
    const validPro = VALID_PROS.includes(pro.toUpperCase()) ? pro.toUpperCase() : pro;
    return `${cleanName} (${validPro})(${percentage}%)`;
  } else if (pro) {
    const validPro = VALID_PROS.includes(pro.toUpperCase()) ? pro.toUpperCase() : pro;
    return `${cleanName} (${validPro})`;
  }
  
  return cleanName;
}

/**
 * Validate a PRO code
 */
function validatePRO(pro) {
  if (!pro) return { valid: false, suggestion: null };
  
  const upper = pro.toUpperCase();
  if (VALID_PROS.includes(upper)) {
    return { valid: true, normalized: upper };
  }
  
  // Check for common typos/variations
  const variations = {
    'ASCAP': ['ASAP', 'ACAP'],
    'BMI': ['BM', 'BMII'],
    'SESAC': ['SESAK', 'SESCAC'],
    'PRS': ['PRS UK', 'PRSUK'],
    'SOCAN': ['SOCAM', 'SOKAN']
  };
  
  for (const [correct, typos] of Object.entries(variations)) {
    if (typos.includes(upper)) {
      return { valid: false, suggestion: correct };
    }
  }
  
  return { valid: false, suggestion: null };
}

/**
 * Validate percentage splits
 */
function validatePercentages(entities) {
  const total = entities.reduce((sum, e) => sum + (e.percentage || 0), 0);
  
  if (total === 0) return { valid: true, warning: 'No percentages specified' };
  if (total === 100) return { valid: true };
  if (total > 100) return { valid: false, error: `Percentages total ${total}%, should be 100%` };
  if (total < 100) return { valid: true, warning: `Percentages total ${total}%, expected 100%` };
  
  return { valid: true };
}

/**
 * Quick validation without API
 */
function validateQuick(data) {
  const issues = [];
  const warnings = [];
  
  // Validate composer format
  if (data.composer) {
    const composers = data.composer.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const parsed = composers.map(parseEntity);
    
    for (const p of parsed) {
      if (!p.pro) {
        warnings.push(`Composer "${p.name}" missing PRO affiliation`);
      } else {
        const proCheck = validatePRO(p.pro);
        if (!proCheck.valid) {
          if (proCheck.suggestion) {
            issues.push(`PRO "${p.pro}" may be "${proCheck.suggestion}"`);
          } else {
            warnings.push(`Unknown PRO: ${p.pro}`);
          }
        }
      }
    }
    
    const percentCheck = validatePercentages(parsed);
    if (!percentCheck.valid) {
      issues.push(percentCheck.error);
    } else if (percentCheck.warning) {
      warnings.push(percentCheck.warning);
    }
  }
  
  // Validate publisher format
  if (data.publisher) {
    const publishers = data.publisher.split(/[;,]/).map(s => s.trim()).filter(Boolean);
    const parsed = publishers.map(parseEntity);
    
    for (const p of parsed) {
      if (!p.pro) {
        warnings.push(`Publisher "${p.name}" missing PRO affiliation`);
      }
    }
    
    const percentCheck = validatePercentages(parsed);
    if (!percentCheck.valid) {
      issues.push(percentCheck.error);
    }
  }
  
  // Check for swapped composer/publisher
  if (data.composer && data.publisher) {
    const compLower = data.composer.toLowerCase();
    const pubLower = data.publisher.toLowerCase();
    
    // Publishers often have "music", "publishing", "entertainment" in name
    const publisherWords = ['music', 'publishing', 'entertainment', 'records', 'rights', 'management'];
    const composerHasPublisherWord = publisherWords.some(w => compLower.includes(w));
    const publisherHasPublisherWord = publisherWords.some(w => pubLower.includes(w));
    
    if (composerHasPublisherWord && !publisherHasPublisherWord) {
      warnings.push('Composer field may contain publisher name');
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    warnings
  };
}

/**
 * Format raw scraped data
 */
function formatScrapedData(rawData) {
  const formatted = { ...rawData };
  
  // Format composer
  if (rawData.composer || rawData.writers) {
    const writers = rawData.writers || [rawData.composer];
    const formattedWriters = [];
    
    for (const writer of (Array.isArray(writers) ? writers : [writers])) {
      if (!writer) continue;
      
      const parsed = parseEntity(writer);
      if (parsed.name) {
        formattedWriters.push(formatComposer(parsed.name, parsed.pro, parsed.percentage || 100));
      }
    }
    
    formatted.composer = formattedWriters.join('; ');
  }
  
  // Format publisher
  if (rawData.publisher || rawData.publishers) {
    const pubs = rawData.publishers || [rawData.publisher];
    const formattedPubs = [];
    
    for (const pub of (Array.isArray(pubs) ? pubs : [pubs])) {
      if (!pub) continue;
      
      const parsed = parseEntity(pub);
      if (parsed.name) {
        formattedPubs.push(formatPublisher(parsed.name, parsed.pro, parsed.percentage || 100));
      }
    }
    
    formatted.publisher = formattedPubs.join('; ');
  }
  
  return formatted;
}

/**
 * Use Opus to validate and format data
 */
async function validateWithOpus(data) {
  const apiKey = getApiKey();
  
  if (!apiKey || !isOpusEnabled()) {
    return validateQuick(data);
  }
  
  const systemPrompt = `You validate and format cue sheet metadata. Check for:
1. Proper formatting: "Name (PRO)(percentage%)"
2. Valid PRO codes: ASCAP, BMI, SESAC, PRS, SOCAN, GEMA, SACEM
3. Percentage splits totaling 100%
4. Swapped composer/publisher fields
5. Obvious errors or typos

Return JSON with issues found and suggested corrections.
DO NOT invent or guess any data - only flag issues with existing data.`;

  const userPrompt = `Validate this cue sheet data:
Composer: "${data.composer || 'N/A'}"
Publisher: "${data.publisher || 'N/A'}"
Track: "${data.trackName || 'N/A'}"

Return JSON:
{
  "valid": true/false,
  "issues": ["list of issues"],
  "warnings": ["list of warnings"],
  "suggestions": {
    "composer": "corrected format if needed",
    "publisher": "corrected format if needed"
  }
}`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      return validateQuick(data);
    }

    const result = await response.json();
    let responseText = result.content[0].text.trim();
    
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```json?\n?/g, '').replace(/```/g, '');
    }
    
    return JSON.parse(responseText);
  } catch (error) {
    console.error('[OpusValidator] Error:', error.message);
    return validateQuick(data);
  }
}

/**
 * Auto-fix common formatting issues
 */
function autoFix(data) {
  const fixed = { ...data };
  
  // Fix composer
  if (data.composer) {
    const parsed = parseEntity(data.composer);
    if (parsed.name && !COMPOSER_PATTERN.test(data.composer)) {
      // Try to detect PRO from name
      const proMatch = data.composer.match(/\b(ASCAP|BMI|SESAC|PRS|SOCAN)\b/i);
      if (proMatch) {
        const name = data.composer.replace(/\b(ASCAP|BMI|SESAC|PRS|SOCAN)\b/i, '').trim();
        const pct = data.composer.match(/(\d+)%/);
        fixed.composer = formatComposer(
          name.replace(/[()]/g, '').trim(),
          proMatch[1].toUpperCase(),
          pct ? parseInt(pct[1]) : 100
        );
      }
    }
  }
  
  // Fix publisher
  if (data.publisher) {
    const parsed = parseEntity(data.publisher);
    if (parsed.name && !PUBLISHER_PATTERN.test(data.publisher)) {
      const proMatch = data.publisher.match(/\b(ASCAP|BMI|SESAC|PRS|SOCAN)\b/i);
      if (proMatch) {
        const name = data.publisher.replace(/\b(ASCAP|BMI|SESAC|PRS|SOCAN)\b/i, '').trim();
        const pct = data.publisher.match(/(\d+)%/);
        fixed.publisher = formatPublisher(
          name.replace(/[()]/g, '').trim(),
          proMatch[1].toUpperCase(),
          pct ? parseInt(pct[1]) : 100
        );
      }
    }
  }
  
  return fixed;
}

/**
 * Validate and format a complete cue
 */
async function validateCue(cue) {
  // First apply auto-fixes
  const fixed = autoFix(cue);
  
  // Then validate
  const validation = await validateWithOpus(fixed);
  
  return {
    original: cue,
    fixed,
    validation
  };
}

/**
 * Batch validate multiple cues
 */
async function validateBatch(cues) {
  const results = [];
  
  for (const cue of cues) {
    const result = await validateCue(cue);
    results.push(result);
    
    // Small delay for rate limiting
    if (isOpusEnabled()) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

module.exports = {
  validateQuick,
  validateWithOpus,
  validateCue,
  validateBatch,
  formatComposer,
  formatPublisher,
  formatScrapedData,
  parseEntity,
  validatePRO,
  validatePercentages,
  autoFix,
  VALID_PROS,
  isOpusEnabled
};
