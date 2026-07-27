import { motion } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-center py-16"
    >
      <div className="w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
        <AlertCircle size={22} className="text-danger" />
      </div>
      <p className="text-text-muted text-sm mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium bg-surface border border-border hover:border-accent/50 text-text-primary cursor-pointer transition-colors"
        aria-label="Retry"
      >
        <RefreshCw size={13} />
        Retry
      </button>
    </motion.div>
  );
}
