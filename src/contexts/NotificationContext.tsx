import React, { createContext, useContext, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

const NotificationContext = createContext({});

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userData } = useAuth();

  useEffect(() => {
    if (!userData) return;

    // Listen for new reminders
    const qReminders = query(
      collection(db, 'reminders'),
      where('toId', '==', userData.uid),
      where('read', '==', false)
    );

    const unsubReminders = onSnapshot(qReminders, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // Filter to only notify if it was created in the last 10 seconds to avoid storm on reload
          if (Date.now() - data.createdAt < 10000) {
            toast('Novo lembrete recebido!', {
              icon: '🔔',
              style: { borderRadius: '10px', background: '#333', color: '#fff' }
            });
          }
        }
      });
    });

    // If reporter, listen for new agendas assigned to them
    let unsubAgendas = () => {};
    if (userData.role === 'reporter') {
      const qAgendas = query(
        collection(db, 'agendas'),
        where('reporterId', '==', userData.uid)
      );

      unsubAgendas = onSnapshot(qAgendas, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
             const data = change.doc.data();
             if (Date.now() - data.updatedAt < 10000) {
               toast.success(`Pauta atualizada: ${data.slug || 'Sem retranca'}`);
             }
          }
        });
      });
    }

    // Listen for new shift trade requests directed to the current user
    const qTrades = query(
      collection(db, 'shiftTrades'),
      where('targetUserId', '==', userData.uid),
      where('status', '==', 'pending_target')
    );

    const unsubTrades = onSnapshot(qTrades, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (Date.now() - data.createdAt < 10000) {
            toast('Nova solicitação de troca de turno!', {
              icon: '🔄',
              style: { borderRadius: '10px', background: '#F59E0B', color: '#fff', fontWeight: 'bold' }
            });
          }
        }
      });
    });

    return () => {
      unsubReminders();
      unsubAgendas();
      unsubTrades();
    };
  }, [userData]);

  return (
    <NotificationContext.Provider value={{}}>
      {children}
    </NotificationContext.Provider>
  );
};
