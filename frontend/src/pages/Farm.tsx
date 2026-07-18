import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Sprout } from 'lucide-react';

/**
 * Farm — XP Orchard page.
 * The card shop has moved to /cards.
 * This page will contain the interactive XP orchard grid (coming soon).
 */
export default function Farm() {
  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 pt-32 pb-16">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-surface-1 border border-border flex items-center justify-center mx-auto mb-6">
          <Sprout size={28} className="text-emerald-400" />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight mb-2">
          XP Orchard
        </h1>
        <p className="text-text-muted text-sm mb-8 max-w-sm mx-auto">
          Plant seeds with your XP and grow your Slovak vocabulary garden.
          The orchard is being cultivated — check back soon!
        </p>

        {/* Placeholder orchard grid */}
        <div className="grid grid-cols-6 gap-2 mb-10 max-w-xs mx-auto">
          {Array.from({ length: 24 }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04, type: 'spring', damping: 20, stiffness: 300 }}
              className="w-full aspect-square rounded-lg bg-surface-1 border border-border flex items-center justify-center text-base"
            >
              {i % 7 === 0 ? '🌳' : i % 5 === 0 ? '🌱' : i % 3 === 0 ? '🌿' : ''}
            </motion.div>
          ))}
        </div>

        {/* Link to Cards */}
        <Link
          to="/cards"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-surface-1 border border-border hover:border-accent/50 text-text-secondary hover:text-text-primary transition-colors"
        >
          Go to Cards
          <ArrowRight size={14} />
        </Link>
      </motion.div>
    </div>
  );
}
