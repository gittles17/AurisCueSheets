import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ArrowRight, ArrowLeft, Sparkle } from '@phosphor-icons/react';

// Sample cue data for the tour demo
// Note: Some tracks share the same library so sibling detection can find suggestions
export const SAMPLE_CUE_DATA = [
  {
    id: 'tour-1',
    trackName: 'Punch Drunk',
    composer: 'Walter Werzowa (BMI)(100%)',
    publisher: 'BMG Production Music (UK) Ltd',
    duration: '0:32',
    useType: 'Background Instrumental',
    library: 'BMG Ka-Pow',
    source: 'BMG',
    status: 'complete',
    composerConfidence: 0.95,
    publisherConfidence: 0.95
  },
  {
    id: 'tour-2',
    trackName: 'Fire Thunder Hit',
    composer: 'Walter Werzowa (BMI)(100%)',
    publisher: 'BMG Production Music (UK) Ltd',
    duration: '0:08',
    useType: 'Sound Effect',
    library: 'BMG Beyond',
    source: 'BMG',
    status: 'complete',
    composerConfidence: 0.92,
    publisherConfidence: 0.92
  },
  {
    id: 'tour-3',
    trackName: 'Epic Rise Build',
    composer: '',
    publisher: '',
    duration: '0:15',
    useType: 'Background Instrumental',
    library: 'BMG Ka-Pow',
    source: '',
    status: 'pending',
    composerConfidence: 0,
    publisherConfidence: 0
  },
  {
    id: 'tour-4',
    trackName: 'Tension Underscore',
    composer: '',
    publisher: '',
    duration: '1:24',
    useType: 'Background Instrumental',
    library: 'BMG Beyond',
    source: '',
    status: 'pending',
    composerConfidence: 0,
    publisherConfidence: 0
  }
];

// Tour step definitions - 6 steps, UI highlighting only
const TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome',
    content: "Welcome to Auris! 60 seconds to get you started.",
    target: null,
    position: 'center'
  },
  {
    id: 'import',
    title: 'Import',
    content: "Drop a Premiere Pro file here. Auris reads your timeline and auto-fills what it can.",
    target: '[data-tour="drop-zone"]',
    position: 'right'
  },
  {
    id: 'workspace',
    title: 'Workspace',
    content: "Projects on the left. Tabs up top. Your cue sheet works like Excel. Because it basically is.",
    target: '[data-tour="workspace"]',
    position: 'bottom'
  },
  {
    id: 'smart-fill-1',
    title: 'Smart Fill - Step 1',
    content: "First, click the AI toggle to enable Smart Fill mode...",
    target: '[data-tour="ai-toggle"]',
    position: 'left',
    demoAction: 'enableAI'
  },
  {
    id: 'smart-fill-2',
    title: 'Smart Fill - Step 2',
    content: "Now select empty cells that need data. Watch as we select the Source cells for tracks 3 and 4...",
    target: '[data-tour="cue-table"]',
    position: 'top',
    demoAction: 'selectCells'
  },
  {
    id: 'smart-fill-3',
    title: 'Smart Fill - Step 3',
    content: "The AI suggestion panel appears! It found similar tracks and suggests the same source. Click a suggestion to fill all selected cells.",
    target: null,
    position: 'center',
    demoAction: 'showPanel'
  },
  {
    id: 'auris-chat',
    title: 'Auris Chat',
    content: "This is your secret weapon. Auris learns your patterns and gets smarter with every cue sheet. Try: 'Fill these based on similar tracks.'",
    target: '[data-tour="ask-auris"]',
    position: 'left',
    demoAction: 'hidePanel'
  },
  {
    id: 'done',
    title: 'Done',
    content: "You're ready. Auto-saves as you work. Export to Excel anytime. JG believes in you.",
    target: null,
    position: 'center',
    isFinal: true
  }
];

/**
 * Spotlight Overlay - dims everything except the target
 */
