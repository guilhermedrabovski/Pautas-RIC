import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { PREDEFINED_USERS } from '../lib/constants';

export interface UserData {
  uid: string;
  name: string;
  email: string;
  role: 'reporter' | 'pauteiro' | 'pauteira' | 'editor' | 'admin' | 'cinegrafista';
  isActive?: boolean;
  fcmTokens?: string[];
}

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  users: UserData[];
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  users: [],
  loading: true,
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Safety timeout to prevent stuck loading
    const timeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn("Auth loading timed out, forcing release.");
          return false;
        }
        return prev;
      });
    }, 10000);

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      try {
        setUser(u);
        if (u) {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserData({ ...docSnap.data(), uid: u.uid } as UserData);
          } else {
            // Find in predefined users by email or username
            const emailLower = (u.email || '').toLowerCase();
            const usernameGuess = emailLower.includes('@') ? emailLower.split('@')[0] : emailLower;
            const predefined = PREDEFINED_USERS.find(p => 
              p.username.toLowerCase() === usernameGuess || 
              emailLower.includes(p.username.toLowerCase()) ||
              (u.displayName && p.name.toLowerCase() === u.displayName.toLowerCase())
            );

            const fallbackUser: UserData = {
              uid: u.uid,
              name: predefined?.name || u.displayName || usernameGuess.charAt(0).toUpperCase() + usernameGuess.slice(1),
              email: u.email || `${usernameGuess}@ric.com.br`,
              role: (predefined?.role as any) || (usernameGuess.includes('guilherme') ? 'admin' : 'reporter')
            };

            setDoc(docRef, fallbackUser, { merge: true }).catch(err => console.warn(err));
            setUserData(fallbackUser);
          }
        } else {
          setUserData(null);
        }
      } catch (error) {
        console.error("Error in AuthContext initialization:", error);
      } finally {
        setLoading(false);
        clearTimeout(timeout);
      }
    });

    return () => {
      unsubAuth();
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (user) {
      getDocs(collection(db, 'users'))
        .then(snap => {
          setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
        })
        .catch(err => console.error("Error fetching users list:", err));
    } else {
      setUsers([]);
    }
  }, [user]);

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, users, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
