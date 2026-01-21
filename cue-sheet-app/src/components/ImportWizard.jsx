import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Check, CircleNotch, Eye, EyeSlash, TreeStructure, Lightning, Robot, ArrowCounterClockwise } from '@phosphor-icons/react';

/**
 * ImportWizard - Multi-step wizard for importing Premiere Pro projects
 * 
 * Steps:
 * 1. Clip Detection - Show all clips, let user exclude non-music
 * 2. Categorization - Classify as Main/SFX/Stem
 * 3. Stem Grouping - Group stems under parent tracks
 * 4. Final Review - Edit names, durations, approve final list
 */

const STEPS = [
  { id: 'clips', title: 'Clips' },
  { id: 'categorize', title: 'Categorize' },
  { id: 'stems', title: 'Group' },
  { id: 'review', title: 'Review' },
];

export default function ImportWizard({ isOpen, onClose, onComplete, projectPath }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);
  
  // Loading progress state
  const [loadingProgress, setLoadingProgress] = useState({
    step: 0,
    totalSteps: 8,
    stepName: 'Starting...',
    description: 'Initializing pipeline...',
    progress: 0,
    matches: 0,
  });
  
  // Pipeline data at each stage
  const [pipelineData, setPipelineData] = useState({
    raw: null,           // Step 1: Raw clips from parser
    categorized: null,   // Step 2: After categorization
    grouped: null,       // Step 3: After stem grouping
    final: null,         // Step 4: Final approved list
  });
  const [originalData, setOriginalData] = useState({});
  
  // Reset current step to original state
  const resetCurrentStep = useCallback(() => {
    const stepKeys = ['raw', 'categorized', 'grouped', 'final'];
    const currentKey = stepKeys[currentStep];
    if (originalData[currentKey]) {
      setPipelineData(prev => ({
        ...prev,
        [currentKey]: JSON.parse(JSON.stringify(originalData[currentKey]))
      }));
    }
  }, [currentStep, originalData]);
  
  // User modifications at each step (for learning)
  const [modifications, setModifications] = useState({
    excludedClips: [],      // Clips user marked to exclude
    includedClips: [],      // Clips user marked to include (were auto-excluded)
    categoryChanges: [],    // Category changes: { clipId, from, to }
    groupingChanges: [],    // Grouping changes
    nameEdits: [],          // Track name edits
  });
  
  // Project info
  const [projectInfo, setProjectInfo] = useState({
    projectName: '',
    spotTitle: '',
    filePath: '',
  });
  
  // Processing stats (for hybrid approach feedback)
  const [processingStats, setProcessingStats] = useState({
    opusEnabled: false,
    opusUsed: false,
    opusClassifiedCount: 0,
    lowConfidenceCount: 0,
    avgConfidence: 0,
    processingTimeMs: 0,
  });

  // Load project when wizard opens
  useEffect(() => {
    isMountedRef.current = true;
    
    if (isOpen && projectPath) {
      loadProject();
    }
    
    // Cleanup progress listener and mark unmounted
    return () => {
      isMountedRef.current = false;
      if (window.electronAPI?.removeWizardProgressListener) {
        window.electronAPI.removeWizardProgressListener();
      }
    };
  }, [isOpen, projectPath]);

  const loadProject = async () => {
    setIsLoading(true);
    setError(null);
    setCurrentStep(0);
    setLoadingProgress({
      step: 0,
      totalSteps: 8,
      stepName: 'Starting...',
      description: 'Initializing pipeline...',
      progress: 0,
      matches: 0,
    });
    
    // Set up progress listener (remove any existing first to prevent accumulation)
    window.electronAPI.removeWizardProgressListener();
    window.electronAPI.onWizardProgress((progressData) => {
      // Guard against state updates after unmount
      if (isMountedRef.current) {
        setLoadingProgress(progressData);
      }
    });
    
    try {
      // Call the pipeline to parse the project
      const result = await window.electronAPI.parseProjectForWizard(projectPath);
      
      if (result.success) {
        setProjectInfo({
          projectName: result.projectName,
          spotTitle: result.spotTitle,
          filePath: projectPath,
        });
        
        // Save original data for reset functionality
        setOriginalData({
          raw: JSON.parse(JSON.stringify(result.rawClips)),
          categorized: JSON.parse(JSON.stringify(result.categorizedClips)),
          grouped: JSON.parse(JSON.stringify(result.groupedClips)),
          final: JSON.parse(JSON.stringify(result.groupedClips)),
        });
        
        setPipelineData({
          raw: result.rawClips,
          categorized: result.categorizedClips,
          grouped: result.groupedClips,
          final: result.groupedClips, // Start with grouped as final
        });
        
        // Store processing stats for hybrid approach feedback
        if (result.summary) {
          setProcessingStats({
            opusEnabled: result.summary.opusEnabled || false,
            opusUsed: result.summary.opusUsed || false,
            opusClassifiedCount: result.summary.opusClassifiedCount || 0,
            lowConfidenceCount: result.summary.lowConfidenceCount || 0,
            avgConfidence: result.summary.avgConfidence || 0,
            processingTimeMs: result.summary.processingTimeMs || 0,
          });
        }
      } else {
        setError(result.error || 'Failed to parse project');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      // Clean up progress listener
      window.electronAPI.removeWizardProgressListener();
      setIsLoading(false);
    }
  };

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleComplete = useCallback(async () => {
    // Save modifications for learning (if API is available)
    if (Object.values(modifications).some(arr => arr.length > 0) && window.electronAPI?.saveImportPatterns) {
      try {
        await window.electronAPI.saveImportPatterns({
          projectPath,
          modifications,
        });
      } catch (err) {
        console.error('Failed to save patterns:', err);
      }
    }
    
    // Process final cues:
    // - Only include main tracks (not stems)
    // - Stems are absorbed into main track durations, not shown separately
    // - Format all durations to M:SS with 12-frame rounding
    // - Map field names to match main cue sheet expectations
    const finalCues = pipelineData.final
      .filter(cue => !cue.excluded && cue.cueType !== 'stem')
      .map(cue => {
        // Calculate duration: use combined if stems exist, otherwise format the track's duration
        let formattedDuration;
        if (cue.stems && cue.stems.length > 0 && !cue.stemDurationAbsorbed) {
          formattedDuration = calculateCombinedDuration(cue, cue.stems);
        } else {
          // Format this track's duration with 12-frame rounding
          formattedDuration = formatClipDuration(cue);
        }
        return { 
          ...cue, 
          duration: formattedDuration,
          // Map field names to match main cue sheet expectations
          label: cue.library || cue.label || '',
          // Ensure all enriched fields are included
          composer: cue.composer || '',
          composerSource: cue.composerSource || '',
          publisher: cue.publisher || '',
          publisherSource: cue.publisherSource || '',
          artist: cue.artist || '',
          artistSource: cue.artistSource || '',
          source: cue.source || '',
          sourceSource: cue.sourceSource || '',
          use: cue.use || '',
          useSource: cue.useSource || '',
        };
      });
    
    // Return the final cue list (stems are excluded, their durations absorbed)
    onComplete({
      cues: finalCues,
      projectInfo,
    });
  }, [pipelineData.final, projectInfo, modifications, projectPath, onComplete]);

  // Toggle clip inclusion (Step 1)
  const toggleClipExclusion = useCallback((clipId, currentlyExcluded) => {
    setPipelineData(prev => ({
      ...prev,
      raw: prev.raw.map(clip => 
        clip.id === clipId ? { ...clip, excluded: !currentlyExcluded } : clip
      ),
    }));
    
    // Track modification for learning
    setModifications(prev => {
      const clip = pipelineData.raw.find(c => c.id === clipId);
      if (currentlyExcluded) {
        // User is including a clip that was excluded
        return {
          ...prev,
          includedClips: [...prev.includedClips, { id: clipId, name: clip?.originalName }],
          excludedClips: prev.excludedClips.filter(c => c.id !== clipId),
        };
      } else {
        // User is excluding a clip
        return {
          ...prev,
          excludedClips: [...prev.excludedClips, { id: clipId, name: clip?.originalName }],
          includedClips: prev.includedClips.filter(c => c.id !== clipId),
        };
      }
    });
  }, [pipelineData.raw]);

  // Change clip category (Step 2)
  const changeClipCategory = useCallback((clipId, newCategory) => {
    setPipelineData(prev => {
      const clip = prev.categorized.find(c => c.id === clipId);
      const oldCategory = clip?.cueType;
      
      // Track modification
      if (oldCategory !== newCategory) {
        setModifications(m => ({
          ...m,
          categoryChanges: [...m.categoryChanges, { clipId, from: oldCategory, to: newCategory, name: clip?.trackName }],
        }));
      }
      
      return {
        ...prev,
        categorized: prev.categorized.map(c =>
          c.id === clipId ? { ...c, cueType: newCategory } : c
        ),
      };
    });
  }, []);

  // Update final track data (Step 4)
  const updateFinalTrack = useCallback((clipId, field, value) => {
    setPipelineData(prev => ({
      ...prev,
      final: prev.final.map(c =>
        c.id === clipId ? { ...c, [field]: value } : c
      ),
    }));
    
    // Track name edits for learning
    if (field === 'trackName') {
      const clip = pipelineData.final.find(c => c.id === clipId);
      setModifications(m => ({
        ...m,
        nameEdits: [...m.nameEdits, { clipId, originalName: clip?.originalName, newName: value }],
      }));
    }
  }, [pipelineData.final]);

  // Constants for tick conversion
  const TICKS_PER_SECOND = 254016000000;
  const DEFAULT_FPS = 23.976;

  // Parse duration - prefer numeric fields, fallback to string parsing
  const parseDurationToSeconds = (item) => {
    if (!item) return 0;
    // Use durationSeconds if available (most accurate)
    if (typeof item.durationSeconds === 'number') {
      return item.durationSeconds;
    }
    // Use durationTicks if available
    if (typeof item.durationTicks === 'number') {
      return item.durationTicks / TICKS_PER_SECOND;
    }
    // Fallback: parse duration string
    if (item.duration) {
      const parts = item.duration.split(':').map(p => parseInt(p, 10) || 0);
      if (parts.length === 2) return parts[0] * 60 + parts[1];        // MM:SS
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]; // H:MM:SS
    }
    return 0;
  };

  // Format seconds to M:SS with 12-frame rounding
  // If frames >= 12, round up to next second; otherwise round down
  // Output format: "0:10" (no leading zero on minutes, matches Excel output)
  const formatDuration = (seconds, fps = DEFAULT_FPS) => {
    const frames = (seconds % 1) * fps;
    // Round up if frames >= 12
    const roundedSeconds = frames >= 12 ? Math.ceil(seconds) : Math.floor(seconds);
    
    const mins = Math.floor(roundedSeconds / 60);
    const secs = roundedSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Format a clip's duration using durationSeconds/durationTicks with 12-frame rounding
  const formatClipDuration = (clip) => {
    const seconds = parseDurationToSeconds(clip);
    return formatDuration(seconds);
  };

  // Calculate combined duration from main track and all stems (use longest)
  const calculateCombinedDuration = (track, stems = []) => {
    let maxSeconds = parseDurationToSeconds(track);
    
    for (const stem of stems) {
      const stemSeconds = parseDurationToSeconds(stem);
      if (stemSeconds > maxSeconds) {
        maxSeconds = stemSeconds;
      }
    }
    
    return formatDuration(maxSeconds);
  };

  // Merge a track into an existing group (Step 3)
  // When merged, stems are absorbed into the main track's duration
  // Stems don't appear on the final cue sheet - only the main track does
  const mergeIntoGroup = useCallback((sourceTrackId, targetTrackId) => {
    setPipelineData(prev => {
      const sourceTrack = prev.grouped.find(c => c.id === sourceTrackId);
      const targetTrack = prev.grouped.find(c => c.id === targetTrackId);
      
      if (!sourceTrack || !targetTrack) return prev;
      
      // Create stem entry from source track
      const newStem = {
        originalName: sourceTrack.originalName || sourceTrack.trackName,
        displayName: sourceTrack.trackName,
        stemPart: sourceTrack.trackName,
        durationTicks: sourceTrack.durationTicks,
        duration: sourceTrack.duration,
      };
      
      // Only add source track's existing stems that aren't the track itself (prevent duplicates)
      const additionalStems = (sourceTrack.stems || []).filter(stem => 
        stem.originalName !== sourceTrack.originalName &&
        stem.originalName !== sourceTrack.trackName &&
        stem.displayName !== sourceTrack.trackName
      );
      const allNewStems = [newStem, ...additionalStems];
      
      // Helper to apply merge to a track list
      const applyMerge = (tracks) => tracks
        .filter(c => c.id !== sourceTrackId) // Remove source track (absorbed into main)
        .map(c => {
          if (c.id === targetTrackId) {
            // Add stems to target track and recalculate duration
            const existingStems = c.stems || [];
            const updatedStems = [...existingStems, ...allNewStems];
            const combinedDuration = calculateCombinedDuration(c, updatedStems);
            
            return {
              ...c,
              stems: updatedStems,
              duration: combinedDuration, // Update to longest duration
              stemDurationAbsorbed: true, // Flag that stems are factored in
            };
          }
          return c;
        });
      
      // Update both grouped AND final so changes appear in Final Review
      return {
        ...prev,
        grouped: applyMerge(prev.grouped),
        final: applyMerge(prev.final),
      };
    });
    
    // Track grouping changes for learning
    setModifications(m => ({
      ...m,
      groupingChanges: [...m.groupingChanges, { sourceTrackId, targetTrackId, action: 'merge' }],
    }));
  }, []);

  // Ungroup a stem from its parent (Step 3)
  const ungroupStem = useCallback((parentTrackId, stemIndex) => {
    setPipelineData(prev => {
      const parentTrack = prev.grouped.find(c => c.id === parentTrackId);
      if (!parentTrack || !parentTrack.stems || !parentTrack.stems[stemIndex]) return prev;
      
      const stem = parentTrack.stems[stemIndex];
      
      // Create a new track from the stem
      const newTrack = {
        id: `ungrouped-${Date.now()}-${stemIndex}`,
        trackName: stem.displayName || stem.originalName || stem.stemPart,
        originalName: stem.originalName,
        cueType: 'main',
        duration: stem.duration,
        durationTicks: stem.durationTicks,
        library: parentTrack.library,
        stems: [],
      };
      
      // Helper to apply ungroup to a track list
      const applyUngroup = (tracks) => [
        ...tracks.map(c => {
          if (c.id === parentTrackId) {
            return {
              ...c,
              stems: c.stems.filter((_, idx) => idx !== stemIndex),
            };
          }
          return c;
        }),
        newTrack,
      ];
      
      // Update both grouped AND final so changes appear in Final Review
      return {
        ...prev,
        grouped: applyUngroup(prev.grouped),
        final: applyUngroup(prev.final),
      };
    });
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-auris-bg-secondary border border-auris-border rounded-xl shadow-2xl w-[900px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-auris-border">
          <div>
            <h2 className="text-lg font-semibold text-auris-text">Import Project</h2>
            <div className="flex items-center gap-3 text-sm text-auris-text-muted">
              <span>{projectInfo.projectName || 'Loading...'}</span>
                  {!isLoading && processingStats.processingTimeMs > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-0.5 rounded bg-auris-green-dim text-auris-green font-mono">
                    <Lightning size={12} className="inline mr-1" weight="fill" />
                    {processingStats.processingTimeMs}ms
                  </span>
                  {processingStats.opusUsed && (
                    <span className="text-xs px-2 py-0.5 rounded bg-auris-purple-dim text-auris-purple font-mono">
                      <Robot size={12} className="inline mr-1" />
                      AI: {processingStats.opusClassifiedCount} clips
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-auris-text-muted hover:text-auris-text hover:bg-auris-card-hover rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator - Minimal horizontal dots/line design */}
        <div className="px-6 py-3 border-b border-auris-border">
          <div className="flex items-center justify-center">
            {STEPS.map((step, index) => {
              const isActive = index === currentStep;
              const isComplete = index < currentStep;
              
              return (
                <div key={step.id} className="flex items-center">
                  {/* Step dot and label */}
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full flex items-center justify-center transition-all ${
                      isComplete ? 'bg-auris-green' :
                      isActive ? 'bg-white' :
                      'bg-auris-border'
                    }`}>
                      {isComplete && <Check size={8} weight="bold" className="text-auris-bg" />}
                    </div>
                    <span className={`text-sm transition-colors ${
                      isActive ? 'text-white font-medium' :
                      isComplete ? 'text-auris-green' :
                      'text-auris-text-muted'
                    }`}>
                      {step.title}
                    </span>
                  </div>
                  {/* Connecting line */}
                  {index < STEPS.length - 1 && (
                    <div className={`w-12 h-px mx-4 transition-colors ${
                      index < currentStep ? 'bg-auris-green' : 'bg-auris-border'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-6">
              {/* Progress Card */}
              <div className="w-full max-w-md bg-auris-card border border-auris-border rounded-xl p-6">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-medium text-auris-text mb-1">Analyzing Project</h3>
                  <p className="text-sm text-auris-text-muted">
                    {loadingProgress.description}
                  </p>
                </div>
                
                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="h-2 bg-auris-bg rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-auris-green to-auris-accent transition-all duration-300 ease-out"
                      style={{ width: `${loadingProgress.progress}%` }}
                    />
                  </div>
                </div>
                
                {/* Step Info */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <CircleNotch size={16} className="text-auris-accent animate-spin" />
                    <span className="text-auris-text">
                      Step {loadingProgress.step} of {loadingProgress.totalSteps}: {loadingProgress.stepName}
                    </span>
                  </div>
                  <span className="text-auris-text-muted font-mono">
                    {loadingProgress.progress}%
                  </span>
                </div>
                
                {/* Match Count (when available) */}
                {loadingProgress.matches > 0 && (
                  <div className="mt-3 pt-3 border-t border-auris-border">
                    <p className="text-xs text-auris-text-muted text-center">
                      Found <span className="text-auris-green font-mono">{loadingProgress.matches}</span> {loadingProgress.step <= 4 ? 'clips' : 'matches'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="text-auris-red text-center">
                <p className="text-lg font-medium">Error loading project</p>
                <p className="text-sm opacity-70">{error}</p>
              </div>
              <button
                onClick={loadProject}
                className="px-4 py-2 bg-auris-accent text-white rounded-lg hover:bg-auris-accent-hover transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {currentStep === 0 && (
                <StepClipDetection
                  clips={pipelineData.raw || []}
                  onToggleExclusion={toggleClipExclusion}
                />
              )}
              {currentStep === 1 && (
                <StepCategorization
                  clips={pipelineData.categorized || []}
                  onChangeCategory={changeClipCategory}
                />
              )}
              {currentStep === 2 && (
                <StepStemGrouping
                  clips={pipelineData.grouped || []}
                  onMergeIntoGroup={mergeIntoGroup}
                  onUngroupStem={ungroupStem}
                />
              )}
              {currentStep === 3 && (
                <StepFinalReview
                  clips={pipelineData.final || []}
                  onUpdateTrack={updateFinalTrack}
                  formatClipDuration={formatClipDuration}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-auris-border bg-auris-bg/50">
          {/* Left: Cue count in JetBrains Mono */}
          <div className="text-sm text-auris-text-muted font-mono">
            {pipelineData.final && (
              <span>{pipelineData.final.filter(c => !c.excluded && c.cueType !== 'stem').length} cues</span>
            )}
          </div>
          
          {/* Right: Button hierarchy - Ghost / Secondary / Primary */}
          <div className="flex gap-2 items-center">
            {/* Ghost button: Reset */}
            <button
              onClick={resetCurrentStep}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-auris-text-muted hover:text-auris-text transition-colors"
              title="Reset this step to original"
            >
              <ArrowCounterClockwise size={16} />
              Reset
            </button>
            
            {/* Secondary button: Back */}
            <button
              onClick={handleBack}
              disabled={currentStep === 0 || isLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm text-auris-text border border-auris-border rounded-lg hover:bg-auris-card-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            
            {/* Primary button: Next or Import */}
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-white text-auris-bg rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-white text-auris-bg rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={16} weight="bold" />
                Import
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================================
// Step 1: Clip Detection
// ============================================================================
function StepClipDetection({ clips, onToggleExclusion }) {
  const includedCount = clips.filter(c => !c.excluded).length;
  const excludedCount = clips.filter(c => c.excluded).length;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-auris-text">Detected Audio Clips</h3>
          <p className="text-sm text-auris-text-muted">
            Review the clips found in your project. Exclude non-music items like camera audio, voiceover, or temp tracks.
          </p>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="text-auris-green"><span className="font-mono">{includedCount}</span> included</span>
          <span className="text-auris-text-muted"><span className="font-mono">{excludedCount}</span> excluded</span>
        </div>
      </div>
      
      <div className="border border-auris-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-auris-bg">
            <tr className="text-left text-sm text-auris-text-muted">
              <th className="px-4 py-3 w-12">Include</th>
              <th className="px-4 py-3">Filename</th>
              <th className="px-4 py-3 w-32">Auto-Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-auris-border">
            {clips.map(clip => (
              <tr 
                key={clip.id}
                className={`h-12 transition-colors ${clip.excluded ? 'bg-auris-red/5 text-auris-text-muted' : 'hover:bg-auris-card-hover'}`}
              >
                <td className="px-4 align-middle">
                  <button
                    onClick={() => onToggleExclusion(clip.id, clip.excluded)}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                      clip.excluded 
                        ? 'bg-auris-red-dim text-auris-red hover:bg-auris-red/30' 
                        : 'bg-auris-green-dim text-auris-green hover:bg-auris-green/30'
                    }`}
                  >
                    {clip.excluded ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                </td>
                <td className="px-4 align-middle">
                  <span className={clip.excluded ? 'line-through opacity-50' : ''}>
                    {clip.originalName}
                  </span>
                </td>
                <td className="px-4 align-middle">
                  {clip.autoExcluded ? (
                    <span className="text-xs px-2 py-1 rounded bg-auris-orange-dim text-auris-orange">
                      Auto-excluded
                    </span>
                  ) : clip.excluded ? (
                    <span className="text-xs px-2 py-1 rounded bg-auris-red-dim text-auris-red">
                      Manual exclude
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded bg-auris-green-dim text-auris-green">
                      Included
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Step 2: Categorization
// ============================================================================
function StepCategorization({ clips, onChangeCategory }) {
  const [selectedClips, setSelectedClips] = useState(new Set());
  
  const mainCount = clips.filter(c => c.cueType === 'main' && !c.excluded).length;
  const sfxCount = clips.filter(c => c.cueType === 'sfx' && !c.excluded).length;
  const stemCount = clips.filter(c => c.cueType === 'stem' && !c.excluded).length;
  
  // Only show non-excluded clips
  const visibleClips = clips.filter(c => !c.excluded);
  
  // Selection state
  const allSelected = visibleClips.length > 0 && selectedClips.size === visibleClips.length;
  const someSelected = selectedClips.size > 0 && !allSelected;
  
  // Toggle individual clip selection
  const toggleSelect = (clipId) => {
    setSelectedClips(prev => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  };
  
  // Toggle all clips
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedClips(new Set());
    } else {
      setSelectedClips(new Set(visibleClips.map(c => c.id)));
    }
  };
  
  // Handle category change - applies to all selected if row is selected
  const handleCategoryChange = (clipId, newCategory) => {
    if (selectedClips.has(clipId) && selectedClips.size > 1) {
      // Apply to all selected clips
      selectedClips.forEach(id => onChangeCategory(id, newCategory));
    } else {
      // Just change this one
      onChangeCategory(clipId, newCategory);
    }
  };
  
  // Batch category change from the action bar
  const handleBatchCategoryChange = (newCategory) => {
    if (!newCategory) return;
    selectedClips.forEach(id => onChangeCategory(id, newCategory));
  };
  
  // Count clips by confidence level
  const highConfCount = visibleClips.filter(c => (c.confidence || 0) >= 0.90).length;
  const lowConfCount = visibleClips.filter(c => (c.confidence || 0) < 0.70).length;
  const aiClassifiedCount = visibleClips.filter(c => c.opusClassified).length;
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-auris-text">Categorize Clips</h3>
          <p className="text-sm text-auris-text-muted">
            Classify each clip as Main (full tracks), SFX (sound effects), or Stem (part of a larger track).
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="text-auris-blue"><span className="font-mono">{mainCount}</span> Main</span>
          <span className="text-auris-orange"><span className="font-mono">{sfxCount}</span> SFX</span>
          <span className="text-auris-purple"><span className="font-mono">{stemCount}</span> Stems</span>
          <span className="text-auris-text-muted">|</span>
          <span className="text-auris-green" title="High confidence (90%+)"><span className="font-mono">{highConfCount}</span> certain</span>
          {lowConfCount > 0 && (
            <span className="text-auris-orange" title="Low confidence - review suggested"><span className="font-mono">{lowConfCount}</span> review</span>
          )}
          {aiClassifiedCount > 0 && (
            <span className="text-auris-purple" title="AI classified"><span className="font-mono">{aiClassifiedCount}</span> AI</span>
          )}
        </div>
      </div>
      
      {/* Batch Action Bar - Always present, fades in/out */}
      <div className={`flex items-center gap-4 px-4 py-2 rounded-lg border transition-opacity duration-150
        ${selectedClips.size > 0 
          ? 'opacity-100 bg-auris-accent/10 border-auris-accent/30' 
          : 'opacity-0 pointer-events-none border-transparent'}`}
      >
          <span className="text-sm text-auris-text font-medium"><span className="font-mono">{selectedClips.size}</span> selected</span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-auris-text-muted">Set category:</span>
          <select
            onChange={(e) => handleBatchCategoryChange(e.target.value)}
            className="px-3 py-1.5 bg-auris-card border border-auris-border rounded text-sm text-auris-text focus:outline-none focus:ring-1 focus:ring-auris-accent"
            defaultValue=""
          >
            <option value="" disabled>Choose...</option>
            <option value="main">Main</option>
            <option value="sfx">SFX</option>
            <option value="stem">Stem</option>
          </select>
        </div>
        <button
          onClick={() => setSelectedClips(new Set())}
          className="ml-auto text-xs text-auris-text-muted hover:text-auris-text transition-colors"
        >
          Clear selection
        </button>
      </div>
      
      <div className="border border-auris-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-auris-bg">
            <tr className="text-left text-sm text-auris-text-muted">
              <th className="px-4 py-3 w-12">
                <button
                  onClick={toggleSelectAll}
                  className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    allSelected 
                      ? 'bg-auris-accent border-auris-accent text-white' 
                      : someSelected
                        ? 'bg-auris-accent/50 border-auris-accent text-white'
                        : 'border-auris-border hover:border-auris-accent'
                  }`}
                  title={allSelected ? 'Deselect all' : 'Select all'}
                >
                  {allSelected && <Check size={12} weight="bold" />}
                  {someSelected && <span className="w-2 h-0.5 bg-white rounded" />}
                </button>
              </th>
              <th className="px-4 py-3">Track Name</th>
              <th className="px-4 py-3 w-24">Confidence</th>
              <th className="px-4 py-3 w-32">Library</th>
              <th className="px-4 py-3 w-36">Category</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-auris-border">
            {visibleClips.map(clip => {
              const confidence = clip.confidence || 0.5;
              const isLowConf = confidence < 0.70;
              const isMedConf = confidence >= 0.70 && confidence < 0.90;
              const isAI = clip.opusClassified;
              const isSelected = selectedClips.has(clip.id);
              
              return (
                <tr 
                  key={clip.id} 
                  className={`h-12 transition-colors ${
                    isSelected 
                      ? 'bg-auris-accent/10' 
                      : isLowConf 
                        ? 'bg-auris-orange/5 hover:bg-auris-card-hover' 
                        : 'hover:bg-auris-card-hover'
                  }`}
                >
                  <td className="px-4 align-middle">
                    <button
                      onClick={() => toggleSelect(clip.id)}
                      className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                        isSelected 
                          ? 'bg-auris-accent border-auris-accent text-white' 
                          : 'border-auris-border hover:border-auris-accent'
                      }`}
                    >
                      {isSelected && <Check size={12} weight="bold" />}
                    </button>
                  </td>
                  <td className="px-4 align-middle">
                    <div className="flex items-center gap-2">
                      <span className="text-auris-text">{clip.trackName}</span>
                      {clip.isStem && (
                        <span className="text-xs text-auris-purple">(stem)</span>
                      )}
                      {isAI && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-auris-purple-dim text-auris-purple" title={clip.opusReasoning}>
                          AI
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 align-middle">
                    <div className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 font-mono ${
                      isLowConf ? 'bg-auris-orange-dim text-auris-orange' :
                      isMedConf ? 'bg-auris-blue-dim text-auris-blue' :
                      'bg-auris-green-dim text-auris-green'
                    }`}>
                      {Math.round(confidence * 100)}%
                    </div>
                  </td>
                  <td className="px-4 align-middle text-sm text-auris-text-muted">
                    {clip.library || '-'}
                  </td>
                  <td className="px-4 align-middle">
                    <select
                      value={clip.cueType}
                      onChange={(e) => handleCategoryChange(clip.id, e.target.value)}
                      className={`w-full px-3 py-1.5 bg-auris-card border rounded text-sm text-auris-text focus:outline-none focus:ring-1 focus:ring-auris-accent ${
                        isLowConf ? 'border-auris-orange/50' : 'border-auris-border'
                      }`}
                    >
                      <option value="main">Main</option>
                      <option value="sfx">SFX</option>
                      <option value="stem">Stem</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// Step 3: Stem Grouping
// ============================================================================
function StepStemGrouping({ clips, onMergeIntoGroup, onUngroupStem }) {
  const [mergeDropdown, setMergeDropdown] = useState(null);
  const [draggedTrack, setDraggedTrack] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  
  // Drag and drop handlers
  const handleDragStart = (e, track) => { setDraggedTrack(track); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragOver = (e, track) => { e.preventDefault(); if (draggedTrack && draggedTrack.id !== track.id) setDropTarget(track.id); };
  const handleDragLeave = () => setDropTarget(null);
  const handleDrop = (e, targetTrack) => { e.preventDefault(); if (draggedTrack && draggedTrack.id !== targetTrack.id) { onMergeIntoGroup(draggedTrack.id, targetTrack.id); } setDraggedTrack(null); setDropTarget(null); };
  const handleDragEnd = () => { setDraggedTrack(null); setDropTarget(null); }
  
  // Group clips by their parent (stems under main tracks)
  const mainTracks = clips.filter(c => c.cueType !== 'stem' && !c.excluded);
  const tracksWithStems = mainTracks.filter(c => c.stems && c.stems.length > 0);
  const tracksWithoutStems = mainTracks.filter(c => !c.stems || c.stems.length === 0);
  
  // Get available merge targets (tracks with stems)
  const mergeTargets = tracksWithStems;
  
  const handleMerge = (sourceId, targetId) => {
    onMergeIntoGroup(sourceId, targetId);
    setMergeDropdown(null);
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-auris-text">Stem Grouping</h3>
          <p className="text-sm text-auris-text-muted">
            Drag and drop tracks to merge them, or use the "Merge into" button.
          </p>
        </div>
        <div className="text-sm text-auris-text-muted">
          {tracksWithStems.length} tracks with stems
        </div>
      </div>
      
      {tracksWithStems.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-auris-text-secondary">Tracks with Stems</h4>
          {tracksWithStems.map(track => (
            <div key={track.id} draggable onDragStart={(e) => handleDragStart(e, track)} onDragOver={(e) => handleDragOver(e, track)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, track)} onDragEnd={handleDragEnd} className={`border rounded-lg overflow-hidden cursor-grab ${dropTarget === track.id ? "border-auris-green bg-auris-green/10" : draggedTrack?.id === track.id ? "opacity-50" : "border-auris-border"}`}>
              <div className="h-12 px-4 bg-auris-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-auris-text font-medium">{track.trackName}</span>
                  <span className="text-xs text-auris-text-muted">(<span className="font-mono">{track.stems.length}</span> stems)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded bg-auris-purple-dim text-auris-purple">
                    {track.library || 'Unknown Library'}
                  </span>
                  
                  {/* Merge this group into another track */}
                  <div className="relative">
                    <button
                      onClick={() => setMergeDropdown(mergeDropdown === track.id ? null : track.id)}
                      className="text-xs px-2 py-1 rounded bg-auris-card border border-auris-border hover:border-auris-accent text-auris-text-muted hover:text-auris-text transition-colors"
                    >
                      Merge into...
                    </button>
                    
                    {mergeDropdown === track.id && (
                      <div className="absolute right-0 top-full mt-1 w-72 bg-auris-card border border-auris-border rounded-lg shadow-xl z-50 py-1 max-h-64 overflow-auto">
                        <div className="px-3 py-2 text-xs text-auris-text-muted border-b border-auris-border">
                          Merge "{track.trackName}" into:
                        </div>
                        {mainTracks.filter(t => t.id !== track.id).map(target => (
                          <button
                            key={target.id}
                            onClick={() => { onMergeIntoGroup(track.id, target.id); setMergeDropdown(null); }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-auris-card-hover transition-colors flex items-center justify-between"
                          >
                            <span className="text-auris-text truncate">{target.trackName}</span>
                            {target.stems?.length > 0 && (
                              <span className="text-xs text-auris-purple ml-2 font-mono">{target.stems.length} stems</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="px-4 py-2 bg-auris-bg/50 space-y-1">
                {track.stems.map((stem, idx) => (
                  <div key={idx} className="flex items-center justify-between group">
                    <div className="flex items-center gap-2 text-sm text-auris-text-muted">
                      <TreeStructure size={14} className="text-auris-purple" />
                      <span>{stem.stemPart || stem.displayName || stem.originalName}</span>
                    </div>
                    <button
                      onClick={() => onUngroupStem(track.id, idx)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-auris-text-muted hover:text-auris-red transition-all"
                      title="Remove from group"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {tracksWithoutStems.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-auris-text-secondary">Standalone Tracks (<span className="font-mono">{tracksWithoutStems.length}</span>)</h4>
          <div className="border border-auris-border rounded-lg divide-y divide-auris-border">
            {tracksWithoutStems.map(track => (
              <div key={track.id} draggable onDragStart={(e) => handleDragStart(e, track)} onDragOver={(e) => handleDragOver(e, track)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, track)} onDragEnd={handleDragEnd} className={`h-12 px-4 flex items-center justify-between cursor-grab ${dropTarget === track.id ? "bg-auris-green/20" : draggedTrack?.id === track.id ? "opacity-50" : "hover:bg-auris-card-hover"}`}>
                <span className="text-auris-text">{track.trackName}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded ${
                    track.cueType === 'sfx' ? 'bg-auris-orange-dim text-auris-orange' : 'bg-auris-blue-dim text-auris-blue'
                  }`}>
                    {track.cueType.toUpperCase()}
                  </span>
                  
                  {/* Merge dropdown */}
                  {mergeTargets.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setMergeDropdown(mergeDropdown === track.id ? null : track.id)}
                        className="text-xs px-2 py-1 rounded bg-auris-card border border-auris-border hover:border-auris-accent text-auris-text-muted hover:text-auris-text transition-colors"
                      >
                        Merge into...
                      </button>
                      
                      {mergeDropdown === track.id && (
                        <div className="absolute right-0 top-full mt-1 w-64 bg-auris-card border border-auris-border rounded-lg shadow-xl z-50 py-1 max-h-48 overflow-auto">
                          <div className="px-3 py-2 text-xs text-auris-text-muted border-b border-auris-border">
                            Select target track:
                          </div>
                          {mergeTargets.map(target => (
                            <button
                              key={target.id}
                              onClick={() => handleMerge(track.id, target.id)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-auris-card-hover transition-colors flex items-center justify-between"
                            >
                              <span className="text-auris-text truncate">{target.trackName}</span>
                              <span className="text-xs text-auris-purple ml-2 font-mono">
                                {target.stems.length} stems
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {tracksWithStems.length === 0 && tracksWithoutStems.length === 0 && (
        <div className="text-center text-auris-text-muted py-8">
          No tracks found
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step 4: Final Review
// ============================================================================
function StepFinalReview({ clips, onUpdateTrack, formatClipDuration }) {
  // Only show main and SFX (not stems, not excluded)
  const finalCues = clips.filter(c => c.cueType !== 'stem' && !c.excluded);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-auris-text">Final Cue Sheet Review</h3>
          <p className="text-sm text-auris-text-muted">
            Review and edit the final cue sheet. Click on any field to edit.
          </p>
        </div>
        <div className="text-sm">
          <span className="text-auris-green font-medium font-mono">{finalCues.length}</span>
          <span className="text-auris-green font-medium"> cues</span>
          <span className="text-auris-text-muted"> ready to import</span>
        </div>
      </div>
      
      <div className="border border-auris-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-auris-bg">
            <tr className="text-left text-sm text-auris-text-muted">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Track Name</th>
              <th className="px-4 py-3 w-24">Duration</th>
              <th className="px-4 py-3 w-28">Type</th>
              <th className="px-4 py-3 w-36">Library</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-auris-border">
            {finalCues.map((clip, index) => (
              <tr key={clip.id} className="h-12 hover:bg-auris-card-hover transition-colors">
                <td className="px-4 align-middle text-auris-text-muted font-mono">
                  {index + 1}
                </td>
                <td className="px-4 align-middle">
                  <input
                    type="text"
                    value={clip.trackName}
                    onChange={(e) => onUpdateTrack(clip.id, 'trackName', e.target.value)}
                    className="w-full bg-transparent text-auris-text border-b border-transparent hover:border-auris-border focus:border-auris-accent focus:outline-none transition-colors"
                  />
                </td>
                <td className="px-4 align-middle text-sm text-auris-text-muted font-mono">
                  {formatClipDuration ? formatClipDuration(clip) : (clip.duration || '-')}
                </td>
                <td className="px-4 align-middle">
                  <span className={`text-xs px-2 py-1 rounded ${
                    clip.cueType === 'sfx' ? 'bg-auris-orange-dim text-auris-orange' : 'bg-auris-blue-dim text-auris-blue'
                  }`}>
                    {clip.cueType === 'sfx' ? 'SFX' : 'MAIN'}
                  </span>
                </td>
                <td className="px-4 align-middle text-sm text-auris-text-muted">
                  {clip.library || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
