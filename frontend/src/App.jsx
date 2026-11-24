import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import SurveyorDashboard from './pages/SurveyorDashboard';
import OfficialDashboard from './pages/OfficialDashboard';

function MainRouter() {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <LoginPage />;
  }

  if (currentUser.role === 'official') {
    return <OfficialDashboard />;
  }

  return <SurveyorDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--gov-bg)' }}>
        <Header />
        <main style={{ flex: 1 }}>
          <MainRouter />
        </main>
      </div>
    </AuthProvider>
  );
}