function SpotlightOverlay({ targetRect, isVisible }) {
  if (!isVisible) return null;
  
  // If no target, just show a semi-transparent overlay
  if (!targetRect) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[9998] transition-opacity duration-300" style={{ pointerEvents: 'none' }} />
    );
  }
  
  const padding = 8;
  const { top, left, width, height } = targetRect;
  
  return (
    <div className="fixed inset-0 z-[9998]" style={{ pointerEvents: 'none' }}>
      {/* Top */}
      <div 
        className="absolute bg-black/70 left-0 right-0 top-0 transition-all duration-300"
        style={{ height: Math.max(0, top - padding), pointerEvents: 'none' }}
      />
      {/* Bottom */}
      <div 
        className="absolute bg-black/70 left-0 right-0 bottom-0 transition-all duration-300"
        style={{ top: top + height + padding, pointerEvents: 'none' }}
      />
      {/* Left */}
      <div 
        className="absolute bg-black/70 left-0 transition-all duration-300"
        style={{ 
          top: Math.max(0, top - padding), 
          width: Math.max(0, left - padding),
          height: height + padding * 2,
          pointerEvents: 'none'
        }}
      />
      {/* Right */}
      <div 
        className="absolute bg-black/70 right-0 transition-all duration-300"
        style={{ 
          top: Math.max(0, top - padding), 
          left: left + width + padding,
          height: height + padding * 2,
          pointerEvents: 'none'
        }}
      />
      {/* Spotlight border */}
      <div 
        className="absolute border-2 border-auris-blue rounded-lg transition-all duration-300 shadow-lg shadow-auris-blue/30"
        style={{
          top: top - padding,
          left: left - padding,
          width: width + padding * 2,
          height: height + padding * 2,
          pointerEvents: 'none'
        }}
      />
    </div>
  );
}

/**
 * Tooltip component
 */
