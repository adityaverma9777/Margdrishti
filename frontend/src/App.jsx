import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import SurveyorDashboard from './pages/SurveyorDashboard';
import OfficialDashboard from './pages/OfficialDashboard';
import MobileCameraPage from './pages/MobileCameraPage';
function AppContent() {
  const { currentUser } = useAuth();
  const params = new URLSearchParams(window.location.search);
  const camId = params.get('cam');
  const camName = params.get('name');
  if (camId) {
    return <MobileCameraPage deviceId={camId} deviceName={camName || 'Mobile Camera'} />;
  }
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
