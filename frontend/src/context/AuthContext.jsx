import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const DEMO_USERS = {
  surveyor: {
    id: 'usr_surveyor_01',
    role: 'surveyor',
    name: 'Rajesh Sharma',
    department: 'Assam PWD — Highway Inspection Wing',
    vehicleNumber: 'AS-01-BX-4021',
    vehicleModel: 'Bolero Survey Unit #03',
    assignedState: 'Assam',
    assignedCity: 'Guwahati',
  },
  official: {
    id: 'usr_official_01',
    role: 'official',
    name: 'Dr. P. K. Goswami',
    department: 'Public Works Roads Department (PWRD), Assam',
    designation: 'Superintending Engineer',
    assignedState: 'Assam',
    assignedCity: 'Guwahati',
  }
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('streetiq_gov_user');
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
      localStorage.setItem('streetiq_gov_user', JSON.stringify(currentUser));
      if (currentUser.assignedState && currentUser.assignedCity) {
        setActiveRegion({
          state: currentUser.assignedState,
          city: currentUser.assignedCity
        });
      }
    } else {
      localStorage.removeItem('streetiq_gov_user');
    }
  }, [currentUser]);

  const loginAs = (role) => {
    const user = DEMO_USERS[role] || DEMO_USERS.surveyor;
    setCurrentUser(user);
  };

  const loginCustom = (email, role, vehicleNumber = '') => {
    const base = DEMO_USERS[role] || DEMO_USERS.surveyor;
    const user = {
      ...base,
      id: `usr_${Date.now()}`,
      email,
      vehicleNumber: vehicleNumber || base.vehicleNumber
    };
    setCurrentUser(user);
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const updateRegion = (state, city) => {
    setActiveRegion({ state, city });
  };

  return (
    <AuthContext.Provider value={{ currentUser, loginAs, loginCustom, logout, activeRegion, updateRegion }}>
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
