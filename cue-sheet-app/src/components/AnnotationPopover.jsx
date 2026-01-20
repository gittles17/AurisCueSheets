import { useState, useRef, useEffect } from 'react';
import { X, Trash, PaintBucket, PaperPlaneTilt } from '@phosphor-icons/react';
import { createPortal } from 'react-dom';

const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { id: 'green', label: 'Green', class: 'bg-green-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
];

/**
 * Popover for creating/editing highlight annotations
 * Can be triggered from selection context menu or by clicking annotation badge
 */
function AnnotationPopover({
  isOpen,
  onClose,
  position, // { x, y } screen coordinates
  mode = 'create', // 'create' or 'edit'
  initialColor = 'yellow',
  initialAnnotation = '',
  selectedCount = 0,
  onSubmit, // (color, annotation) => void
  onDelete, // () => void for edit mode
  onSendToChat // (annotation) => void - sends to Auris Chat
}) {
  const [color, setColor] = useState(initialColor);
  const [annotation, setAnnotation] = useState(initialAnnotation);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const popoverRef = useRef(null);
  const textareaRef = useRef(null);

  // Reset state when popover opens
  useEffect(() => {
    if (isOpen) {
      setColor(initialColor);
      setAnnotation(initialAnnotation);
      setShowColorPicker(false);
      // Focus textarea after a short delay
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, initialColor, initialAnnotation]);

  // Handle click outside to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, annotation, color]);

  const handleSubmit = () => {
    onSubmit?.(color, annotation);
    onClose();
  };

  const handleSendToChat = () => {
    onSendToChat?.(annotation);
    onClose();
  };

  const handleDelete = () => {
    onDelete?.();
    onClose();
  };

  if (!isOpen) return null;

  // Calculate position to keep popover in viewport
  const getPopoverStyle = () => {
    if (!position) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    
    const padding = 16;
    const popoverWidth = 320;
    const popoverHeight = 200;
    
    let x = position.x;
    let y = position.y;
    
    // Keep within viewport
    if (x + popoverWidth > window.innerWidth - padding) {
      x = window.innerWidth - popoverWidth - padding;
    }
    if (y + popoverHeight > window.innerHeight - padding) {
      y = window.innerHeight - popoverHeight - padding;
    }
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    
    return { top: y, left: x };
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999]"
      style={{ pointerEvents: 'auto' }}
    >
      <div
        ref={popoverRef}
        className="fixed bg-auris-card border border-auris-border rounded-xl shadow-modal w-80 overflow-hidden"
        style={getPopoverStyle()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-auris-border flex items-center justify-between">
          <span className="text-sm font-medium text-auris-text">
            {mode === 'create' ? (
              <>Highlight {selectedCount > 0 ? `${selectedCount} rows` : 'selection'}</>
            ) : (
              'Edit Annotation'
            )}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-auris-card-hover transition-colors"
          >
            <X size={14} className="text-auris-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Color picker */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-2">
              <PaintBucket size={14} className="text-auris-text-muted" />
              <span className="text-xs text-auris-text-muted">Color</span>
            </div>
            <div className="flex gap-2">
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setColor(c.id)}
                  className={`
                    w-7 h-7 rounded-full ${c.class} transition-all
                    ${color === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-auris-card' : 'hover:scale-110'}
                  `}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* Annotation textarea */}
          <div className="mb-4">
            <label className="block text-xs text-auris-text-muted mb-2">
              Note / Instruction for AI
            </label>
            <textarea
              ref={textareaRef}
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="e.g., Look up composer info for these tracks..."
              className="w-full bg-auris-bg border border-auris-border rounded-lg px-3 py-2 text-sm text-auris-text placeholder:text-auris-text-muted focus:outline-none focus:border-auris-blue resize-none"
              rows={3}
            />
            <p className="text-[10px] text-auris-text-muted/60 mt-1">
              Cmd+Enter to save
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {mode === 'edit' && onDelete && (
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-xs text-auris-red hover:bg-auris-red-dim rounded-lg transition-colors"
                >
                  <Trash size={14} className="inline mr-1" />
                  Remove
                </button>
              )}
            </div>
            
            <div className="flex gap-2">
              {onSendToChat && annotation.trim() && (
                <button
                  onClick={handleSendToChat}
                  className="px-3 py-1.5 text-xs bg-auris-purple-dim text-auris-purple hover:bg-auris-purple/20 rounded-lg transition-colors flex items-center gap-1"
                >
                  <PaperPlaneTilt size={12} />
                  Send to Chat
                </button>
              )}
              <button
                onClick={handleSubmit}
                className="px-4 py-1.5 text-xs bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                {mode === 'create' ? 'Highlight' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default AnnotationPopover;
