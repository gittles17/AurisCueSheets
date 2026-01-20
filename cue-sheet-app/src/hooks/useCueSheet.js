import { useState, useCallback, useEffect, useRef } from 'react';

export function useCueSheet() {
  const [cues, setCues] = useState([]);
  const savedTrackIds = useRef(new Set()); // Track which cues have been saved to DB
  const [projectInfo, setProjectInfo] = useState({
    projectName: '',
    filePath: '',
    project: '',
    spotTitle: '',
    type: '',
    datePrepared: new Date().toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit'
    }).replace(/\//g, '.')
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [error, setError] = useState(null);

  const loadProject = useCallback(async (filePath) => {
    if (!window.electronAPI) {
      setError('Electron API not available. Run in Electron context.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.parsePrproj(filePath);
      
      if (!result.success) {
        throw new Error(result.error);
      }

      const { projectName, spotTitle: parsedSpotTitle, audioClips } = result.data;
      
      // Extract type from filename (e.g., tv10 -> TV10)
      const parts = projectName.split('_');
      const typeMatch = projectName.match(/tv\d+/i);
      const type = typeMatch ? typeMatch[0].toUpperCase() : '';

      setProjectInfo({
        projectName,
        filePath,
        project: 'The Beauty', // Default, user can edit
        spotTitle: parsedSpotTitle || projectName,
        type,
        datePrepared: new Date().toLocaleDateString('en-US', {
          month: 'numeric',
          day: 'numeric',
          year: '2-digit'
        }).replace(/\//g, '.')
      });

      setCues(audioClips);
      
      return { projectName, audioClips };
    } catch (err) {
      setError(err.message);
      console.error('Failed to load project:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateCue = useCallback((cueId, updates) => {
    setCues(prev => prev.map(cue => {
      if (cue.id !== cueId) return cue;
      
      const updated = { ...cue, ...updates };
      
      // Check if user explicitly wants to update the database (edit or approve)
      if (updates._updateDatabase && window.electronAPI?.saveTrack) {
        const isApproval = updates.composerSource === 'user_approved' || updates.publisherSource === 'user_approved';
        console.log(`[CueSheet] ${isApproval ? 'Approving' : 'Saving'} to learned data:`, updated.trackName);
        
        // Save to database (goes to both local and cloud)
        window.electronAPI.saveTrack({
          trackName: updated.trackName,
          catalogCode: updated.catalogCode,
          artist: updated.artist,
          source: updated.source,
          trackNumber: updated.trackNumber,
          composer: updated.composer,
          publisher: updated.publisher,
          library: updated.label,
          masterContact: updated.masterContact,
          useType: updated.use,
          verified: true,
          dataSource: isApproval ? 'user_approved' : 'user_edit'
        });
        // Mark as saved so we don't auto-save again
        savedTrackIds.current.add(cueId);
      }
      
      // Remove internal flags before storing
      delete updated._updateDatabase;
      
      // Check if now complete (only requires composer and publisher)
      const isComplete = updated.composer && updated.publisher;
      if (isComplete) {
        updated.status = 'complete';
      } else if (updated.status === 'complete') {
        // If was complete but now missing required fields, mark as incomplete
        updated.status = 'pending';
      }
      
      return updated;
    }));
  }, []);

  // Batch update multiple cues at once (for delete, paste, etc.)
  const batchUpdateCues = useCallback((updates) => {
    // updates is an array of { cueId, updates } objects
    // Multiple updates can target the same cue (different fields)
    setCues(prev => prev.map(cue => {
      // Find ALL updates for this cue and merge them
      const cueUpdates = updates.filter(u => u.cueId === cue.id);
      if (cueUpdates.length === 0) return cue;
      
      // Merge all updates for this cue
      let updated = { ...cue };
      cueUpdates.forEach(u => {
        updated = { ...updated, ...u.updates };
      });
      
      // Remove internal flags before storing
      delete updated._updateDatabase;
      
      // Check if now complete (only requires composer and publisher)
      const isComplete = updated.composer && updated.publisher;
      if (isComplete) {
        updated.status = 'complete';
      } else if (updated.status === 'complete') {
        updated.status = 'pending';
      }
      
      return updated;
    }));
  }, []);

  // Auto-save tracks to database when they become complete (debounced)
  useEffect(() => {
    if (!window.electronAPI?.saveTrack) return;
    
    // Debounce to prevent rapid saves during batch updates
    const timeoutId = setTimeout(() => {
      const completedTracks = cues.filter(cue => 
        cue.status === 'complete' && 
        cue.composer && 
        cue.publisher &&
        !cue._fromDatabase && // Don't re-save tracks that came from the database
        !cue.composerSource?.includes('learned') && // Don't re-save learned tracks
        !savedTrackIds.current.has(cue.id) // Haven't saved this one yet
      );
      
      if (completedTracks.length === 0) return;
      
      for (const track of completedTracks) {
        console.log('[CueSheet] Auto-saving completed track to database:', track.trackName);
        window.electronAPI.saveTrack({
          trackName: track.trackName,
          catalogCode: track.catalogCode,
          artist: track.artist,
          source: track.source,
          trackNumber: track.trackNumber,
          composer: track.composer,
          publisher: track.publisher,
          library: track.label,
          masterContact: track.masterContact,
          useType: track.use,
          verified: true,
          dataSource: 'user_complete'
        });
        savedTrackIds.current.add(track.id);
      }
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [cues]);

  const autoLookupAll = useCallback(async () => {
    if (!window.electronAPI) return;
    
    setIsLookingUp(true);
    console.log('[Auto-Lookup] Starting lookup for', cues.length, 'cues...');
    
    try {
      const updatedCues = await Promise.all(
        cues.map(async (cue) => {
          if (cue.status === 'complete') {
            console.log(`[Auto-Lookup] Skipping "${cue.trackName}" - already complete`);
            return cue;
          }
          
          try {
            console.log(`[Auto-Lookup] Looking up "${cue.trackName}"...`);
            const result = await window.electronAPI.autoLookupCue(cue);
            
            if (result.success) {
              console.log(`[Auto-Lookup] Result for "${cue.trackName}":`, {
                composer: result.cue.composer || '(empty)',
                publisher: result.cue.publisher || '(empty)',
                _debug: result.cue._debug
              });
              return result.cue;
            } else {
              console.warn(`[Auto-Lookup] Failed for "${cue.trackName}":`, result);
            }
          } catch (e) {
            console.error('[Auto-Lookup] Error for', cue.trackName, e);
          }
          return cue;
        })
      );
      
      console.log('[Auto-Lookup] Complete. Updated cues:', updatedCues.map(c => ({
        track: c.trackName,
        composer: c.composer || '(empty)',
        publisher: c.publisher || '(empty)'
      })));
      
      setCues(updatedCues);
    } catch (err) {
      console.error('[Auto-Lookup] Fatal error:', err);
      setError('Auto-lookup failed: ' + err.message);
    } finally {
      setIsLookingUp(false);
    }
  }, [cues]);

  const lookupSingleCue = useCallback(async (cueId) => {
    if (!window.electronAPI) return;
    
    const cue = cues.find(c => c.id === cueId);
    if (!cue) return;
    
    try {
      const result = await window.electronAPI.autoLookupCue(cue);
      if (result.success) {
        updateCue(cueId, result.cue);
      }
    } catch (err) {
      console.error('Lookup failed:', err);
    }
  }, [cues, updateCue]);

  const exportToExcel = useCallback(async (format = 'xlsx') => {
    if (!window.electronAPI) {
      setError('Electron API not available');
      return;
    }

    setIsLoading(true);
    
    try {
      const result = await window.electronAPI.exportExcel({
        cues,
        projectInfo,
        format
      });

      if (!result.success && !result.canceled) {
        throw new Error(result.error);
      }

      return result;
    } catch (err) {
      setError(err.message);
      console.error('Failed to export:', err);
    } finally {
      setIsLoading(false);
    }
  }, [cues, projectInfo]);

  const importContacts = useCallback(async () => {
    if (!window.electronAPI) return;
    
    try {
      const result = await window.electronAPI.importContacts();
      if (result.success) {
        return { success: true, count: result.count };
      }
      return result;
    } catch (err) {
      setError('Failed to import contacts: ' + err.message);
      return { success: false, error: err.message };
    }
  }, []);

  return {
    cues,
    setCues,
    projectInfo,
    setProjectInfo,
    isLoading,
    isLookingUp,
    error,
    loadProject,
    exportToExcel,
    updateCue,
    batchUpdateCues,
    autoLookupAll,
    lookupSingleCue,
    importContacts
  };
}
