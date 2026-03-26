import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Briefing from './pages/Briefing';
import Dashboard from './pages/Dashboard';
import Metrics from './pages/Metrics';
import Outcomes from './pages/Outcomes';
import Knowledge from './pages/Knowledge';
import SOPs from './pages/SOPs';
import SalesIntel from './pages/SalesIntel';
import ProductIntel from './pages/ProductIntel';
import Coaching from './pages/Coaching';
import Upload from './pages/Upload';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Briefing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/metrics" element={<Metrics />} />
          <Route path="/outcomes" element={<Outcomes />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/sops" element={<SOPs />} />
          <Route path="/sales" element={<SalesIntel />} />
          <Route path="/product" element={<ProductIntel />} />
          <Route path="/coaching" element={<Coaching />} />
          <Route path="/upload" element={<Upload />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
