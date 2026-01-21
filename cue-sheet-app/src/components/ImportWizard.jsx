import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Check, CircleNotch, Eye, EyeSlash, MusicNote, Waveform, TreeStructure, ListChecks, Lightning, Robot } from '@phosphor-icons/react';

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
  { id: 'clips', title: 'Clip Detection', icon: MusicNote, description: 'Review detected audio clips' },
  { id: 'categorize', title: 'Categorization', icon: Waveform, description: 'Main, SFX, or Stem?' },
  { id: 'stems', title: 'Stem Grouping', icon: TreeStructure, description: 'Group related stems' },
  { id: 'review', title: 'Final Review', icon: ListChecks, description: 'Approve cue sheet' },
];

export default function ImportWizard({ isOpen, onClose, onComplete, projectPath }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Pipeline data at each stage
  const [pipelineData, setPipelineData] = useState({
    raw: null,           // Step 1: Raw clips from parser
    categorized: null,   // Step 2: After categorization
    grouped: null,       // Step 3: After stem grouping
    final: null,         // Step 4: Final approved list
  });
  
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
    if (isOpen && projectPath) {
      loadProject();
    }
  }, [isOpen, projectPath]);

  const loadProject = async () => {
    setIsLoading(true);
    setError(null);
    setCurrentStep(0);
    
    try {
      // Call the pipeline to parse the project
      const result = await window.electronAPI.parseProjectForWizard(projectPath);
      
      if (result.success) {
        setProjectInfo({
          projectName: result.projectName,
          spotTitle: result.spotTitle,
          filePath: projectPath,
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
    // Save modifications for learning
    if (Object.values(modifications).some(arr => arr.length > 0)) {
      try {
        await window.electronAPI.saveImportPatterns({
          projectPath,
          modifications,
        });
      } catch (err) {
        console.error('Failed to save patterns:', err);
      }
    }
    
    // Return the final cue list
    onComplete({
      cues: pipelineData.final,
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
                  <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                    <Lightning size={12} className="inline mr-1" weight="fill" />
                    {processingStats.processingTimeMs}ms
                  </span>
                  {processingStats.opusUsed && (
                    <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
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

        {/* Step Indicator */}
        <div className="px-6 py-4 border-b border-auris-border bg-auris-bg/50">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isComplete = index < currentStep;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
                    isActive ? 'bg-auris-accent/20 text-auris-accent' :
                    isComplete ? 'text-green-400' :
                    'text-auris-text-muted'
                  }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      isActive ? 'bg-auris-accent text-white' :
                      isComplete ? 'bg-green-500/20 text-green-400' :
                      'bg-auris-card text-auris-text-muted'
                    }`}>
                      {isComplete ? <Check size={16} weight="bold" /> : <Icon size={16} />}
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className="text-xs opacity-70">{step.description}</p>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className={`w-8 h-0.5 mx-2 ${
                      index < currentStep ? 'bg-green-500' : 'bg-auris-border'
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
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <CircleNotch size={48} className="text-auris-accent animate-spin" />
              <p className="text-auris-text-muted">Analyzing project...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <div className="text-red-400 text-center">
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
                />
              )}
              {currentStep === 3 && (
                <StepFinalReview
                  clips={pipelineData.final || []}
                  onUpdateTrack={updateFinalTrack}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-auris-border bg-auris-bg/50">
          <div className="text-sm text-auris-text-muted">
            {pipelineData.final && (
              <span>{pipelineData.final.filter(c => !c.excluded && c.cueType !== 'stem').length} cues will be imported</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleBack}
              disabled={currentStep === 0 || isLoading}
              className="flex items-center gap-2 px-4 py-2 text-auris-text-secondary hover:text-auris-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ArrowLeft size={18} />
              Back
            </button>
            
            {currentStep < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 bg-auris-accent text-white rounded-lg hover:bg-auris-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ArrowRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={18} weight="bold" />
                Import Cue Sheet
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
          <span className="text-green-400">{includedCount} included</span>
          <span className="text-auris-text-muted">{excludedCount} excluded</span>
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
                className={`transition-colors ${clip.excluded ? 'bg-red-500/5 text-auris-text-muted' : 'hover:bg-auris-card-hover'}`}
              >
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggleExclusion(clip.id, clip.excluded)}
                    className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
                      clip.excluded 
                        ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    }`}
                  >
                    {clip.excluded ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={clip.excluded ? 'line-through opacity-50' : ''}>
                    {clip.originalName}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {clip.autoExcluded ? (
                    <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">
                      Auto-excluded
                    </span>
                  ) : clip.excluded ? (
                    <span className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400">
                      Manual exclude
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
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
  const mainCount = clips.filter(c => c.cueType === 'main' && !c.excluded).length;
  const sfxCount = clips.filter(c => c.cueType === 'sfx' && !c.excluded).length;
  const stemCount = clips.filter(c => c.cueType === 'stem' && !c.excluded).length;
  
  // Only show non-excluded clips
  const visibleClips = clips.filter(c => !c.excluded);
  
  // Count clips by confidence level
  const highConfCount = visibleClips.filter(c => (c.confidence || 0) >= 0.90).length;
  const medConfCount = visibleClips.filter(c => (c.confidence || 0) >= 0.70 && (c.confidence || 0) < 0.90).length;
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
          <span className="text-blue-400">{mainCount} Main</span>
          <span className="text-orange-400">{sfxCount} SFX</span>
          <span className="text-purple-400">{stemCount} Stems</span>
          <span className="text-auris-text-muted">|</span>
          <span className="text-green-400" title="High confidence (90%+)">{highConfCount} certain</span>
          {lowConfCount > 0 && (
            <span className="text-yellow-400" title="Low confidence - review suggested">{lowConfCount} review</span>
          )}
          {aiClassifiedCount > 0 && (
            <span className="text-purple-400" title="AI classified">{aiClassifiedCount} AI</span>
          )}
        </div>
      </div>
      
      <div className="border border-auris-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-auris-bg">
            <tr className="text-left text-sm text-auris-text-muted">
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
              
              return (
                <tr 
                  key={clip.id} 
                  className={`hover:bg-auris-card-hover transition-colors ${isLowConf ? 'bg-yellow-500/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-auris-text">{clip.trackName}</span>
                      {clip.isStem && (
                        <span className="text-xs text-purple-400">(stem)</span>
                      )}
                      {isAI && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400" title={clip.opusReasoning}>
                          AI
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1 ${
                      isLowConf ? 'bg-yellow-500/20 text-yellow-400' :
                      isMedConf ? 'bg-blue-500/20 text-blue-400' :
                      'bg-green-500/20 text-green-400'
                    }`}>
                      {Math.round(confidence * 100)}%
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-auris-text-muted">
                    {clip.library || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={clip.cueType}
                      onChange={(e) => onChangeCategory(clip.id, e.target.value)}
                      className={`w-full px-3 py-1.5 bg-auris-card border rounded text-sm text-auris-text focus:outline-none focus:ring-1 focus:ring-auris-accent ${
                        isLowConf ? 'border-yellow-500/50' : 'border-auris-border'
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
function StepStemGrouping({ clips }) {
  // Group clips by their parent (stems under main tracks)
  const mainTracks = clips.filter(c => c.cueType !== 'stem' && !c.excluded);
  const tracksWithStems = mainTracks.filter(c => c.stems && c.stems.length > 0);
  const tracksWithoutStems = mainTracks.filter(c => !c.stems || c.stems.length === 0);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-auris-text">Stem Grouping</h3>
          <p className="text-sm text-auris-text-muted">
            Review how stems are grouped under their parent tracks. Stems will be hidden in the final cue sheet.
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
            <div key={track.id} className="border border-auris-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-auris-card flex items-center justify-between">
                <div>
                  <span className="text-auris-text font-medium">{track.trackName}</span>
                  <span className="ml-2 text-xs text-auris-text-muted">({track.stems.length} stems)</span>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-400">
                  {track.library || 'Unknown Library'}
                </span>
              </div>
              <div className="px-4 py-2 bg-auris-bg/50 space-y-1">
                {track.stems.map((stem, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-auris-text-muted">
                    <TreeStructure size={14} className="text-purple-400" />
                    <span>{stem.stemPart || stem.displayName || stem.originalName}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {tracksWithoutStems.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-auris-text-secondary">Standalone Tracks ({tracksWithoutStems.length})</h4>
          <div className="border border-auris-border rounded-lg divide-y divide-auris-border">
            {tracksWithoutStems.slice(0, 10).map(track => (
              <div key={track.id} className="px-4 py-2 flex items-center justify-between hover:bg-auris-card-hover transition-colors">
                <span className="text-auris-text">{track.trackName}</span>
                <span className={`text-xs px-2 py-1 rounded ${
                  track.cueType === 'sfx' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {track.cueType.toUpperCase()}
                </span>
              </div>
            ))}
            {tracksWithoutStems.length > 10 && (
              <div className="px-4 py-2 text-sm text-auris-text-muted text-center">
                + {tracksWithoutStems.length - 10} more tracks
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Step 4: Final Review
// ============================================================================
function StepFinalReview({ clips, onUpdateTrack }) {
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
          <span className="text-green-400 font-medium">{finalCues.length} cues</span>
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
              <tr key={clip.id} className="hover:bg-auris-card-hover transition-colors">
                <td className="px-4 py-3 text-auris-text-muted">
                  {index + 1}
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={clip.trackName}
                    onChange={(e) => onUpdateTrack(clip.id, 'trackName', e.target.value)}
                    className="w-full bg-transparent text-auris-text border-b border-transparent hover:border-auris-border focus:border-auris-accent focus:outline-none transition-colors"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-auris-text-muted">
                  {clip.duration || '-'}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded ${
                    clip.cueType === 'sfx' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {clip.cueType === 'sfx' ? 'SFX' : 'MAIN'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-auris-text-muted">
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
