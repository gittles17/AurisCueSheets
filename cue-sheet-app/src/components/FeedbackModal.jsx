/**
 * Feedback Modal - Allows users to submit feedback and manage their profile
 */

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PaperPlaneTilt, User, Bug, Lightbulb, ChatCircle, Check } from '@phosphor-icons/react';

const CATEGORIES = [
  { id: 'bug', label: 'Bug Report', icon: Bug, color: 'text-red-400' },
  { id: 'feature', label: 'Feature Request', icon: Lightbulb, color: 'text-amber-400' },
  { id: 'general', label: 'General Feedback', icon: ChatCircle, color: 'text-blue-400' }
];

export default function FeedbackModal({ isOpen, onClose }) {
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Load profile on mount
  useEffect(() => {
    if (isOpen) {
      loadProfile();
      setSubmitted(false);
      setMessage('');
      setError('');
    }
  }, [isOpen]);

  const loadProfile = async () => {
    try {
      const savedProfile = await window.electronAPI.getProfile();
      if (savedProfile) {
        setProfile({
          name: savedProfile.name || '',
          email: savedProfile.email || ''
        });
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!message.trim()) {
      setError('Please enter your feedback');
      return;
    }

    if (!profile.name.trim()) {
      setError('Please enter your name');
      return;
    }

    setIsLoading(true);

    try {
      // Save profile first
      await window.electronAPI.saveProfile(profile);

      // Submit feedback
      const result = await window.electronAPI.submitFeedback({
        category,
        message: message.trim()
      });

      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error || 'Failed to submit feedback');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="feedback-overlay" onClick={onClose}>
      <div className="feedback-modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Send Feedback</h2>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>

        <div className="modal-content">
          {submitted ? (
            <div className="success-state">
              <div className="success-icon">
                <Check size={32} weight="bold" />
              </div>
              <h3>Thank you!</h3>
              <p>Your feedback has been submitted successfully.</p>
              <button onClick={onClose} className="done-btn">
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="feedback-form">
              {error && (
                <div className="error-message">{error}</div>
              )}

              {/* Profile Section */}
              <div className="profile-section">
                <div className="section-header">
                  <User size={16} />
                  <span>Your Info</span>
                </div>
                <div className="profile-fields">
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))}
                    placeholder="Your name *"
                    disabled={isLoading}
                  />
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile(p => ({ ...p, email: e.target.value }))}
                    placeholder="Email (optional)"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Category Selection */}
              <div className="category-section">
                <div className="section-header">
                  <span>Category</span>
                </div>
                <div className="category-options">
                  {CATEGORIES.map(cat => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`category-btn ${category === cat.id ? 'active' : ''}`}
                        disabled={isLoading}
                      >
                        <Icon size={18} className={cat.color} />
                        <span>{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message */}
              <div className="message-section">
                <div className="section-header">
                  <span>Message</span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    category === 'bug' 
                      ? 'Describe the bug and how to reproduce it...'
                      : category === 'feature'
                      ? 'Describe the feature you would like to see...'
                      : 'Share your thoughts, suggestions, or questions...'
                  }
                  rows={5}
                  disabled={isLoading}
                />
              </div>

              {/* Submit */}
              <button 
                type="submit" 
                className="submit-btn"
                disabled={isLoading || !message.trim() || !profile.name.trim()}
              >
                {isLoading ? (
                  'Sending...'
                ) : (
                  <>
                    <PaperPlaneTilt size={18} />
                    Send Feedback
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <style>{`
          .feedback-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
          }
          
          .feedback-modal-container {
            width: 480px;
            max-width: 90vw;
            max-height: 90vh;
            overflow-y: auto;
            background: #0a0a0a;
            border: 1px solid #222;
            border-radius: 12px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
            position: relative;
            z-index: 100000;
          }
          
          .feedback-modal-container .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid #1a1a1a;
          }
          
          .feedback-modal-container .modal-header h2 {
            font-size: 15px;
            font-weight: 500;
            color: #e5e5e5;
            letter-spacing: 0.5px;
          }
          
          .feedback-modal-container .close-btn {
            background: none;
            border: none;
            color: #555;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
            transition: color 0.2s;
          }
          
          .feedback-modal-container .close-btn:hover {
            color: #aaa;
          }
          
          .feedback-modal-container .modal-content {
            padding: 24px;
          }
          
          .feedback-form {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          
          .section-header {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            font-weight: 500;
            color: #555;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .profile-section .profile-fields {
            display: flex;
            gap: 10px;
          }
          
          .profile-fields input {
            flex: 1;
            padding: 14px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 8px;
            color: #e5e5e5;
            font-size: 14px;
          }
          
          .profile-fields input::placeholder {
            color: #444;
          }
          
          .profile-fields input:focus {
            outline: none;
            border-color: #333;
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
            padding: 14px 10px;
            background: #111;
            border: 1px solid #222;
            border-radius: 8px;
            color: #666;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .category-btn:hover {
            background: #1a1a1a;
            color: #aaa;
          }
          
          .category-btn.active {
            background: #1a1a1a;
            border-color: #333;
            color: #e5e5e5;
          }
          
          .message-section textarea {
            width: 100%;
            padding: 14px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 8px;
            color: #e5e5e5;
            font-size: 14px;
            resize: vertical;
            min-height: 100px;
            font-family: inherit;
          }
          
          .message-section textarea:focus {
            outline: none;
            border-color: #333;
          }
          
          .message-section textarea::placeholder {
            color: #444;
          }
          
          .submit-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 14px;
            background: #e5e5e5;
            border: none;
            border-radius: 8px;
            color: #0a0a0a;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
          }
          
          .submit-btn:hover:not(:disabled) {
            background: #fff;
          }
          
          .submit-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          
          .error-message {
            padding: 12px 14px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 8px;
            color: #f87171;
            font-size: 13px;
          }
          
          .success-state {
            text-align: center;
            padding: 24px 0;
          }
          
          .success-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 16px;
            background: rgba(110, 231, 183, 0.1);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #6ee7b7;
          }
          
          .success-state h3 {
            font-size: 18px;
            font-weight: 500;
            margin-bottom: 8px;
            color: #e5e5e5;
          }
          
          .success-state p {
            color: #666;
            font-size: 14px;
            margin-bottom: 24px;
          }
          
          .done-btn {
            padding: 12px 28px;
            background: #1a1a1a;
            border: 1px solid #222;
            border-radius: 8px;
            color: #e5e5e5;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .done-btn:hover {
            background: #222;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
