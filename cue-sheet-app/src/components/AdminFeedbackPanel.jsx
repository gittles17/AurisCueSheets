/**
 * Admin Feedback Panel - Shows all user feedback for admin review
 */

import { useState, useEffect } from 'react';
import { Bug, Lightbulb, ChatCircle, Check, Eye, Clock, CircleNotch, EnvelopeSimple, User, Cloud, Desktop } from '@phosphor-icons/react';

const CATEGORY_INFO = {
  bug: { icon: Bug, color: 'text-red-400', bg: 'bg-red-400/10', label: 'Bug' },
  feature: { icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-400/10', label: 'Feature' },
  general: { icon: ChatCircle, color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'General' }
};

const STATUS_INFO = {
  new: { icon: Clock, color: 'text-blue-400', label: 'New' },
  read: { icon: Eye, color: 'text-amber-400', label: 'Read' },
  resolved: { icon: Check, color: 'text-green-400', label: 'Resolved' }
};

export default function AdminFeedbackPanel() {
  const [feedback, setFeedback] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'new', 'read', 'resolved'

  useEffect(() => {
    loadFeedback();
  }, []);

  const loadFeedback = async () => {
    setIsLoading(true);
    try {
      const data = await window.electronAPI.getAllFeedback();
      setFeedback(data || []);
    } catch (err) {
      console.error('Failed to load feedback:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (feedbackId, newStatus) => {
    try {
      const result = await window.electronAPI.updateFeedbackStatus(feedbackId, newStatus, '');
      if (result.success) {
        setFeedback(prev => prev.map(f => 
          f.id === feedbackId ? { ...f, status: newStatus } : f
        ));
        if (selectedFeedback?.id === feedbackId) {
          setSelectedFeedback(prev => ({ ...prev, status: newStatus }));
        }
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filteredFeedback = filter === 'all' 
    ? feedback 
    : feedback.filter(f => f.status === filter);

  const newCount = feedback.filter(f => f.status === 'new').length;

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <div className="admin-feedback-panel">
      {/* Header */}
      <div className="panel-header">
        <div className="header-title">
          <h3>User Feedback</h3>
          {newCount > 0 && (
            <span className="new-badge">{newCount} new</span>
          )}
        </div>
        <div className="header-actions">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All ({feedback.length})</option>
            <option value="new">New ({feedback.filter(f => f.status === 'new').length})</option>
            <option value="read">Read ({feedback.filter(f => f.status === 'read').length})</option>
            <option value="resolved">Resolved ({feedback.filter(f => f.status === 'resolved').length})</option>
          </select>
          <button onClick={loadFeedback} className="refresh-btn" title="Refresh">
            <CircleNotch size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="panel-content">
        {isLoading ? (
          <div className="loading-state">
            <CircleNotch size={24} className="animate-spin text-blue-400" />
            <span>Loading feedback...</span>
          </div>
        ) : filteredFeedback.length === 0 ? (
          <div className="empty-state">
            <ChatCircle size={32} weight="thin" />
            <p>No feedback yet</p>
          </div>
        ) : (
          <div className="feedback-list">
            {filteredFeedback.map(item => {
              const catInfo = CATEGORY_INFO[item.category] || CATEGORY_INFO.general;
              const statusInfo = STATUS_INFO[item.status] || STATUS_INFO.new;
              const CatIcon = catInfo.icon;
              const StatusIcon = statusInfo.icon;
              
              return (
                <div 
                  key={item.id} 
                  className={`feedback-item ${selectedFeedback?.id === item.id ? 'selected' : ''} ${item.status === 'new' ? 'is-new' : ''}`}
                  onClick={() => {
                    setSelectedFeedback(item);
                    if (item.status === 'new') {
                      handleStatusChange(item.id, 'read');
                    }
                  }}
                >
                  <div className="item-header">
                    <div className={`category-badge ${catInfo.bg}`}>
                      <CatIcon size={12} className={catInfo.color} />
                      <span className={catInfo.color}>{catInfo.label}</span>
                    </div>
                    <div className={`status-badge ${statusInfo.color}`}>
                      <StatusIcon size={12} />
                    </div>
                  </div>
                  <div className="item-user">
                    <User size={12} />
                    <span>{item.user_name || 'Anonymous'}</span>
                    {item.source === 'cloud' ? (
                      <Cloud size={10} className="text-blue-400" title="Cloud" />
                    ) : (
                      <Desktop size={10} className="text-gray-400" title="Local" />
                    )}
                  </div>
                  <p className="item-preview">{item.message}</p>
                  <span className="item-date">{formatDate(item.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedFeedback && (
        <div className="detail-panel">
          <div className="detail-header">
            <h4>Feedback Details</h4>
            <button onClick={() => setSelectedFeedback(null)} className="close-detail">x</button>
          </div>
          
          <div className="detail-content">
            <div className="detail-meta">
              <div className="meta-row">
                <User size={14} />
                <span>{selectedFeedback.user_name || 'Anonymous'}</span>
              </div>
              {selectedFeedback.user_email && (
                <div className="meta-row">
                  <EnvelopeSimple size={14} />
                  <a href={`mailto:${selectedFeedback.user_email}`}>{selectedFeedback.user_email}</a>
                </div>
              )}
              <div className="meta-row">
                <Clock size={14} />
                <span>{formatDate(selectedFeedback.created_at)}</span>
              </div>
              {selectedFeedback.app_version && (
                <div className="meta-row text-xs text-gray-500">
                  v{selectedFeedback.app_version}
                </div>
              )}
            </div>

            <div className="detail-message">
              {selectedFeedback.message}
            </div>

            <div className="detail-actions">
              <span className="action-label">Status:</span>
              {Object.entries(STATUS_INFO).map(([status, info]) => {
                const Icon = info.icon;
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(selectedFeedback.id, status)}
                    className={`status-btn ${selectedFeedback.status === status ? 'active' : ''}`}
                  >
                    <Icon size={14} className={info.color} />
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .admin-feedback-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid #334155;
        }
        
        .header-title {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .header-title h3 {
          font-size: 14px;
          font-weight: 600;
        }
        
        .new-badge {
          font-size: 10px;
          padding: 2px 6px;
          background: #3b82f6;
          color: white;
          border-radius: 10px;
        }
        
        .header-actions {
          display: flex;
          gap: 8px;
        }
        
        .filter-select {
          padding: 4px 8px;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 4px;
          color: #f1f5f9;
          font-size: 12px;
        }
        
        .refresh-btn {
          padding: 4px;
          background: transparent;
          border: 1px solid #334155;
          border-radius: 4px;
          color: #94a3b8;
          cursor: pointer;
        }
        
        .refresh-btn:hover {
          background: #334155;
          color: #f1f5f9;
        }
        
        .panel-content {
          flex: 1;
          overflow-y: auto;
        }
        
        .loading-state,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          gap: 8px;
          color: #64748b;
        }
        
        .feedback-list {
          padding: 8px;
        }
        
        .feedback-item {
          padding: 12px;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          margin-bottom: 8px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .feedback-item:hover {
          border-color: #475569;
        }
        
        .feedback-item.selected {
          border-color: #3b82f6;
        }
        
        .feedback-item.is-new {
          border-left: 3px solid #3b82f6;
        }
        
        .item-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        
        .category-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
        }
        
        .status-badge {
          opacity: 0.7;
        }
        
        .item-user {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: #94a3b8;
          margin-bottom: 6px;
        }
        
        .item-preview {
          font-size: 12px;
          color: #e2e8f0;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          margin-bottom: 6px;
        }
        
        .item-date {
          font-size: 10px;
          color: #64748b;
        }
        
        .detail-panel {
          border-top: 1px solid #334155;
          background: #0f172a;
        }
        
        .detail-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-bottom: 1px solid #334155;
        }
        
        .detail-header h4 {
          font-size: 12px;
          font-weight: 600;
        }
        
        .close-detail {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 16px;
        }
        
        .detail-content {
          padding: 12px;
        }
        
        .detail-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #334155;
        }
        
        .meta-row {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #94a3b8;
        }
        
        .meta-row a {
          color: #3b82f6;
          text-decoration: none;
        }
        
        .meta-row a:hover {
          text-decoration: underline;
        }
        
        .detail-message {
          font-size: 13px;
          color: #e2e8f0;
          line-height: 1.5;
          white-space: pre-wrap;
          margin-bottom: 12px;
          max-height: 150px;
          overflow-y: auto;
        }
        
        .detail-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .action-label {
          font-size: 11px;
          color: #64748b;
        }
        
        .status-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 4px;
          color: #94a3b8;
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .status-btn:hover {
          background: #334155;
        }
        
        .status-btn.active {
          background: #334155;
          border-color: #475569;
          color: #f1f5f9;
        }
      `}</style>
    </div>
  );
}
