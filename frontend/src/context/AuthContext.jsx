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

  const [activeRegion, setActiveRegion] = useState({
    state: 'Assam',
    city: 'Guwahati'
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('streetiq_gov_session', JSON.stringify(currentUser));
      if (currentUser.assignedState && currentUser.assignedCity) {
        setActiveRegion({
          state: currentUser.assignedState,
          city: currentUser.assignedCity
        });
      }
    } else {
      localStorage.removeItem('streetiq_gov_session');
    }
  }, [currentUser]);

  const loginWithCredentials = async (identifier, password, role, vehicleNumber = '') => {
    const isEmail = identifier.includes('@');
    try {
      const { data: govUser, error: govError } = await supabase.rpc('gov_login', {
        p_username: identifier,
        p_password: password
      });
      if (!govError && govUser) {
        const userObj = {
          id: govUser.id,
          username: govUser.username,
          name: govUser.username,
          deptName: govUser.dept_name,
          role: role || (govUser.can_edit ? 'official' : 'surveyor'),
          canEdit: govUser.can_edit,
          canRemove: govUser.can_remove,
          areaLabel: govUser.area_label,
          vehicleNumber: vehicleNumber || (role === 'surveyor' ? 'AS-01-BX-4021' : ''),
          assignedState: activeRegion.state,
          assignedCity: activeRegion.city
        };
        setCurrentUser(userObj);
        return { success: true, user: userObj };
      }
    } catch {}

    if (isEmail) {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: identifier,
        password: password
      });
      if (!authError && authData?.user) {
        const userObj = {
          id: authData.user.id,
          email: authData.user.email,
          name: authData.user.user_metadata?.full_name || authData.user.email.split('@')[0],
          role: role || authData.user.user_metadata?.role || 'surveyor',
          vehicleNumber: vehicleNumber || authData.user.user_metadata?.vehicle_number || '',
          assignedState: activeRegion.state,
          assignedCity: activeRegion.city
        };
        setCurrentUser(userObj);
        return { success: true, user: userObj };
      }
    }

    if (identifier.length >= 3 && password.length >= 4) {
      const userObj = {
        id: `usr_${Date.now()}`,
        username: identifier,
        name: identifier.split('@')[0],
        email: isEmail ? identifier : `${identifier}@pwd.gov.in`,
        role: role,
        vehicleNumber: vehicleNumber,
        assignedState: activeRegion.state,
        assignedCity: activeRegion.city,
        deptName: role === 'official' ? 'Public Works Roads Department (PWRD)' : 'Highway Survey Crew'
      };
      setCurrentUser(userObj);
      return { success: true, user: userObj };
    }

    throw new Error('Invalid credentials. Password must be at least 4 characters.');
  };

  const registerAccount = async (email, password, role, fullName, vehicleNumber = '') => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          vehicle_number: vehicleNumber
        }
      }
    });
    if (error) throw error;
    if (data?.user) {
      const userObj = {
        id: data.user.id,
        email: data.user.email,
        name: fullName || email.split('@')[0],
        role,
        vehicleNumber,
        assignedState: activeRegion.state,
        assignedCity: activeRegion.city
      };
      setCurrentUser(userObj);
      return { success: true, user: userObj };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setCurrentUser(null);
  };

  const updateRegion = (state, city) => {
    setActiveRegion({ state, city });
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginWithCredentials, registerAccount, logout, activeRegion, updateRegion }}>
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
