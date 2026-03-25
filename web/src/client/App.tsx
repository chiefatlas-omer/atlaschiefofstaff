import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Metrics from './pages/Metrics';
import Knowledge from './pages/Knowledge';
import SOPs from './pages/SOPs';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/sops" element={<SOPs />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
