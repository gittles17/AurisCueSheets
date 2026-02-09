/**
 * Login Page - Full screen authentication page shown on app start
 */

import { useState } from 'react';
import { SignIn, Eye, EyeSlash, Crown, ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';

const ALLOWED_DOMAIN = 'createadvertising.com';

// Version and features
const VERSION = 'v0.13';
const WHATS_NEW = [
  { title: 'Auto-Update Restart', description: 'Restart button now works reliably on unsigned macOS builds.' },
  { title: 'API Keys Load Automatically', description: 'API keys load automatically after sign-in.' },
  { title: 'Delete Key Fix', description: 'Delete/Backspace clears selected cells on the first keypress.' },
];

export default function LoginPage({ onLogin }) {
  const { signIn, signUp, verifyAdminPassword } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState('signin'); // 'signin' or 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState('');
  
  // Admin login state
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!username || !password) {
      setError('Please enter your name and password');
      return;
    }

    // Build full email from username
    const email = `${username.trim()}@${ALLOWED_DOMAIN}`;

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
        onLogin();
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    setAdminError('');
    
    if (!adminPassword) {
      setAdminError('Please enter admin password');
      return;
    }

    const result = await verifyAdminPassword(adminPassword);
    if (result.success) {
      onLogin();
    } else {
      setAdminError('Incorrect password');
    }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
    setSuccess('');
    setConfirmPassword('');
  };

  return (
    <div className="login-page">
      {/* Draggable header area */}
      <div className="drag-header" />

      {/* Admin button at top */}
      <button 
        className="admin-btn"
        onClick={() => setShowAdminLogin(!showAdminLogin)}
      >
        <Crown size={16} weight={showAdminLogin ? 'fill' : 'regular'} />
        Admin
      </button>

      {/* Admin Login Popup */}
      {showAdminLogin && (
        <div className="admin-popup">
          <div className="admin-popup-content">
            <h4>Admin Access</h4>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Admin password"
              onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
              autoFocus
            />
            {adminError && <span className="admin-error">{adminError}</span>}
            <div className="admin-actions">
              <button onClick={() => setShowAdminLogin(false)} className="cancel-btn">
                Cancel
              </button>
              <button onClick={handleAdminLogin} className="login-btn">
                Login
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content - scrollable */}
      <div className="login-scroll-container">
        {/* Hero Section - Vertically Centered */}
        <div className="hero-section">
          <div className="login-container">
            {/* Logo */}
            <div className="logo-section">
              <img 
                src="./auris-wordmark.svg" 
                alt="Auris" 
                className="logo"
              />
              <p className="tagline">CUE SHEETS</p>
            </div>

            {/* Sign In Button or Form */}
            {!showForm ? (
              <button 
                className="signin-button"
                onClick={() => setShowForm(true)}
              >
                <SignIn size={16} weight="bold" />
                Sign In
              </button>
            ) : (
              <div className="form-container">
                <form onSubmit={handleSubmit} className="login-form">
                  {error && <div className="error-message">{error}</div>}
                  {success && <div className="success-message">{success}</div>}

                  <div className="input-group email-group animate-in" style={{ animationDelay: '0ms' }}>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                      placeholder="firstname.lastname"
                      autoComplete="username"
                      disabled={isLoading}
                      autoFocus
                    />
                    <span className="email-suffix">@{ALLOWED_DOMAIN}</span>
                  </div>

                  <div className="input-group password-group animate-in" style={{ animationDelay: '50ms' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      disabled={isLoading}
                    />
                    <button 
                      type="button" 
                      className="toggle-password"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {mode === 'signup' && (
                    <div className="input-group animate-in" style={{ animationDelay: '100ms' }}>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        autoComplete="new-password"
                        disabled={isLoading}
                      />
                    </div>
                  )}

                  {/* Hidden submit button for enter key */}
                  <button type="submit" style={{ display: 'none' }} />
                  
                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="loading-indicator animate-in">
                      <span>Signing in...</span>
                    </div>
                  )}
                </form>

                {/* Mode switch */}
                <div className="mode-switch animate-in" style={{ animationDelay: '100ms' }}>
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

                {/* Back button */}
                <button 
                  className="back-btn animate-in"
                  style={{ animationDelay: '150ms' }}
                  onClick={() => {
                    setShowForm(false);
                    setError('');
                    setSuccess('');
                  }}
                >
                  Back
                </button>
              </div>
            )}
          </div>
        </div>

        {/* What's New Section - Below the fold */}
        <div className="whats-new-section">
            <div className="whats-new-header">
              <h2>What's New in {VERSION}</h2>
            </div>
            
            <div className="features-grid">
              {WHATS_NEW.map((feature, index) => (
                <div key={index} className="feature-card">
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
      </div>

      <style>{`
        .login-page {
          position: fixed;
          inset: 0;
          background: #0a0d12;
          display: flex;
          flex-direction: column;
          z-index: 9999;
        }

        .drag-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 48px;
          -webkit-app-region: drag;
        }

        .admin-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: transparent;
          border: 1px solid #262626;
          border-radius: 6px;
          color: #737373;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          -webkit-app-region: no-drag;
          z-index: 10;
        }

        .admin-btn:hover {
          background: #08090d;
          border-color: #333333;
          color: #a3a3a3;
        }

        .admin-popup {
          position: absolute;
          top: 56px;
          right: 16px;
          z-index: 100;
        }

        .admin-popup-content {
          background: #08090d;
          border: 1px solid #262626;
          border-radius: 12px;
          padding: 16px;
          width: 240px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.7);
        }

        .admin-popup-content h4 {
          font-size: 13px;
          font-weight: 600;
          color: #ffffff;
          margin-bottom: 12px;
        }

        .admin-popup-content input {
          width: 100%;
          padding: 10px 12px;
          background: #0a0d12;
          border: 1px solid #262626;
          border-radius: 8px;
          color: #ffffff;
          font-size: 13px;
          margin-bottom: 8px;
        }

        .admin-popup-content input:focus {
          outline: none;
          border-color: #7AAED4;
        }

        .admin-error {
          display: block;
          color: #D4918A;
          font-size: 11px;
          margin-bottom: 8px;
        }

        .admin-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .admin-actions button {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
        }

        .admin-actions .cancel-btn {
          background: transparent;
          border: 1px solid #262626;
          color: #a3a3a3;
        }

        .admin-actions .login-btn {
          background: #ffffff;
          border: none;
          color: #000000;
          font-weight: 500;
        }

        .admin-actions .login-btn:hover {
          background: #e5e5e5;
        }

        .login-scroll-container {
          flex: 1;
          overflow-y: auto;
        }

        .hero-section {
          min-height: calc(100vh - 120px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px 24px;
        }
        
        /* Dissolve in animation */
        @keyframes dissolveIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-in {
          animation: dissolveIn 0.3s ease-out forwards;
          opacity: 0;
        }

        .login-container {
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .logo-section {
          margin-bottom: 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .logo {
          height: 67px;
          opacity: 0.85;
          margin-bottom: 16px;
          display: block;
        }

        .tagline {
          font-size: 11px;
          letter-spacing: 4px;
          color: #737373;
          font-weight: 300;
        }

        /* Sign In Button - Initial State (50% smaller) */
        .signin-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 28px;
          background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
          border: 1px solid rgba(122, 174, 212, 0.4);
          border-radius: 8px;
          color: #7AAED4;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .signin-button:hover {
          background: linear-gradient(135deg, #1e2536 0%, #111820 100%);
          border-color: #7AAED4;
          color: #9dc4e0;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(122, 174, 212, 0.15);
        }

        /* Form Container */
        .form-container {
          width: 320px;
          margin-bottom: 48px;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-group {
          position: relative;
        }

        .input-group input {
          width: 100%;
          padding: 14px 16px;
          background: #0a0d12;
          border: 1px solid #262626;
          border-radius: 8px;
          color: #ffffff;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .input-group input:focus {
          outline: none;
          border-color: #7AAED4;
          box-shadow: 0 0 0 3px rgba(122, 174, 212, 0.15);
        }

        .input-group input::placeholder {
          color: #737373;
        }

        .password-group input {
          padding-right: 44px;
        }

        .email-group {
          display: flex;
          align-items: center;
          background: #0a0d12;
          border: 1px solid #262626;
          border-radius: 8px;
          transition: border-color 0.2s;
          overflow: hidden;
        }

        .email-group:focus-within {
          border-color: #7AAED4;
          box-shadow: 0 0 0 3px rgba(122, 174, 212, 0.15);
        }

        .email-group input {
          flex: 0 1 auto;
          min-width: 120px;
          width: auto;
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          padding-right: 0 !important;
        }

        .email-group input:focus {
          box-shadow: none !important;
        }

        .email-suffix {
          flex-shrink: 0;
          padding-right: 14px;
          color: #a3a3a3;
          font-size: 14px;
          white-space: nowrap;
          user-select: none;
        }

        .toggle-password {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #737373;
          cursor: pointer;
          padding: 4px;
        }

        .toggle-password:hover {
          color: #a3a3a3;
        }

        .loading-indicator {
          text-align: center;
          color: #7AAED4;
          font-size: 13px;
          padding: 8px 0;
        }

        .error-message {
          padding: 10px 12px;
          background: rgba(212, 145, 138, 0.15);
          border: 1px solid rgba(212, 145, 138, 0.3);
          border-radius: 8px;
          color: #D4918A;
          font-size: 13px;
          text-align: left;
        }

        .success-message {
          padding: 10px 12px;
          background: rgba(91, 176, 154, 0.15);
          border: 1px solid rgba(91, 176, 154, 0.3);
          border-radius: 8px;
          color: #5BB09A;
          font-size: 13px;
          text-align: left;
        }

        .mode-switch {
          margin-top: 16px;
          color: #737373;
          font-size: 13px;
        }

        .link-btn {
          background: none;
          border: none;
          color: #7AAED4;
          cursor: pointer;
          font-size: 13px;
        }

        .link-btn:hover {
          text-decoration: underline;
        }

        .back-btn {
          margin-top: 12px;
          background: none;
          border: none;
          color: #525252;
          font-size: 12px;
          cursor: pointer;
        }

        .back-btn:hover {
          color: #737373;
        }

        /* What's New Section - Below the fold */
        .whats-new-section {
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          padding: 60px 24px 60px;
          border-top: 1px solid #1a1f2e;
        }

        .whats-new-header {
          text-align: center;
          margin-bottom: 24px;
        }

        .whats-new-header h2 {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          color: #666;
          margin: 0;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .features-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          text-align: left;
        }

        .feature-card {
          padding: 10px 12px;
          background: #0d1117;
          border: 1px solid #1a1f2e;
          border-radius: 8px;
        }

        .feature-card h3 {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          color: #a3a3a3;
          margin: 0 0 3px 0;
        }

        .feature-card p {
          font-size: 10px;
          color: #525252;
          line-height: 1.4;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
