import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Briefing from './pages/Briefing';
import Intelligence from './pages/Intelligence';
import Tasks from './pages/Tasks';
import Outcomes from './pages/Outcomes';
import Knowledge from './pages/Knowledge';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          {/* Primary routes */}
          <Route path="/" element={<Briefing />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/outcomes" element={<Outcomes />} />

          {/* Redirects from old routes */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/metrics" element={<Navigate to="/outcomes" replace />} />
          <Route path="/sales" element={<Navigate to="/intelligence" replace />} />
          <Route path="/product" element={<Navigate to="/intelligence" replace />} />
          <Route path="/coaching" element={<Navigate to="/intelligence" replace />} />
          <Route path="/upload" element={<Navigate to="/knowledge" replace />} />
          <Route path="/sops" element={<Navigate to="/knowledge" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
