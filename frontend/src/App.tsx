import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Navbar from './components/Navbar';
import UserPicker, { useUser, UserProvider } from './components/UserPicker';
import SettingsModal from './components/SettingsModal';
import PinEntry from './components/PinEntry';
import { ThemeProvider } from './components/ThemeProvider';
import SlovakiaMap from './components/SlovakiaMap';
import Home from './pages/Home';
import Session from './pages/Session';
import History from './pages/History';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import Guides from './pages/Guides';
import Farm from './pages/Farm';
import type { User } from './lib/types';

function AppShell() {
  const { user, setUser } = useUser();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);

  useEffect(() => {
    if (!user) setPickerOpen(true);
  }, [user]);

  const handleSignOut = () => {
    setUser(null);
    // setUser(null) already clears localStorage via the UserProvider
    // Setting user to null triggers the useEffect above to open the picker
  };

  const handleOpenSettings = () => {
    setSettingsOpen(true);
  };

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
      <Navbar
        onUserClick={() => setPickerOpen(true)}
        onSignOut={handleSignOut}
        onOpenSettings={handleOpenSettings}
      />
      <UserPicker
        open={pickerOpen}
        onClose={() => { if (user) setPickerOpen(false); }}
        onSelect={handleUserSelect}
      />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
        <Route path="/" element={<Home />} />
        <Route path="/session/:id" element={<Session />} />
        <Route path="/history" element={<History />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/farm" element={<Farm />} />
        <Route path="/guides" element={<Guides />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ThemeProvider>
        <UserProvider>
          <AppShell />
        </UserProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
