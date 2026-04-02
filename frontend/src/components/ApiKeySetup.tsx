import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Key, ExternalLink, ArrowRight } from 'lucide-react';
import { setApiKey } from '../lib/gemini';

interface ApiKeySetupProps {
  open: boolean;
  onComplete: () => void;
}

export default function ApiKeySetup({ open, onComplete }: ApiKeySetupProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Please enter an API key');
      return;
    }
    if (!trimmed.startsWith('AIza')) {
      setError('That doesn\'t look like a Gemini API key (should start with AIza)');
      return;
    }
    setApiKey(trimmed);
    onComplete();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-surface border border-border rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center">
              <Key size={20} className="text-accent" />
            </div>
            <h2 className="text-xl font-bold text-text-primary tracking-tight">
              Set up your AI tutor
            </h2>
          </div>

          <p className="text-sm text-text-muted mb-6 leading-relaxed">
            SlovakPrep uses Google's Gemini AI to power your lessons.
            You'll need a free API key to get started.
          </p>

          <div className="bg-surface-2 rounded-xl p-4 border border-border-subtle mb-5">
            <p className="text-[12.5px] text-text-secondary mb-2 font-medium">How to get a key:</p>
            <ol className="text-[12px] text-text-muted space-y-1.5 list-decimal list-inside">
              <li>
                Go to{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline inline-flex items-center gap-0.5"
                >
                  Google AI Studio <ExternalLink size={9} />
                </a>
              </li>
              <li>Sign in with your Google account</li>
              <li>Click "Create API key"</li>
              <li>Copy and paste it below</li>
            </ol>
          </div>

          <input
            type="text"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(''); }}
            placeholder="AIzaSy..."
            className="w-full bg-surface-2 border border-border rounded-xl px-4 py-3 text-[13px] text-text-primary placeholder:text-text-faint focus:border-border-focus transition-colors font-mono mb-2"
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />

          {error && (
            <p className="text-[12px] text-danger mb-2">{error}</p>
          )}

          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={!key.trim()}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-gradient-to-r from-accent to-sky-400 hover:from-accent-hover hover:to-sky-300 text-white font-semibold py-3.5 px-6 rounded-xl cursor-pointer border-none text-[14px] shadow-lg shadow-accent/25 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Start Learning
            <ArrowRight size={16} />
          </motion.button>

          <p className="text-[10.5px] text-text-faint text-center mt-4">
            Your key stays in your browser. The free tier gives 15 req/min and 1,500/day.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
