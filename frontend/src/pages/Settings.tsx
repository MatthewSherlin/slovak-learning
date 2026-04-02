import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Key, Trash2, CheckCircle, ExternalLink } from 'lucide-react';
import { getApiKey, setApiKey, clearApiKey } from '../lib/gemini';

export default function Settings() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    const existing = getApiKey();
    setHasKey(!!existing);
    if (existing) {
      // Show masked key
      setKey('AIza' + '*'.repeat(existing.length - 8) + existing.slice(-4));
    }
  }, []);

  const handleSave = () => {
    if (!key.trim() || key.includes('*')) return;
    setApiKey(key.trim());
    setHasKey(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Mask it after saving
    const masked = 'AIza' + '*'.repeat(key.trim().length - 8) + key.trim().slice(-4);
    setKey(masked);
  };

  const handleClear = () => {
    clearApiKey();
    setKey('');
    setHasKey(false);
  };

  const handleChange = (val: string) => {
    setKey(val);
    setSaved(false);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 pt-22 pb-16">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2.5 mb-2">
          <SettingsIcon size={20} className="text-accent" />
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Settings</h1>
        </div>
        <p className="text-text-muted text-sm mb-10">
          Configure your API key and preferences.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-surface border border-border rounded-2xl p-6 mb-5"
      >
        <h3 className="text-[15px] font-semibold text-text-primary mb-1 flex items-center gap-2">
          <Key size={16} className="text-accent" />
          Gemini API Key
        </h3>
        <p className="text-[12.5px] text-text-muted mb-5 leading-relaxed">
          This app uses Google's Gemini AI for tutoring. Get a free API key from{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline inline-flex items-center gap-0.5"
          >
            Google AI Studio <ExternalLink size={10} />
          </a>
          . The free tier gives you 15 requests/minute and 1,500/day — plenty for learning.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="AIzaSy..."
            className="flex-1 bg-surface-2 border border-border rounded-xl px-4 py-3 text-[13px] text-text-primary placeholder:text-text-faint focus:border-border-focus transition-colors font-mono"
          />
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleSave}
            disabled={!key.trim() || key.includes('*')}
            className="px-5 py-3 rounded-xl text-[13px] font-medium bg-accent hover:bg-accent-hover text-white cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saved ? (
              <span className="flex items-center gap-1.5">
                <CheckCircle size={14} /> Saved
              </span>
            ) : (
              'Save'
            )}
          </motion.button>
        </div>

        {hasKey && (
          <button
            onClick={handleClear}
            className="mt-3 flex items-center gap-1.5 text-[12px] text-danger hover:text-danger bg-transparent border-none cursor-pointer transition-colors"
          >
            <Trash2 size={12} />
            Remove API key
          </button>
        )}

        <div className="mt-5 p-3 bg-surface-2 rounded-xl border border-border-subtle">
          <p className="text-[11px] text-text-faint leading-relaxed">
            Your API key is stored locally in your browser and never sent to any server except Google's Gemini API.
            All session data is also stored locally. Nothing leaves your browser.
          </p>
        </div>
      </motion.div>

      {/* Data Management */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-surface border border-border rounded-2xl p-6"
      >
        <h3 className="text-[15px] font-semibold text-text-primary mb-1">
          Data Management
        </h3>
        <p className="text-[12.5px] text-text-muted mb-4">
          All your learning data is stored in your browser's localStorage.
        </p>
        <button
          onClick={() => {
            if (confirm('This will delete ALL your session history, scores, and progress. Are you sure?')) {
              localStorage.removeItem('slovak-sessions');
              window.location.reload();
            }
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-medium bg-danger-muted text-danger border border-danger/15 hover:border-danger/30 cursor-pointer transition-all"
        >
          <Trash2 size={13} />
          Clear all session data
        </button>
      </motion.div>
    </div>
  );
}
