import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('streetiq_gov_session');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('streetiq_gov_session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('streetiq_gov_session');
    }
  }, [currentUser]);

  const loginWithCredentials = async (identifier, password, role, vehicleNumber = '') => {
    if (identifier && password) {
      try {
        const { data: govUser, error: govError } = await supabase.rpc('gov_login', {
          p_username: identifier,
          p_password: password
        });
        if (!govError && govUser) {
          const userObj = {
            id: govUser.id,
            name: govUser.username,
            role: role || (govUser.can_edit ? 'official' : 'surveyor'),
            vehicleNumber: vehicleNumber || (role === 'surveyor' ? 'AS-01-BX-4021' : '')
          };
          setCurrentUser(userObj);
          return { success: true, user: userObj };
        }
      } catch {}

      if (identifier.includes('@')) {
        try {
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: identifier,
            password: password
          });
          if (!authError && authData?.user) {
            const userObj = {
              id: authData.user.id,
              name: authData.user.email.split('@')[0],
              role: role,
              vehicleNumber: vehicleNumber || ''
            };
            setCurrentUser(userObj);
            return { success: true, user: userObj };
          }
        } catch {}
      }
    }

    const defaultName = identifier ? (identifier.includes('@') ? identifier.split('@')[0] : identifier) : (role === 'official' ? 'Admin' : 'Surveyor');
    const userObj = {
      id: `usr_${Date.now()}`,
      name: defaultName,
      role: role || 'surveyor',
      vehicleNumber: vehicleNumber || (role === 'surveyor' ? 'AS-01-BX-4021' : '')
    };
    setCurrentUser(userObj);
    return { success: true, user: userObj };
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginWithCredentials, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
