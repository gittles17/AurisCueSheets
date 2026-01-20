/**
 * Feedback Manager - Handles user feedback submission and retrieval
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { supabase, isConfigured } = require('./supabase-client');

// Generate a unique device ID for anonymous users
function getDeviceId() {
  const userDataPath = app.getPath('userData');
  const deviceIdPath = path.join(userDataPath, 'device-id.txt');
  
  if (fs.existsSync(deviceIdPath)) {
    return fs.readFileSync(deviceIdPath, 'utf-8').trim();
  }
  
  // Generate new device ID
  const deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  fs.writeFileSync(deviceIdPath, deviceId);
  return deviceId;
}

// Get user profile path
function getProfilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'user-profile.json');
}

// Get local feedback path (fallback when cloud not available)
function getLocalFeedbackPath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'feedback.json');
}

/**
 * Get or create user profile
 */
function getUserProfile() {
  const profilePath = getProfilePath();
  
  if (fs.existsSync(profilePath)) {
    try {
      const data = fs.readFileSync(profilePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error('[Feedback] Error reading profile:', e);
    }
  }
  
  // Return default profile
  return {
    userId: getDeviceId(),
    name: '',
    email: '',
    createdAt: new Date().toISOString()
  };
}

/**
 * Save user profile
 */
function saveUserProfile(profile) {
  const profilePath = getProfilePath();
  const deviceId = getDeviceId();
  
  const profileData = {
    userId: deviceId,
    name: profile.name || '',
    email: profile.email || '',
    updatedAt: new Date().toISOString(),
    createdAt: profile.createdAt || new Date().toISOString()
  };
  
  try {
    fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2));
    return { success: true, profile: profileData };
  } catch (e) {
    console.error('[Feedback] Error saving profile:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Submit feedback
 */
async function submitFeedback(feedback) {
  const profile = getUserProfile();
  const appVersion = app.getVersion() || '1.0.0';
  
  const feedbackData = {
    user_id: profile.userId,
    user_name: profile.name || 'Anonymous',
    user_email: profile.email || '',
    category: feedback.category || 'general',
    message: feedback.message,
    app_version: appVersion,
    status: 'new',
    created_at: new Date().toISOString()
  };
  
  // Try to save to cloud first
  if (isConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .insert(feedbackData)
        .select()
        .single();
      
      if (error) {
        console.error('[Feedback] Cloud save error:', error);
        // Fall back to local
        return saveLocalFeedback(feedbackData);
      }
      
      console.log('[Feedback] Saved to cloud:', data.id);
      return { success: true, id: data.id, cloud: true };
    } catch (e) {
      console.error('[Feedback] Cloud error:', e);
      return saveLocalFeedback(feedbackData);
    }
  }
  
  // Save locally if cloud not available
  return saveLocalFeedback(feedbackData);
}

/**
 * Save feedback locally (fallback)
 */
function saveLocalFeedback(feedbackData) {
  const localPath = getLocalFeedbackPath();
  let feedbackList = [];
  
  if (fs.existsSync(localPath)) {
    try {
      feedbackList = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    } catch (e) {
      feedbackList = [];
    }
  }
  
  const newFeedback = {
    ...feedbackData,
    id: Date.now(),
    synced: false
  };
  
  feedbackList.push(newFeedback);
  
  try {
    fs.writeFileSync(localPath, JSON.stringify(feedbackList, null, 2));
    console.log('[Feedback] Saved locally:', newFeedback.id);
    return { success: true, id: newFeedback.id, cloud: false };
  } catch (e) {
    console.error('[Feedback] Local save error:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Get all feedback (admin only)
 */
async function getAllFeedback() {
  const results = [];
  
  // Get cloud feedback
  if (isConfigured() && supabase) {
    try {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        results.push(...data.map(f => ({ ...f, source: 'cloud' })));
      }
    } catch (e) {
      console.error('[Feedback] Error fetching cloud feedback:', e);
    }
  }
  
  // Get local feedback
  const localPath = getLocalFeedbackPath();
  if (fs.existsSync(localPath)) {
    try {
      const localFeedback = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      results.push(...localFeedback.map(f => ({ ...f, source: 'local' })));
    } catch (e) {
      console.error('[Feedback] Error reading local feedback:', e);
    }
  }
  
  // Sort by date, newest first
  results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  return results;
}

/**
 * Update feedback status (admin only)
 */
async function updateFeedbackStatus(feedbackId, status, adminNotes = '') {
  if (isConfigured() && supabase) {
    try {
      const { error } = await supabase
        .from('feedback')
        .update({ status, admin_notes: adminNotes })
        .eq('id', feedbackId);
      
      if (error) {
        console.error('[Feedback] Update error:', error);
        return { success: false, error: error.message };
      }
      
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  // Update local feedback
  const localPath = getLocalFeedbackPath();
  if (fs.existsSync(localPath)) {
    try {
      const feedbackList = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
      const idx = feedbackList.findIndex(f => f.id === feedbackId);
      if (idx >= 0) {
        feedbackList[idx].status = status;
        feedbackList[idx].admin_notes = adminNotes;
        fs.writeFileSync(localPath, JSON.stringify(feedbackList, null, 2));
        return { success: true };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  
  return { success: false, error: 'Feedback not found' };
}

/**
 * Sync local feedback to cloud
 */
async function syncLocalFeedback() {
  if (!isConfigured() || !supabase) {
    return { success: false, error: 'Cloud not configured' };
  }
  
  const localPath = getLocalFeedbackPath();
  if (!fs.existsSync(localPath)) {
    return { success: true, synced: 0 };
  }
  
  try {
    const feedbackList = JSON.parse(fs.readFileSync(localPath, 'utf-8'));
    const unsynced = feedbackList.filter(f => !f.synced);
    
    let syncedCount = 0;
    for (const feedback of unsynced) {
      const { id, synced, source, ...feedbackData } = feedback;
      
      const { error } = await supabase
        .from('feedback')
        .insert(feedbackData);
      
      if (!error) {
        feedback.synced = true;
        syncedCount++;
      }
    }
    
    fs.writeFileSync(localPath, JSON.stringify(feedbackList, null, 2));
    return { success: true, synced: syncedCount };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  getUserProfile,
  saveUserProfile,
  submitFeedback,
  getAllFeedback,
  updateFeedbackStatus,
  syncLocalFeedback,
  getDeviceId
};
