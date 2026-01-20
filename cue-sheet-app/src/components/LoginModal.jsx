/**
 * Login Modal - Authentication UI for sign in/sign up
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginModal({ isOpen, onClose }) {
  const { signIn, signUp, isConfigured } = useAuth();
  const [mode, setMode] = useState('signin'); // 'signin' or 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      const result = mode === 'signin' 
        ? await signIn(email, password)
        : await signUp(email, password);

      if (result.success) {
        // Both signin and signup now auto-login the user
        onClose();
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
    setSuccess('');
    setConfirmPassword('');
  };

  if (!isConfigured) {
    return createPortal(
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal login-modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Cloud Not Configured</h2>
            <button className="close-btn" onClick={onClose}>x</button>
          </div>
          <div className="modal-content">
            <div className="not-configured-message">
              <p>Cloud features are not configured.</p>
              <p>To enable multi-user features, add your Supabase credentials to the .env file:</p>
              <pre>
                SUPABASE_URL=your-project-url{'\n'}
                SUPABASE_ANON_KEY=your-anon-key
              </pre>
              <p>You can get these from your Supabase project dashboard under Settings &gt; API.</p>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal login-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>

        <div className="modal-content">
          <form onSubmit={handleSubmit} className="login-form">
            {error && (
              <div className="error-message">{error}</div>
            )}
            {success && (
              <div className="success-message">{success}</div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                disabled={isLoading}
              />
            </div>

            {mode === 'signup' && (
              <div className="form-group">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>
            )}

            <button 
              type="submit" 
              className="submit-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Loading...' : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mode-switch">
            {mode === 'signin' ? (
              <p>
                Don't have an account?{' '}
                <button type="button" onClick={switchMode} className="link-btn">
                  Create one
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{' '}
                <button type="button" onClick={switchMode} className="link-btn">
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>

        <style>{`
          .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            backdrop-filter: blur(8px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
          }
          
          .login-modal {
            width: 420px;
            max-width: 90vw;
            background: #0a0a0a;
            border: 1px solid #222;
            border-radius: 12px;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
            position: relative;
            z-index: 100000;
          }
          
          .login-modal .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid #1a1a1a;
          }
          
          .login-modal .modal-header h2 {
            font-size: 15px;
            font-weight: 500;
            color: #e5e5e5;
            margin: 0;
            letter-spacing: 0.5px;
          }
          
          .login-modal .close-btn {
            background: none;
            border: none;
            color: #555;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            line-height: 1;
            transition: color 0.2s;
          }
          
          .login-modal .close-btn:hover {
            color: #aaa;
          }
          
          .login-modal .modal-content {
            padding: 24px;
          }
          
          .login-form {
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          
          .form-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          
          .form-group label {
            font-size: 11px;
            color: #666;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          
          .form-group input {
            padding: 14px 16px;
            background: #111;
            border: 1px solid #222;
            border-radius: 8px;
            color: #e5e5e5;
            font-size: 14px;
            transition: border-color 0.2s;
          }
          
          .form-group input::placeholder {
            color: #444;
          }
          
          .form-group input:focus {
            outline: none;
            border-color: #333;
          }
          
          .form-group input:disabled {
            opacity: 0.5;
          }
          
          .submit-btn {
            margin-top: 8px;
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
          
          .success-message {
            padding: 12px 14px;
            background: rgba(34, 197, 94, 0.1);
            border: 1px solid rgba(34, 197, 94, 0.2);
            border-radius: 8px;
            color: #4ade80;
            font-size: 13px;
          }
          
          .mode-switch {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #1a1a1a;
            text-align: center;
            color: #555;
            font-size: 13px;
          }
          
          .link-btn {
            background: none;
            border: none;
            color: #6ee7b7;
            cursor: pointer;
            font-size: 13px;
          }
          
          .link-btn:hover {
            text-decoration: underline;
          }
          
          .not-configured-message {
            text-align: center;
            color: #666;
          }
          
          .not-configured-message pre {
            background: #111;
            padding: 12px;
            border-radius: 8px;
            text-align: left;
            font-size: 12px;
            margin: 16px 0;
            color: #6ee7b7;
            border: 1px solid #222;
          }
        `}</style>
      </div>
    </div>,
    document.body
  );
}
