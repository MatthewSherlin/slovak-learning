import { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import UserPicker, { useUser, UserProvider } from './components/UserPicker';
import ApiKeySetup from './components/ApiKeySetup';
import Home from './pages/Home';
import Session from './pages/Session';
import History from './pages/History';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import Guides from './pages/Guides';
import Settings from './pages/Settings';
import { getApiKey } from './lib/gemini';

function AppShell() {
  const { user, setUser } = useUser();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [needsApiKey, setNeedsApiKey] = useState(false);

  useEffect(() => {
    if (!user) setPickerOpen(true);
  }, [user]);

  useEffect(() => {
    if (user && !getApiKey()) {
      setNeedsApiKey(true);
    }
  }, [user]);

  return (
    <>
      <Navbar onUserClick={() => setPickerOpen(true)} />
      <UserPicker
        open={pickerOpen}
        onClose={() => { if (user) setPickerOpen(false); }}
        onSelect={(u) => {
          setUser(u);
          setPickerOpen(false);
          if (!getApiKey()) setNeedsApiKey(true);
        }}
      />
      <ApiKeySetup
        open={needsApiKey && !pickerOpen}
        onComplete={() => setNeedsApiKey(false)}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session/:id" element={<Session />} />
        <Route path="/history" element={<History />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/guides" element={<Guides />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <UserProvider>
        <AppShell />
      </UserProvider>
    </HashRouter>
  );
}
