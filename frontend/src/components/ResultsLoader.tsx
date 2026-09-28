import { useEffect, useState } from 'react';
import BrandedLoader from './BrandedLoader';
import { RESULTS_LOADER_DELAY_MS } from '../lib/pacing';

/**
 * Shown while a lesson ends. The results are counted, not written, so they
 * usually arrive at once: nothing shows unless the wait passes 400ms.
 */
export default function ResultsLoader() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShow(true), RESULTS_LOADER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;
  return <BrandedLoader heading="Načítavam výsledky…" subCopy="Loading your results" hint={null} />;
}
