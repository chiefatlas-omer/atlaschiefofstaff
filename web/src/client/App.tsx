import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Layout from './components/Layout';
import Briefing from './pages/Briefing';
import Intelligence from './pages/Intelligence';
import Tasks from './pages/Tasks';
import Outcomes from './pages/Outcomes';
import Settings from './pages/Settings';
import Team from './pages/Team';
import Login from './pages/Login';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9FE] flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <BrowserRouter>
          <Layout>
            <Routes>
              {/* Primary routes */}
              <Route path="/" element={<Briefing />} />
              <Route path="/intelligence" element={<Intelligence />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/outcomes" element={<Outcomes />} />
              <Route path="/team" element={<Team />} />
              <Route path="/settings" element={<Settings />} />

              {/* Redirects from old routes */}
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/metrics" element={<Navigate to="/outcomes" replace />} />
              <Route path="/sales" element={<Navigate to="/intelligence" replace />} />
              <Route path="/product" element={<Navigate to="/intelligence" replace />} />
              <Route path="/coaching" element={<Navigate to="/intelligence" replace />} />
              <Route path="/knowledge" element={<Navigate to="/" replace />} />
              <Route path="/upload" element={<Navigate to="/" replace />} />
              <Route path="/sops" element={<Navigate to="/intelligence" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AuthGate>
    </AuthProvider>
  );
}
