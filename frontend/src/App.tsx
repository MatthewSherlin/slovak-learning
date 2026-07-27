import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import TabBar from './components/TabBar';
import UserPicker, { useUser, UserProvider } from './components/UserPicker';
import PinEntry from './components/PinEntry';
import { ThemeProvider } from './components/ThemeProvider';
import ErrorBoundary from './components/ErrorBoundary';
import SlovakiaMap from './components/SlovakiaMap';
import Home from './pages/Home';
import Session from './pages/Session';
import Stats from './pages/Stats';
import Guides from './pages/Guides';
import Cards from './pages/Cards';
import type { User } from './lib/types';

/** Routes where the tab bar should NOT appear (full-screen experiences) */
const NO_TAB_BAR_PATHS = ['/session/'];

function useIsTabBarVisible() {
  const location = useLocation();
  return !NO_TAB_BAR_PATHS.some((prefix) => location.pathname.startsWith(prefix));
}

function AppShell() {
  const { user, setUser } = useUser();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const showTabBar = useIsTabBarVisible();

  useEffect(() => {
    if (!user) setPickerOpen(true);
  }, [user]);

  const handleUserSelect = (u: User) => {
    if (u.has_pin) {
      setPendingUser(u);
    } else {
      setUser(u);
      setPickerOpen(false);
    }
  };

  return (
    <>
      <SlovakiaMap />
      {/* Bottom tab bar shown on all main tab routes */}
      {showTabBar && <TabBar />}
      <UserPicker
        open={pickerOpen}
        onClose={() => { if (user) setPickerOpen(false); }}
        onSelect={handleUserSelect}
      />
      <AnimatePresence>
        {pendingUser && (
          <PinEntry
            user={pendingUser}
            onSuccess={() => {
              setUser(pendingUser);
              setPendingUser(null);
              setPickerOpen(false);
            }}
            onCancel={() => setPendingUser(null)}
          />
        )}
      </AnimatePresence>
      <Routes>
        {/* Main tab routes */}
        <Route path="/" element={<Home />} />
        <Route path="/cards" element={<Cards />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/guides" element={<Guides />} />

        {/* Full-screen session — no tab bar */}
        <Route path="/session/:id" element={<Session />} />

        {/* Legacy routes — redirect to stats hub with tab hint */}
        <Route path="/dashboard" element={<Navigate to="/stats?tab=overview" replace />} />
        <Route path="/history" element={<Navigate to="/stats?tab=history" replace />} />
        <Route path="/leaderboard" element={<Navigate to="/stats?tab=leaderboard" replace />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <ThemeProvider>
          <UserProvider>
            <AppShell />
          </UserProvider>
        </ThemeProvider>
      </HashRouter>
    </ErrorBoundary>
  );
}
