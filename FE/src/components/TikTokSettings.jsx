import React, { useState, useEffect } from 'react';
import { Link2, Unlink, Settings, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

const TikTokSettings = ({ onClose }) => {
  const [status, setStatus] = useState({
    connected: false,
    loading: true,
    username: '',
    nickname: '',
    avatarUrl: ''
  });
  const [settings, setSettings] = useState({
    autoPostMotionControl: false,
    defaultPrivacyLevel: 'PUBLIC_TO_EVERYONE',
    defaultTitle: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [accountUrlInput, setAccountUrlInput] = useState('');
  const [visitLoading, setVisitLoading] = useState(false);

  // Fetch TikTok connection status
  useEffect(() => {
    fetchStatus();
    fetchSettings();
    
    // Check URL params for OAuth callback results
    const params = new URLSearchParams(window.location.search);
    if (params.get('tiktok_connected') === 'true') {
      setMessage({ type: 'success', text: 'TikTok account connected successfully!' });
      window.history.replaceState({}, '', window.location.pathname);
      fetchStatus();
    } else if (params.get('tiktok_error')) {
      setMessage({ type: 'error', text: `TikTok connection failed: ${params.get('tiktok_error')}` });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tiktok/status`);
      const data = await response.json();
      setStatus({
        connected: data.connected,
        loading: false,
        username: data.username || '',
        nickname: data.nickname || '',
        avatarUrl: data.avatarUrl || ''
      });
    } catch (error) {
      setStatus(prev => ({ ...prev, loading: false }));
      console.error('Failed to fetch TikTok status:', error);
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tiktok/settings`);
      const data = await response.json();
      setSettings({
        autoPostMotionControl: data.autoPostMotionControl ?? false,
        defaultPrivacyLevel: data.defaultPrivacyLevel ?? 'PUBLIC_TO_EVERYONE',
        defaultTitle: data.defaultTitle ?? ''
      });
    } catch (error) {
      console.error('Failed to fetch TikTok settings:', error);
    }
  };

  const handleConnect = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/tiktok/auth`);
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to initiate TikTok connection' });
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your TikTok account?')) return;
    
    try {
      await fetch(`${API_BASE_URL}/tiktok/disconnect`, { method: 'DELETE' });
      setStatus(prev => ({ ...prev, connected: false }));
      setMessage({ type: 'success', text: 'TikTok account disconnected' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to disconnect TikTok account' });
    }
  };

  const handleVisitAccount = async () => {
    if (!accountUrlInput.trim()) {
      setMessage({ type: 'error', text: 'Please enter a TikTok account URL' });
      return;
    }
    setVisitLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const response = await fetch(`${API_BASE_URL}/tiktok/visit-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountUrl: accountUrlInput.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to visit account');
      }
      setMessage({ type: 'success', text: 'Browser opened. Account visited and first video clicked.' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Failed to visit TikTok account' });
    } finally {
      setVisitLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/tiktok/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setMessage({ type: 'success', text: 'Settings saved successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 rounded-2xl w-full max-w-md mx-4 overflow-hidden border border-zinc-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">TikTok Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Message */}
          {message.text && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              message.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
            }`}>
              {message.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span className="text-sm">{message.text}</span>
            </div>
          )}

          {/* Visit TikTok Account */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Visit TikTok Account</h3>
            <p className="text-zinc-400 text-xs mb-3">
              Enter a TikTok account link to visit and open the first video in a new tab
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={accountUrlInput}
                onChange={(e) => setAccountUrlInput(e.target.value)}
                placeholder="https://tiktok.com/@username"
                className="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
              />
              <button
                onClick={handleVisitAccount}
                disabled={visitLoading}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {visitLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                <span>{visitLoading ? 'Loading...' : 'Visit & Open Video'}</span>
              </button>
            </div>
          </div>

          {/* Connection Status */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-medium text-zinc-400 mb-3">Account Connection</h3>
            
            {status.loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-zinc-400 animate-spin" />
              </div>
            ) : status.connected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {status.avatarUrl ? (
                    <img src={status.avatarUrl} alt="Avatar" className="w-10 h-10 rounded-full" />
                  ) : (
                    <div className="w-10 h-10 bg-zinc-700 rounded-full flex items-center justify-center">
                      <span className="text-lg">{status.nickname?.charAt(0) || 'T'}</span>
                    </div>
                  )}
                  <div>
                    <p className="text-white font-medium">{status.nickname}</p>
                    <p className="text-zinc-400 text-sm">@{status.username}</p>
                  </div>
                  <div className="ml-auto">
                    <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                      Connected
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  <Unlink className="w-4 h-4" />
                  <span>Disconnect Account</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
              >
                <Link2 className="w-4 h-4" />
                <span>Connect TikTok Account</span>
              </button>
            )}
          </div>

          {/* Auto-Post Settings */}
          {status.connected && (
            <div className="bg-zinc-800 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-medium text-zinc-400">Auto-Post Settings</h3>
              
              {/* Auto-post toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-white">Auto-post Motion Control videos</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.autoPostMotionControl}
                    onChange={(e) => setSettings(prev => ({ ...prev, autoPostMotionControl: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
                </div>
              </label>

              {/* Privacy Level */}
              <div>
                <label className="text-white text-sm mb-2 block">Default Privacy Level</label>
                <select
                  value={settings.defaultPrivacyLevel}
                  onChange={(e) => setSettings(prev => ({ ...prev, defaultPrivacyLevel: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                >
                  <option value="PUBLIC_TO_EVERYONE">Public (Everyone)</option>
                  <option value="MUTUAL_FOLLOW_FRIENDS">Friends (Mutual Followers)</option>
                  <option value="SELF_ONLY">Private (Only Me)</option>
                </select>
              </div>

              {/* Default Title */}
              <div>
                <label className="text-white text-sm mb-2 block">Default Title Template</label>
                <input
                  type="text"
                  value={settings.defaultTitle}
                  onChange={(e) => setSettings(prev => ({ ...prev, defaultTitle: e.target.value }))}
                  placeholder="AI Generated Video #AI #MotionControl"
                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <p className="text-zinc-500 text-xs mt-1">Leave empty to use the video prompt as title</p>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4" />
                )}
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          )}

          {/* Info */}
          <div className="bg-zinc-800/50 rounded-xl p-4">
            <p className="text-zinc-400 text-sm">
              <strong className="text-white">Note:</strong> Videos posted by unverified apps will be set to private visibility. 
              Contact TikTok to verify your app for public posting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TikTokSettings;
