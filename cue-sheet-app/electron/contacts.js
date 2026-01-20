/**
 * Contact Database for Music Libraries
 * Built-in contacts and custom contact import functionality
 */

// Built-in contacts for common music libraries
const BUILT_IN_CONTACTS = {
  'BMG Production Music': {
    name: 'BMG Production Music',
    email: 'jourdan.stracuzzi-house@bmg.com',
    formatted: 'BMG Production Music\nContact:\njourdan.stracuzzi-house@bmg.com'
  },
  'APM Music': {
    name: 'APM Music',
    email: 'licensing@apmmusic.com',
    formatted: 'APM Music\nContact:\nlicensing@apmmusic.com'
  },
  'Extreme Music': {
    name: 'Extreme Music',
    email: 'licensing@extrememusic.com',
    formatted: 'Extreme Music\nContact:\nlicensing@extrememusic.com'
  },
  'Universal Production Music': {
    name: 'Universal Production Music',
    email: 'info@universalproductionmusic.com',
    formatted: 'Universal Production Music\nContact:\ninfo@universalproductionmusic.com'
  },
  'Musicbed': {
    name: 'Musicbed',
    email: 'licensing@musicbed.com',
    formatted: 'Musicbed\nContact:\nlicensing@musicbed.com'
  },
  'Artlist': {
    name: 'Artlist',
    email: 'support@artlist.io',
    formatted: 'Artlist\nContact:\nsupport@artlist.io'
  },
  'Epidemic Sound': {
    name: 'Epidemic Sound',
    email: 'licensing@epidemicsound.com',
    formatted: 'Epidemic Sound\nContact:\nlicensing@epidemicsound.com'
  },
  'AudioJungle': {
    name: 'AudioJungle',
    email: 'support@audiojungle.net',
    formatted: 'AudioJungle\nContact:\nsupport@audiojungle.net'
  }
};

// User's custom contacts (loaded from file)
let customContacts = {};

// Combined contacts
function getAllContacts() {
  return { ...BUILT_IN_CONTACTS, ...customContacts };
}

// Find contact by library name or publisher
function findContact(libraryName) {
  if (!libraryName) return null;
  
  const contacts = getAllContacts();
  const normalizedSearch = libraryName.toLowerCase().trim();
  
  // Direct match
  for (const [key, contact] of Object.entries(contacts)) {
    if (key.toLowerCase() === normalizedSearch) {
      return contact;
    }
  }
  
  // Partial match
  for (const [key, contact] of Object.entries(contacts)) {
    if (key.toLowerCase().includes(normalizedSearch) || 
        normalizedSearch.includes(key.toLowerCase())) {
      return contact;
    }
  }
  
  // Check if it contains "BMG" anywhere
  if (normalizedSearch.includes('bmg')) {
    return BUILT_IN_CONTACTS['BMG Production Music'];
  }
  
  return null;
}

// Import contacts from Excel/CSV file
async function importContactsFromFile(filePath) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  
  const ext = filePath.toLowerCase().split('.').pop();
  
  try {
    if (ext === 'xlsx' || ext === 'xls') {
      await workbook.xlsx.readFile(filePath);
    } else if (ext === 'csv') {
      await workbook.csv.readFile(filePath);
    } else {
      throw new Error('Unsupported file format. Use .xlsx, .xls, or .csv');
    }
    
    const sheet = workbook.worksheets[0];
    const imported = {};
    
    // Expect columns: Library Name, Contact Email (at minimum)
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      
      const name = row.getCell(1).value?.toString().trim();
      const email = row.getCell(2).value?.toString().trim();
      
      if (name && email) {
        imported[name] = {
          name,
          email,
          formatted: `${name}\nContact:\n${email}`
        };
      }
    });
    
    customContacts = { ...customContacts, ...imported };
    return { success: true, count: Object.keys(imported).length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Export custom contacts for saving
function getCustomContacts() {
  return customContacts;
}

// Set custom contacts (for loading from saved state)
function setCustomContacts(contacts) {
  customContacts = contacts || {};
}

// Get list of all contact names
function getContactNames() {
  return Object.keys(getAllContacts());
}

module.exports = {
  BUILT_IN_CONTACTS,
  getAllContacts,
  findContact,
  importContactsFromFile,
  getCustomContacts,
  setCustomContacts,
  getContactNames
};
