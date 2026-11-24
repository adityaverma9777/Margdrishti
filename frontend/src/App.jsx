import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import SurveyorDashboard from './pages/SurveyorDashboard';
import OfficialDashboard from './pages/OfficialDashboard';

function AppContent() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--gov-bg)' }}>
      <Header />
      <main style={{ flex: 1 }}>
        {currentUser.role === 'official' ? <OfficialDashboard /> : <SurveyorDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