function TourTooltip({ step, stepIndex, totalSteps, targetRect, onNext, onBack, onSkip }) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef(null);
  
  useEffect(() => {
    if (!tooltipRef.current) return;
    
    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    const headerHeight = 70; // Header is 56px + some padding
    
    let top, left;
    
    if (step.position === 'center' || !targetRect) {
      // Center in viewport (below header)
      top = headerHeight + (viewportHeight - headerHeight - tooltipRect.height) / 2;
      left = (viewportWidth - tooltipRect.width) / 2;
    } else {
      // Position relative to target
      switch (step.position) {
        case 'right':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
          left = targetRect.right + padding;
          break;
        case 'left':
          top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
          left = targetRect.left - tooltipRect.width - padding;
          break;
        case 'bottom':
          top = targetRect.bottom + padding;
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
          break;
        case 'top':
          top = targetRect.top - tooltipRect.height - padding;
          left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
          break;
        default:
          top = targetRect.bottom + padding;
          left = targetRect.left;
      }
      
      // Clamp to viewport - ensure tooltip stays below header
      top = Math.max(headerHeight, Math.min(top, viewportHeight - tooltipRect.height - padding));
      left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));
    }
    
    setPosition({ top, left });
  }, [step, targetRect]);
  
  const isFirstStep = stepIndex === 0;
  const isLastStep = step.isFinal;
  const isCenterModal = step.position === 'center';
  
  return (
    <div
      ref={tooltipRef}
      className={`fixed transition-all duration-300 ${isCenterModal ? 'w-96' : 'w-80'}`}
      style={{ top: position.top, left: position.left, pointerEvents: 'auto', zIndex: 10002 }}
    >
      <div className={`bg-auris-card border border-auris-border rounded-xl shadow-2xl overflow-hidden ${isCenterModal ? 'p-6' : 'p-4'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isCenterModal && <Sparkle size={20} className="text-auris-blue" weight="fill" />}
            <h3 className={`font-medium text-auris-text ${isCenterModal ? 'text-lg' : 'text-sm'}`}>
              {step.title}
            </h3>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSkip();
            }}
            className="p-2 hover:bg-auris-bg rounded transition-colors text-auris-text-muted hover:text-auris-text"
            title="Skip tour"
          >
            <X size={16} style={{ pointerEvents: 'none' }} />
          </button>
        </div>
        
        {/* Content */}
        <p className={`text-auris-text-secondary mb-4 ${isCenterModal ? 'text-base' : 'text-sm'}`}>
          {step.content}
        </p>
        
        {/* Progress */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === stepIndex ? 'bg-auris-blue' : i < stepIndex ? 'bg-auris-blue/50' : 'bg-auris-border'
                }`}
              />
            ))}
          </div>
          
          {/* Navigation */}
          <div className="flex items-center gap-2">
            {!isFirstStep && !isLastStep && (
              <button
                onClick={onBack}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-auris-text-muted hover:text-auris-text transition-colors"
              >
                <ArrowLeft size={14} />
                Back
              </button>
            )}
            
            {isLastStep ? (
              <button
                onClick={onSkip}
                className="px-4 py-2 text-sm bg-auris-blue text-white rounded-lg hover:bg-auris-blue/90 transition-colors"
              >
                Start Working
              </button>
            ) : (
              <button
                onClick={onNext}
                className="flex items-center gap-1 px-4 py-1.5 text-sm bg-auris-blue text-white rounded-lg hover:bg-auris-blue/90 transition-colors"
              >
                {isFirstStep ? (
                  <>
                    Let's Go
                    <ArrowRight size={14} />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main GuidedTour component
 */
function GuidedTour({ 
  isActive, 
  onComplete, 
  onLoadSampleData, 
  onClearSampleData,
  onEnableAI,
  onSelectEmptyCells,
  onShowPanel,
  onHidePanel
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [sampleDataLoaded, setSampleDataLoaded] = useState(false);
  
  const step = TOUR_STEPS[currentStep];
  
  // Load sample data when entering workspace step (step index 2)
  useEffect(() => {
    if (isActive && currentStep >= 2 && !sampleDataLoaded && onLoadSampleData) {
      onLoadSampleData();
      setSampleDataLoaded(true);
    }
  }, [isActive, currentStep, sampleDataLoaded, onLoadSampleData]);
  
  // Demo actions for Smart Fill steps
  useEffect(() => {
    if (!isActive) return;
    
    const currentStepData = TOUR_STEPS[currentStep];
    if (!currentStepData?.demoAction) return;
    
    // Small delay to let the tooltip render first
    const timer = setTimeout(() => {
      switch (currentStepData.demoAction) {
        case 'enableAI':
          if (onEnableAI) onEnableAI();
          break;
        case 'selectCells':
          if (onSelectEmptyCells) onSelectEmptyCells();
          break;
        case 'showPanel':
          if (onShowPanel) onShowPanel();
          break;
        case 'hidePanel':
          if (onHidePanel) onHidePanel();
          break;
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [isActive, currentStep, onEnableAI, onSelectEmptyCells, onShowPanel, onHidePanel]);
  
  // Reset states when tour becomes inactive
  useEffect(() => {
    if (!isActive) {
      setSampleDataLoaded(false);
      setCurrentStep(0);
    }
  }, [isActive]);
  
  // Update target rect when step changes
  useEffect(() => {
    if (!isActive) return;
    
    const updateTargetRect = () => {
      if (step.target) {
        const element = document.querySelector(step.target);
        if (element) {
          setTargetRect(element.getBoundingClientRect());
        } else {
          setTargetRect(null);
        }
      } else {
        setTargetRect(null);
      }
    };
    
    updateTargetRect();
    
    // Update on resize
    window.addEventListener('resize', updateTargetRect);
    return () => window.removeEventListener('resize', updateTargetRect);
  }, [isActive, step, currentStep]);
  
  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep]);
  
  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);
  
  const handleSkip = useCallback(() => {
    // Save that user completed/skipped tour
    localStorage.setItem('auris_tour_completed', 'true');
    
    // Clear sample data
    if (onClearSampleData) {
      onClearSampleData();
    }
    
    if (onComplete) {
      onComplete();
    }
  }, [onComplete, onClearSampleData]);
  
  if (!isActive) return null;
  
  return createPortal(
    <>
      <SpotlightOverlay targetRect={targetRect} isVisible={true} />
      <TourTooltip
        step={step}
        stepIndex={currentStep}
        totalSteps={TOUR_STEPS.length}
        targetRect={targetRect}
        onNext={handleNext}
        onBack={handleBack}
        onSkip={handleSkip}
      />
    </>,
    document.body
  );
}

export default GuidedTour;

// Export check function
export function shouldShowTour() {
  return !localStorage.getItem('auris_tour_completed');
}

// Export reset function for testing
export function resetTour() {
  localStorage.removeItem('auris_tour_completed');
}
