/**
 * Add/Edit Source Modal - Admin UI for managing data sources
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Brain, CloudArrowDown, Globe } from '@phosphor-icons/react';

const CATEGORY_OPTIONS = [
  { value: 'ai', label: 'AI Model', icon: Brain, color: 'text-purple-400', description: 'AI-powered extraction (requires API key)' },
  { value: 'apis', label: 'API', icon: CloudArrowDown, color: 'text-blue-400', description: 'Direct API connection' },
  { value: 'smartlookup', label: 'Smart Look-up', icon: Globe, color: 'text-green-400', description: 'Browser-based search' }
];

export default function AddSourceModal({ isOpen, onClose, editSource, defaultCategory }) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    category: defaultCategory || 'smartlookup',
    description: '',
    searchUrl: '',
    requiresKey: false,
    keyFields: [],
    apiKey: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isEditing = !!editSource;

  // Initialize form when editing
  useEffect(() => {
    if (editSource) {
      setFormData({
        id: editSource.id || '',
        name: editSource.name || '',
        category: editSource.category || 'smartlookup',
        description: editSource.description || '',
        searchUrl: editSource.searchUrl || editSource.search_url || '',
        requiresKey: editSource.requiresKey || editSource.requires_key || false,
        keyFields: editSource.keyFields || editSource.key_fields || [],
        apiKey: editSource.config?.apiKey || ''
      });
    } else {
      setFormData(prev => ({
        ...prev,
        id: '',
        name: '',
        category: defaultCategory || 'smartlookup',
        description: '',
        searchUrl: '',
        requiresKey: false,
        keyFields: [],
        apiKey: ''
      }));
    }
    setError('');
    setSuccess(false);
  }, [editSource, defaultCategory, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const generateId = (name) => {
    return name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }

    if (formData.category === 'smartlookup' && !formData.searchUrl.trim()) {
      setError('Search URL is required for Smart Look-up sources');
      return;
    }


    setIsLoading(true);

    try {
      const sourceId = isEditing ? formData.id : generateId(formData.name);
      const hasApiKey = !!(formData.apiKey && formData.apiKey.trim());
      
      const sourceData = {
        id: sourceId,
        name: formData.name.trim(),
        category: formData.category,
        description: formData.description.trim(),
        searchUrl: formData.searchUrl.trim() || null,
        requiresKey: hasApiKey,
        keyFields: hasApiKey ? ['apiKey'] : [],
        enabled: true
      };

      let result;
      if (isEditing) {
        result = await window.electronAPI.cloudSourcesUpdate(sourceData.id, sourceData);
      } else {
        result = await window.electronAPI.cloudSourcesAdd(sourceData);
      }

      // Save API key locally if provided
      if (hasApiKey && window.electronAPI?.updateSourceConfig) {
        await window.electronAPI.updateSourceConfig(sourceId, { apiKey: formData.apiKey.trim() });
        // Test the connection
        await window.electronAPI.testConnection(sourceId);
      }

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose(true);
        }, 1200);
      } else {
        setError(result.error || 'Failed to save source');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const currentCategory = CATEGORY_OPTIONS.find(c => c.value === formData.category);
  const CategoryIcon = currentCategory?.icon || Globe;

  return createPortal(
    <div className="add-source-overlay" onClick={() => onClose(false)}>
      <div className="add-source-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="header-content">
            <div className={`category-icon ${currentCategory?.color || ''}`}>
              <CategoryIcon size={20} weight="duotone" />
            </div>
            <div>
              <h2>{isEditing ? 'Edit Source' : `Add ${currentCategory?.label || 'Source'}`}</h2>
              <p className="header-desc">{currentCategory?.description}</p>
            </div>
          </div>
          <button className="close-btn" onClick={() => onClose(false)}>x</button>
        </div>

        {/* Content */}
        <div className="modal-content">
          <form onSubmit={handleSubmit}>
            {error && <div className="error-message">{error}</div>}
            {success && (
              <div className="success-message">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginRight: 8 }}>
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {isEditing ? 'Source updated!' : 'Source added successfully!'}
              </div>
            )}

            {/* Category selector (only if not editing and no default) */}
            {!isEditing && !defaultCategory && (
              <div className="category-selector">
                <label>Type</label>
                <div className="category-options">
                  {CATEGORY_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        className={`category-btn ${formData.category === opt.value ? 'active' : ''}`}
                        onClick={() => setFormData(prev => ({ ...prev, category: opt.value }))}
                      >
                        <Icon size={18} className={opt.color} weight="duotone" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Name */}
            <div className="form-group">
              <label>Source Name *</label>
              <input
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder={
                  formData.category === 'ai' ? 'e.g., OpenAI GPT-4' :
                  formData.category === 'apis' ? 'e.g., SoundExchange' :
                  'e.g., Pond5 Music'
                }
                disabled={isLoading}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="form-group">
              <label>Description</label>
              <input
                name="description"
                type="text"
                value={formData.description}
                onChange={handleChange}
                placeholder="Brief description of this source"
                disabled={isLoading}
              />
            </div>

            {/* Smart Look-up: Search URL */}
            {formData.category === 'smartlookup' && (
              <div className="form-group">
                <label>Search URL *</label>
                <input
                  name="searchUrl"
                  type="text"
                  value={formData.searchUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/search?q="
                  disabled={isLoading}
                />
                <p className="help-text">
                  The URL where users search for tracks. The track name will be appended automatically.
                </p>
              </div>
            )}

            {/* AI/API: API Key */}
            {formData.category !== 'smartlookup' && (
              <div className="form-group">
                <label>API Key</label>
                <input
                  name="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={handleChange}
                  placeholder="Enter your API key"
                  disabled={isLoading}
                />
                <p className="help-text">
                  Your API key will be stored locally and never uploaded to the cloud.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="form-actions">
              <button type="button" onClick={() => onClose(false)} className="cancel-btn" disabled={isLoading}>
                Cancel
              </button>
              <button type="submit" className="submit-btn" disabled={isLoading || success}>
                {isLoading ? 'Saving...' : success ? 'Done!' : (isEditing ? 'Save Changes' : 'Add Source')}
              </button>
            </div>
          </form>
        </div>

        <style>{`
          .add-source-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
          }
          
          .add-source-modal {
            width: 480px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            background: #08090d;
            border: 1px solid #262626;
            border-radius: 12px;
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.7);
          }
          
          .modal-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid #262626;
          }
          
          .header-content {
            display: flex;
            align-items: flex-start;
            gap: 12px;
          }
          
          .category-icon {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #0a0d12;
            border-radius: 8px;
          }
          
          .modal-header h2 {
            font-size: 16px;
            font-weight: 500;
            color: #ffffff;
            margin: 0 0 4px 0;
          }
          
          .header-desc {
            font-size: 12px;
            color: #737373;
            margin: 0;
          }
          
          .close-btn {
            background: none;
            border: none;
            color: #737373;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
          }
          
          .close-btn:hover {
            color: #a3a3a3;
          }
          
          .modal-content {
            padding: 24px;
          }
          
          .category-selector {
            margin-bottom: 20px;
          }
          
          .category-selector > label {
            display: block;
            font-size: 11px;
            font-weight: 500;
            color: #737373;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
          }
          
          .category-options {
            display: flex;
            gap: 10px;
          }
          
          .category-btn {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 16px 12px;
            background: #0a0d12;
            border: 1px solid #262626;
            border-radius: 8px;
            color: #737373;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .category-btn:hover {
            background: #0c0e14;
            color: #a3a3a3;
          }
          
          .category-btn.active {
            background: #0c0e14;
            border-color: #333333;
            color: #ffffff;
          }
          
          .form-group {
            margin-bottom: 16px;
          }
          
          .form-group > label {
            display: block;
            font-size: 11px;
            font-weight: 500;
            color: #737373;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          
          .form-group input[type="text"],
          .form-group input[type="password"] {
            width: 100%;
            padding: 14px 16px;
            background: #0a0d12;
            border: 1px solid #262626;
            border-radius: 8px;
            color: #ffffff;
            font-size: 14px;
          }
          
          .form-group input::placeholder {
            color: #737373;
          }
          
          .form-group input:focus {
            outline: none;
            border-color: #7AAED4;
            box-shadow: 0 0 0 3px rgba(122, 174, 212, 0.15);
          }
          
          .form-group input:disabled {
            opacity: 0.5;
          }
          
          .checkbox-group {
            margin-bottom: 16px;
          }
          
          .checkbox-label {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
            font-size: 13px;
            color: #a3a3a3;
          }
          
          .checkbox-label input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: #5BB09A;
          }
          
          .help-text {
            font-size: 11px;
            color: #737373;
            margin-top: 6px;
          }
          
          .error-message {
            padding: 12px 14px;
            background: rgba(212, 145, 138, 0.15);
            border: 1px solid rgba(212, 145, 138, 0.3);
            border-radius: 8px;
            color: #D4918A;
            font-size: 13px;
            margin-bottom: 16px;
          }
          
          .success-message {
            display: flex;
            align-items: center;
            padding: 12px 14px;
            background: rgba(91, 176, 154, 0.15);
            border: 1px solid rgba(91, 176, 154, 0.3);
            border-radius: 8px;
            color: #5BB09A;
            font-size: 13px;
            margin-bottom: 16px;
            animation: fadeIn 0.3s ease;
          }
          
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          .form-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #262626;
          }
          
          .cancel-btn {
            padding: 12px 20px;
            background: transparent;
            border: 1px solid #262626;
            border-radius: 8px;
            color: #737373;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .cancel-btn:hover:not(:disabled) {
            background: #0a0d12;
            color: #a3a3a3;
          }
          
          .submit-btn {
            padding: 12px 24px;
            background: #ffffff;
            border: none;
            border-radius: 8px;
            color: #000000;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .submit-btn:hover:not(:disabled) {
            background: #e5e5e5;
          }
          
          .submit-btn:disabled,
          .cancel-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
