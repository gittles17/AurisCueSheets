import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileXls, FilePdf, Gear, CircleNotch, File, FolderOpen, 
  FloppyDisk, Circle, Export, User, SignOut, Crown, Key, ShareNetwork,
  Info, Sparkle, Database, Brain, CheckCircle, X, ArrowUUpLeft, ArrowUUpRight,
  Compass, ChatCircle, TreeStructure
} from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';

// Version history - add new versions at the top
const VERSION_HISTORY = [
  {
    version: 'v0.13',
    date: 'February 2026',
    features: [
      { title: 'Auto-Update Restart', description: 'Bypassed Squirrel.Mac which fails on unsigned builds. The Restart button now manually extracts the update ZIP, swaps the app bundle, removes quarantine, and relaunches.', icon: CheckCircle },
      { title: 'API Key Auto-Loading', description: 'The Anthropic API key is now pushed to the UI immediately after global keys are fetched from Supabase on authentication.', icon: CheckCircle },
      { title: 'Delete Key Fix', description: 'Delete/Backspace now reliably clears selected cells on the first keypress. Previously required multiple presses due to a focus management bug.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.12',
    date: 'February 2026',
    features: [
      { title: 'Open Project Supports .prproj', description: 'The Open Project dialog now accepts both .acs and .prproj files. Selecting a Premiere Pro project triggers the Import Wizard automatically.', icon: CheckCircle },
      { title: 'Network Volume Browsing', description: 'The Open Project file browser can now navigate to and open files from mounted server and network drives using security-scoped bookmarks.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.11',
    date: 'February 2026',
    features: [
      { title: 'Apple Notarization', description: 'App is now code-signed and notarized by Apple. Users can double-click to open without Terminal workarounds.', icon: CheckCircle },
      { title: 'Feedback System Fix', description: 'User feedback now reliably saves to the cloud and appears in the admin panel. Previously feedback from other users was invisible.', icon: CheckCircle },
      { title: 'Improved Release Pipeline', description: 'Release script auto-generates correct installation instructions based on signed vs. unsigned builds.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.10',
    date: 'February 2026',
    features: [
      { title: 'Network Volume Search', description: 'Recursively searches all mounted volumes under /Volumes/ to find .prproj files on network drives when not found locally.', icon: CheckCircle },
      { title: 'Launch Crash Fix', description: 'Fixed exceljs dependency crash by pinning to v4.3.0. Improved error messages for missing files.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.9',
    date: 'February 2026',
    features: [
      { title: 'Network Drive Support', description: 'Import .prproj files directly from SMB and network drives without copying locally first.', icon: CheckCircle },
      { title: 'Security-Scoped Bookmarks', description: 'Persistent file access for network volumes through macOS security-scoped bookmarks.', icon: CheckCircle },
      { title: 'Path Normalization', description: 'Automatic handling of file://, smb://, and URL-encoded paths for seamless imports.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.8',
    date: 'February 2026',
    features: [
      { title: 'Downloads Folder Import', description: 'Import .prproj files dragged from the Downloads folder. Previously only searched Desktop and Documents.', icon: CheckCircle },
      { title: 'Graceful Unsigned Builds', description: 'afterPack.js detects if signing certificate is missing and builds unsigned instead of failing.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.7',
    date: 'January 2026',
    features: [
      { title: 'Streamlined API Setup', description: 'Add API sources with keys in one step. No more confusing two-step setup process.', icon: CheckCircle },
      { title: 'Custom API Sources', description: 'Custom sources with API keys are automatically marked as connected after setup.', icon: CheckCircle },
      { title: 'Quick Access Header', description: 'Gear icon for Settings and chat icon for Feedback now appear in the top right header.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.6',
    date: 'January 2026',
    features: [
      { title: 'Native macOS Menu', description: 'Full File, Edit, View, Window, Help menus with standard keyboard shortcuts.', icon: CheckCircle },
      { title: 'Table Virtualization', description: 'Smooth scrolling with large cue sheets (500+ tracks) using react-window.', icon: CheckCircle },
      { title: 'Faster Startup', description: 'Heavy components load on-demand, reducing initial load time by 178 KB.', icon: CheckCircle },
      { title: 'Smoother Selection', description: 'Debounced drag selection with RAF-based updates for better performance.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.5',
    date: 'January 2026',
    features: [
      { title: 'Smart Fill in Sidebar', description: 'AI-powered field suggestions now appear in the Actions panel for better workflow integration.', icon: CheckCircle },
      { title: 'Improved Cell Selection', description: 'Click to select cells, double-click to edit. Drag to select multiple cells at once.', icon: CheckCircle },
      { title: 'Multi-cell Delete', description: 'Press Delete or Backspace to clear all selected cells simultaneously.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.4',
    date: 'January 2026',
    features: [
      { title: 'Import Wizard', description: 'Step-by-step guided import for Premiere Pro projects. Review clips, categorize tracks, and group stems with confidence scoring.', icon: Compass },
      { title: 'Import Progress', description: 'Real-time progress indicator shows each of the 8 pipeline steps during import. No more spinning beach ball on large files.', icon: CircleNotch },
      { title: 'AI-Assisted Classification', description: 'Hybrid AI approach uses fast pattern matching with targeted Opus AI for ambiguous clips. See confidence badges on each classification.', icon: Sparkle },
      { title: 'Stem Grouping', description: 'Automatically detects and groups stem files under their parent tracks. Merge or ungroup stems as needed.', icon: TreeStructure },
      { title: 'Learning System', description: 'The wizard learns from your corrections to improve future imports. Patterns are saved for faster, more accurate processing.', icon: Brain },
      { title: 'Auto-Update System', description: 'App automatically checks for and downloads updates in the background with visual progress bar.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.3',
    date: 'January 2026',
    features: [
      { title: 'Import Wizard', description: 'New guided import workflow for bringing in data from CSV, Excel, and other sources with intelligent column mapping.', icon: Compass },
      { title: 'Auto-Update System', description: 'App now automatically checks for and downloads updates in the background. Get the latest features without manual downloads.', icon: CheckCircle },
      { title: 'Update Progress Indicator', description: 'Visual progress bar showing download status, speed (MB/s), and file size when updates are available.', icon: CheckCircle },
    ]
  },
  {
    version: 'v0.2',
    date: 'January 2026',
    features: [
      { title: 'Cue Sheet Scrolling', description: 'Fixed scrolling for large cue sheets. Now you can scroll through projects with many tracks without any issues.', icon: CheckCircle },
      { title: 'Instant Account Access', description: 'New users are signed in immediately after creating an account. No email confirmation required.', icon: CheckCircle },
      { title: 'Send Feedback', description: 'Submit bug reports, feature requests, and general feedback directly from the File menu.', icon: ChatCircle },
    ]
  },
  {
    version: 'v0.1',
    date: 'January 2026',
    features: [
      { title: 'Adaptive AI Learning', description: 'Auris learns from your cue sheet work and auto-fills fields based on patterns. The more you use it, the smarter it gets.', icon: Brain },
      { title: 'Smart Track Matching', description: 'Automatically matches tracks from your learned database with intelligent similarity scoring and catalog code detection.', icon: Database },
      { title: 'Production Music Protection', description: 'Source category blocking prevents commercial databases (iTunes, Spotify) from contaminating production music data.', icon: CheckCircle },
      { title: 'AI-Powered Extraction', description: 'Claude Opus extracts composer, publisher, and metadata from BMG and other music library websites.', icon: Sparkle },
      { title: 'Confidence Indicators', description: 'See match confidence for each field with detailed reasoning. Approve or edit uncertain matches.', icon: CheckCircle },
      { title: 'Cloud-Synced Learned Data', description: 'Your approved tracks sync to the cloud instantly, building a shared database for faster lookups.', icon: Database },
    ]
  }
];

const CURRENT_VERSION = VERSION_HISTORY[0].version;

function Header({ 
  projectName, 
  acsFilePath,
  hasUnsavedChanges,
  onExport,
  onShare,
  onToggleSidebar, 
  onOpenSettings,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onSaveProjectAs,
  hasProject,
  isLookingUp,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onOpenLogin,
  onOpenFeedback,
  onToggleAurisChat,
  showAurisChat = false,
  onStartTour
}) {
  const { user, isAdmin, signOut, verifyAdminPassword, exitAdminMode, isConfigured } = useAuth();
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [userMenuPosition, setUserMenuPosition] = useState({ top: 0, left: 0 });
  const exportButtonRef = useRef(null);
  const userButtonRef = useRef(null);

  const toggleUserMenu = () => {
    if (!showUserMenu && userButtonRef.current) {
      const rect = userButtonRef.current.getBoundingClientRect();
      setUserMenuPosition({ top: rect.bottom + 4, left: rect.right - 180 });
    }
    setShowUserMenu(!showUserMenu);
  };

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
  };

  const handleAdminLogin = async () => {
    setAdminError('');
    const result = await verifyAdminPassword(adminPassword);
    if (result.success) {
      setShowAdminModal(false);
      setAdminPassword('');
    } else {
      setAdminError('Incorrect password');
    }
  };

  const handleExitAdmin = async () => {
    setShowUserMenu(false);
    await exitAdminMode();
  };

  const handleExport = (format) => {
    setShowExportMenu(false);
    onExport(format);
  };

  const toggleMenu = () => {
    if (!showExportMenu && exportButtonRef.current) {
      const rect = exportButtonRef.current.getBoundingClientRect();
      setMenuPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setShowExportMenu(!showExportMenu);
  };

  // Show .acs filename if available, otherwise fall back to project name
  const displayName = acsFilePath 
    ? acsFilePath.split('/').pop().replace('.acs', '') 
    : (projectName || 'Untitled');

  return (
    <header className="h-14 bg-auris-bg-secondary border-b border-auris-border flex items-center drag-region">
      {/* Left: Traffic lights space */}
      <div className="flex items-center h-full">
        <div className="w-[72px] h-full drag-region flex-shrink-0" />
      </div>

      {/* Center: Project name */}
      <div className="flex-1 h-full drag-region flex items-center justify-center">
        <div className="flex items-center gap-2 pointer-events-none">
          {hasUnsavedChanges && (
            <Circle size={6} weight="fill" className="text-auris-blue" />
          )}
          <span className="text-sm text-auris-text-muted font-medium">
            {displayName}
          </span>
          {isLookingUp && (
            <CircleNotch size={12} className="animate-spin text-auris-text-muted ml-1" />
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 pr-4 no-drag">
        {hasProject && (
          <>
            {/* Undo/Redo buttons */}
            <div className="flex items-center gap-0.5 mr-1">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                className="p-1.5 text-auris-text-muted hover:text-auris-text hover:bg-auris-card rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo (⌘Z)"
              >
                <ArrowUUpLeft size={16} />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                className="p-1.5 text-auris-text-muted hover:text-auris-text hover:bg-auris-card rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo (⌘⇧Z)"
              >
                <ArrowUUpRight size={16} />
              </button>
            </div>
            
            {/* Ask Auris Button */}
            <button
              onClick={onToggleAurisChat}
              className={`flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-full text-sm font-medium transition-all ${
                showAurisChat 
                  ? 'bg-auris-card border border-auris-border-light text-auris-text' 
                  : 'bg-auris-card border border-auris-border text-auris-text-secondary hover:text-auris-text hover:border-auris-border-light'
              }`}
              title="Ask Auris"
              data-tour="ask-auris"
            >
              <img src="./auris-logo-icon.png" alt="" className="w-5 h-5" />
              <span>Ask Auris</span>
            </button>
          </>
        )}

        {/* Feedback button */}
        <button
          onClick={onOpenFeedback}
          className="p-2 rounded-md hover:bg-auris-card transition-colors text-auris-text-muted hover:text-auris-text"
          title="Send Feedback"
        >
          <ChatCircle size={18} />
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="p-2 rounded-md hover:bg-auris-card transition-colors text-auris-text-muted hover:text-auris-text"
          title="Settings (⌘,)"
        >
          <Gear size={18} />
        </button>

        {/* Guided Tour button */}
        {onStartTour && (
          <button
            onClick={onStartTour}
            className="p-2 rounded-md hover:bg-auris-card transition-colors text-auris-text-muted hover:text-auris-text"
            title="Take a tour"
          >
            <Compass size={18} />
          </button>
        )}

        {/* Admin icon - only shown when in admin mode */}
        {isAdmin && (
          <button
            ref={userButtonRef}
            onClick={toggleUserMenu}
            className="p-2 rounded-md hover:bg-auris-card transition-colors"
            title="Admin Mode"
          >
            <Crown size={18} className="text-auris-orange" weight="fill" />
          </button>
        )}
      </div>

      {/* Export Menu Dropdown */}
      {showExportMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setShowExportMenu(false)} />
          <div 
            className="fixed bg-auris-card border border-auris-border rounded-xl shadow-modal z-[1000] py-1 min-w-[140px]"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <button
              onClick={() => handleExport('xlsx')}
              className="w-full px-3 py-2 text-left text-sm text-auris-text-secondary hover:bg-auris-card-hover hover:text-auris-text flex items-center gap-2.5 transition-colors"
            >
              <FileXls size={15} className="text-auris-green" />
              Excel (.xlsx)
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="w-full px-3 py-2 text-left text-sm text-auris-text-secondary hover:bg-auris-card-hover hover:text-auris-text flex items-center gap-2.5 transition-colors"
            >
              <FilePdf size={15} className="text-auris-red" />
              PDF
            </button>
          </div>
        </>,
        document.body
      )}

      {/* User Menu Dropdown */}
      {showUserMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setShowUserMenu(false)} />
          <div 
            className="fixed bg-auris-card border border-auris-border rounded-xl shadow-modal z-[1000] py-1 min-w-[180px]"
            style={{ top: userMenuPosition.top, left: userMenuPosition.left }}
          >
            {user && (
              <div className="px-3 py-2 text-xs text-auris-text-muted border-b border-auris-border">
                {user.email}
              </div>
            )}
            
            {isAdmin ? (
              <>
                <div className="px-3 py-2 text-xs text-auris-orange border-b border-auris-border flex items-center gap-1.5">
                  <Crown size={11} weight="fill" />
                  Admin Mode
                </div>
                <button
                  onClick={handleExitAdmin}
                  className="w-full px-3 py-2 text-left text-sm text-auris-text-secondary hover:bg-auris-card-hover hover:text-auris-text flex items-center gap-2 transition-colors"
                >
                  <Key size={14} className="text-auris-text-muted" />
                  Exit Admin
                </button>
              </>
            ) : (
              <button
                onClick={() => { setShowUserMenu(false); setShowAdminModal(true); setAdminPassword(''); setAdminError(''); }}
                className="w-full px-3 py-2 text-left text-sm text-auris-text-secondary hover:bg-auris-card-hover hover:text-auris-text flex items-center gap-2 transition-colors"
              >
                <Crown size={14} className="text-auris-orange" />
                Admin Mode
              </button>
            )}
            
            {isConfigured && (
              <>
                <div className="h-px bg-auris-border my-1" />
                {user ? (
                  <button
                    onClick={handleSignOut}
                    className="w-full px-3 py-2 text-left text-sm text-auris-red hover:bg-auris-card-hover flex items-center gap-2 transition-colors"
                  >
                    <SignOut size={14} />
                    Sign Out
                  </button>
                ) : (
                  <button
                    onClick={() => { setShowUserMenu(false); onOpenLogin?.(); }}
                    className="w-full px-3 py-2 text-left text-sm text-auris-text-secondary hover:bg-auris-card-hover hover:text-auris-text flex items-center gap-2 transition-colors"
                  >
                    <User size={14} className="text-auris-text-muted" />
                    Sign In
                  </button>
                )}
              </>
            )}
          </div>
        </>,
        document.body
      )}

      {/* Admin Password Modal */}
      {showAdminModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[99999]"
          onClick={() => setShowAdminModal(false)}
        >
          <div 
            className="bg-auris-bg border border-auris-border rounded-xl shadow-modal w-[340px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-auris-border">
              <div className="flex items-center gap-2">
                <Crown size={16} className="text-auris-orange" weight="fill" />
                <h2 className="text-base font-medium text-auris-text">Admin Access</h2>
              </div>
            </div>
            
            <div className="p-5">
              <p className="text-sm text-auris-text-muted mb-4">
                Enter password to access admin features.
              </p>
              
              {adminError && (
                <div className="mb-4 px-3 py-2 bg-auris-red-dim border border-auris-red/20 rounded-lg text-auris-red text-sm">
                  {adminError}
                </div>
              )}
              
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && adminPassword && handleAdminLogin()}
                placeholder="Password"
                className="w-full bg-auris-card border border-auris-border rounded-lg px-3 py-2.5 text-sm text-auris-text placeholder:text-auris-text-muted focus:outline-none focus:border-auris-blue focus:shadow-focus-blue mb-4"
                autoFocus
              />
              
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAdminModal(false)}
                  className="px-4 py-2 text-sm text-auris-text-muted hover:text-auris-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdminLogin}
                  disabled={!adminPassword}
                  className="px-4 py-2 text-sm bg-white text-black rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40 font-medium"
                >
                  Login
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* About Modal */}
      {showAboutModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[99999]"
          onClick={() => setShowAboutModal(false)}
        >
          <div 
            className="bg-auris-bg border border-auris-border rounded-2xl shadow-modal w-[480px] max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Hero Header */}
            <div className="relative px-8 pt-8 pb-6 text-center bg-gradient-to-b from-auris-card/80 to-transparent">
              <button
                onClick={() => setShowAboutModal(false)}
                className="absolute top-4 right-4 p-1.5 text-auris-text-muted hover:text-auris-text hover:bg-auris-card rounded-lg transition-colors"
              >
                <X size={16} />
              </button>
              
              <img src="./auris-logo-icon.png" alt="Auris" className="w-16 h-16 mx-auto mb-4" />
              <h1 className="text-2xl font-semibold text-auris-text mb-1">Auris</h1>
              <p className="text-sm text-auris-text-muted">Cue Sheets</p>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-auris-blue/10 rounded-full">
                <span className="text-sm font-medium text-auris-blue">{CURRENT_VERSION}</span>
              </div>
            </div>
            
            {/* Version History - Scrollable */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              {VERSION_HISTORY.map((release, releaseIndex) => (
                <div key={release.version} className={releaseIndex > 0 ? 'mt-6 pt-6 border-t border-auris-border' : ''}>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-xs font-semibold text-auris-text-muted uppercase tracking-wider">
                      What's New in {release.version}
                    </h3>
                    <span className="text-xs text-auris-text-muted/60">{release.date}</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {release.features.map((feature, featureIndex) => (
                      <div 
                        key={featureIndex} 
                        className="p-3 bg-auris-card/40 hover:bg-auris-card/60 rounded-xl transition-colors group"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <feature.icon size={14} className="text-auris-blue" weight="duotone" />
                          <h4 className="text-xs font-medium text-auris-text">{feature.title}</h4>
                        </div>
                        <p className="text-[11px] text-auris-text-muted leading-relaxed">{feature.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 border-t border-auris-border/50 flex-shrink-0">
              <p className="text-[11px] text-auris-text-muted/60 text-center">
                Built by Create
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}

export default Header;
