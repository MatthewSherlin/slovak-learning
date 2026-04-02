import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import UserPicker, { useUser, UserProvider } from './components/UserPicker';
import Home from './pages/Home';
import Session from './pages/Session';
import History from './pages/History';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import Guides from './pages/Guides';

function AppShell() {
  const { user, setUser } = useUser();
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!user) setPickerOpen(true);
  }, [user]);

  return (
    <>
      <Navbar onUserClick={() => setPickerOpen(true)} />
      <UserPicker
        open={pickerOpen}
        onClose={() => { if (user) setPickerOpen(false); }}
        onSelect={(u) => { setUser(u); setPickerOpen(false); }}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/session/:id" element={<Session />} />
        <Route path="/history" element={<History />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/guides" element={<Guides />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
        <AppShell />
      </UserProvider>
    </BrowserRouter>
  );
}
