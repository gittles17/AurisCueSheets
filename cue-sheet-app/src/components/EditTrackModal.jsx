/**
 * Edit Track Modal - Edit learned track data with cloud sync
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FloppyDisk } from '@phosphor-icons/react';

export default function EditTrackModal({ isOpen, onClose, track, onSave }) {
  const [formData, setFormData] = useState({
    trackName: '',
    artist: '',
    source: '',
    trackNumber: '',
    composer: '',
    publisher: '',
    library: '',
    useType: 'BI',
    catalogCode: '',
    masterContact: ''
  });
  // Optimistic updates - no loading states needed

  useEffect(() => {
    if (track && isOpen) {
      setFormData({
        trackName: track.trackName || track.track_name || '',
        artist: track.artist || '',
        source: track.source || '',
        trackNumber: track.trackNumber || track.track_number || '',
        composer: track.composer || '',
        publisher: track.publisher || '',
        library: track.library || track.label || '',
        useType: track.useType || track.use_type || track.use || 'BI',
        catalogCode: track.catalogCode || track.catalog_code || '',
        masterContact: track.masterContact || track.master_contact || ''
      });
      setError('');
      setSyncStatus(null);
    }
  }, [track, isOpen]);

  if (!isOpen || !track) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const updatedTrack = {
      ...track,
      trackName: formData.trackName,
      artist: formData.artist,
      source: formData.source,
      trackNumber: formData.trackNumber,
      composer: formData.composer,
      publisher: formData.publisher,
      library: formData.library,
      label: formData.library,
      useType: formData.useType,
      use: formData.useType,
      catalogCode: formData.catalogCode,
      masterContact: formData.masterContact
    };

    // Optimistic update - notify parent and close immediately
    onSave?.(updatedTrack);
    onClose(true);

    // Save to cloud in background (single source of truth)
    if (window.electronAPI?.cloudTrackSave) {
      window.electronAPI.cloudTrackSave(updatedTrack).catch(err => {
        console.error('[EditTrack] Cloud save failed:', err);
      });
    }
  };

  return createPortal(
    <div className="edit-track-overlay" onClick={() => onClose(false)}>
      <div className="edit-track-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2>Edit Track</h2>
            <p className="header-subtitle">{formData.trackName || 'Untitled'}</p>
          </div>
          <button className="close-btn" onClick={() => onClose(false)}>x</button>
        </div>

        {/* Content */}
        <div className="modal-content">
          <form onSubmit={handleSubmit}>

            {/* Row 1: Track Name */}
            <div className="form-row">
              <div className="form-group">
                <label>Track Name *</label>
                <input
                  name="trackName"
                  type="text"
                  value={formData.trackName}
                  onChange={handleChange}
                  placeholder="Track name"
                  
                  required
                />
              </div>
            </div>

            {/* Row 2: Artist & Source */}
            <div className="form-row">
              <div className="form-group">
                <label>Artist</label>
                <input
                  name="artist"
                  type="text"
                  value={formData.artist}
                  onChange={handleChange}
                  placeholder="Artist/Performer"
                  
                />
              </div>
              <div className="form-group">
                <label>Source</label>
                <input
                  name="source"
                  type="text"
                  value={formData.source}
                  onChange={handleChange}
                  placeholder="e.g., BMG Production Music"
                  
                />
              </div>
            </div>

            {/* Row 3: Track # & Composer */}
            <div className="form-row">
              <div className="form-group" style={{flex: '0 0 100px'}}>
                <label>Track #</label>
                <input
                  name="trackNumber"
                  type="text"
                  value={formData.trackNumber}
                  onChange={handleChange}
                  placeholder="N/A"
                  
                />
              </div>
              <div className="form-group flex-2">
                <label>Composer</label>
                <input
                  name="composer"
                  type="text"
                  value={formData.composer}
                  onChange={handleChange}
                  placeholder="Composer name(s)"
                  
                />
              </div>
            </div>

            {/* Row 4: Publisher */}
            <div className="form-row">
              <div className="form-group">
                <label>Publisher</label>
                <input
                  name="publisher"
                  type="text"
                  value={formData.publisher}
                  onChange={handleChange}
                  placeholder="Publisher name(s)"
                  
                />
              </div>
            </div>

            {/* Row 5: Master/Label/Library & Use */}
            <div className="form-row">
              <div className="form-group flex-2">
                <label>Master/Label/Library</label>
                <input
                  name="library"
                  type="text"
                  value={formData.library}
                  onChange={handleChange}
                  placeholder="e.g., BMG Production Music"
                  
                />
              </div>
              <div className="form-group" style={{flex: '0 0 120px'}}>
                <label>Use</label>
                <select
                  name="useType"
                  value={formData.useType}
                  onChange={handleChange}
                  
                >
                  <option value="BI">BI</option>
                  <option value="BV">BV</option>
                  <option value="VI">VI</option>
                  <option value="VV">VV</option>
                  <option value="MT">MT</option>
                  <option value="ET">ET</option>
                </select>
              </div>
            </div>

            {/* Row 6: Additional fields (Catalog Code & Master Contact) */}
            <div className="form-row">
              <div className="form-group">
                <label>Catalog Code</label>
                <input
                  name="catalogCode"
                  type="text"
                  value={formData.catalogCode}
                  onChange={handleChange}
                  placeholder="e.g., IATS021"
                  
                />
              </div>
              <div className="form-group">
                <label>Master Contact</label>
                <input
                  name="masterContact"
                  type="text"
                  value={formData.masterContact}
                  onChange={handleChange}
                  placeholder="Master rights contact"
                  
                />
              </div>
            </div>

            {/* Actions */}
            <div className="form-actions">
              <div className="buttons">
                <button type="button" onClick={() => onClose(false)} className="cancel-btn">
                  Cancel
                </button>
                <button type="submit" className="save-btn">
                  <FloppyDisk size={16} />
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>

        <style>{`
          .edit-track-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
          }
          
          .edit-track-modal {
            width: 640px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            background: #0a0a0a;
            border: 1px solid #222;
            border-radius: 12px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
          }
          
          .modal-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid #1a1a1a;
          }
          
          .modal-header h2 {
            font-size: 16px;
            font-weight: 500;
            color: #e5e5e5;
            margin: 0;
          }
          
          .header-subtitle {
            font-size: 12px;
            color: #555;
            margin: 4px 0 0 0;
          }
          
          .close-btn {
            background: none;
            border: none;
            color: #555;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
          }
          
          .close-btn:hover {
            color: #aaa;
          }
          
          .modal-content {
            padding: 24px;
          }
          
          .form-row {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
          }
          
          .form-group {
            flex: 1;
          }
          
          .form-group.flex-2 {
            flex: 2;
          }
          
          .form-group label {
            display: block;
            font-size: 11px;
            font-weight: 500;
            color: #555;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }
          
          .form-group input,
          .form-group select {
            width: 100%;
            padding: 12px 14px;
            background: #111;
            border: 1px solid #222;
            border-radius: 8px;
            color: #e5e5e5;
            font-size: 13px;
          }
          
          .form-group input::placeholder {
            color: #444;
          }
          
          .form-group input:focus,
          .form-group select:focus {
            outline: none;
            border-color: #333;
          }
          
          .form-group input:disabled,
          .form-group select:disabled {
            opacity: 0.5;
          }
          
          .error-message {
            padding: 12px 14px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 8px;
            color: #f87171;
            font-size: 13px;
            margin-bottom: 16px;
          }
          
          .form-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px solid #1a1a1a;
          }
          
          .sync-status {
            flex: 1;
          }
          
          .sync-status .status {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
          }
          
          .sync-status .syncing {
            color: #60a5fa;
          }
          
          .sync-status .synced {
            color: #6ee7b7;
          }
          
          .sync-status .error {
            color: #fbbf24;
          }
          
          .buttons {
            display: flex;
            gap: 12px;
          }
          
          .cancel-btn {
            padding: 12px 20px;
            background: transparent;
            border: 1px solid #222;
            border-radius: 8px;
            color: #666;
            font-size: 14px;
            cursor: pointer;
          }
          
          .cancel-btn:hover:not(:disabled) {
            background: #111;
            color: #aaa;
          }
          
          .save-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            background: #e5e5e5;
            border: none;
            border-radius: 8px;
            color: #0a0a0a;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
          }
          
          .save-btn:hover:not(:disabled) {
            background: #fff;
          }
          
          .save-btn:disabled,
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
