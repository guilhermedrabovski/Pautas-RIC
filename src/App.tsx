import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Agendas from './pages/Agendas';
import MyDashboard from './pages/MyDashboard';
import Reminders from './pages/Reminders';
import Scales from './pages/Scales';
import Handovers from './pages/Handovers';
import Checklist from './pages/Checklist';
import Settings from './pages/Settings';
import Lineup from './pages/Lineup';
import Stories from './pages/Stories';
import WhatsAppMessages from './pages/WhatsAppMessages';
import EditorDashboard from './pages/EditorDashboard';

export default function App() {
  const { user, userData, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center font-bold text-ric-blue">Carregando...</div>;

  const isEditor = userData?.role === 'editor';

  return (
    <Routes>
      {!user ? (
        <Route path="*" element={<Login />} />
      ) : isEditor ? (
        // Editores têm acesso direto às Ilhas de Edição
        <Route element={<Layout />}>
          <Route path="/editor-dashboard" element={<EditorDashboard />} />
          <Route path="*" element={<Navigate to="/editor-dashboard" replace />} />
        </Route>
      ) : (
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/agendas" element={<Agendas />} />
          <Route path="/whatsapp" element={<WhatsAppMessages />} />
          <Route path="/editor-dashboard" element={<EditorDashboard />} />
          <Route path="/my-dashboard" element={<MyDashboard />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/scales" element={<Scales />} />
          <Route path="/stories" element={<Stories />} />
          <Route path="/lineup" element={<Lineup />} />
          <Route path="/handovers" element={<Handovers />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      )}
    </Routes>
  );
}
