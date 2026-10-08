import { useEffect, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, arrayUnion, collection, query, onSnapshot } from 'firebase/firestore';
import { messaging, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { playSuccessChime, speakEditorAssignment, speakUnassignedUrgentAnnouncement } from '../lib/soundChime';

const LOGO_URL = 'https://media.licdn.com/dms/image/v2/C4D0BAQG1MVAq9NsJmQ/company-logo_200_200/company-logo_200_200/0/1678299841092/gruporicpr_logo?e=2147483647&v=beta&t=i7G-u_n_6wi5V3PI3ZLF3LfYC_dNwzDjnkMZGMSDKyo';

export const getVapidKey = () => {
  const envKey = (import.meta as any).env.VITE_VAPID_KEY;
  return envKey || 'BJk0w20G8WKfX2UPyhQTbuyPeq-dG9VrdQS1nkOXq9seLH0yI8JMx3y3yEjkxn_avr2ur1n8c8HHHdbWuoN72SI';
};

/**
 * Registers device FCM token in Firestore users collection
 */
export const registerDeviceToken = async (userData: any, showToasts: boolean = true) => {
  if (!userData?.uid || !messaging) return null;
  if (!('Notification' in window)) return null;

  try {
    const vapidKey = getVapidKey();
    let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (!registration) {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
    }
    await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (token) {
      const userRef = doc(db, 'users', userData.uid);
      await setDoc(
        userRef,
        {
          fcmTokens: arrayUnion(token),
          lastDeviceSeenAt: new Date().toISOString(),
        },
        { merge: true }
      );

      localStorage.setItem('ric_fcm_token', token);
      if (showToasts) {
        toast.success('Dispositivo registrado para Web Push com sucesso!');
      }
      return token;
    }
  } catch (err: any) {
    console.warn('Erro ao registrar token do dispositivo:', err);
    if (showToasts) {
      toast.error(`Falha ao registrar Web Push: ${err.message || 'Erro de configuração'}`);
    }
  }
  return null;
};

export const requestNotificationPermission = async (userData: any) => {
  if (!userData) {
    toast.error('Erro: Usuário não autenticado.');
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

  if (isIOS && !isStandalone) {
    toast.error('No iPhone, as notificações web exigem o App Adicionado à Tela de Início.', { duration: 12000 });
    return;
  }

  if (!('Notification' in window)) {
    toast.error('Este navegador não suporta notificações Push.', { duration: 8000 });
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast.loading('Registrando chave Web Push...', { id: 'push-register' });
      const token = await registerDeviceToken(userData, false);
      if (token) {
        toast.success('🔔 Notificações ativadas! Você receberá alertas mesmo com a aba em segundo plano.', { id: 'push-register', duration: 7000 });
      } else {
        toast.success('Permissão concedida pelo navegador!', { id: 'push-register' });
      }
    } else if (permission === 'denied') {
      toast.error('Notificações bloqueadas nas configurações do seu navegador.');
    }
  } catch (error: any) {
    console.error('Error requesting notification permission:', error);
    toast.error('Erro ao pedir permissão ao navegador.');
  }
};

/**
 * Triggers a desktop notification using the active Service Worker
 */
export const triggerLocalNotification = (title: string, options: any = {}) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const fullOptions: any = {
    icon: LOGO_URL,
    badge: LOGO_URL,
    vibrate: [300, 100, 300, 100, 500],
    ...options,
  };

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => {
      reg.showNotification(title, fullOptions);
    }).catch(() => {
      new Notification(title, fullOptions);
    });
  } else {
    try {
      new Notification(title, fullOptions);
    } catch (e) {
      console.warn("Could not fire desktop notification:", e);
    }
  }
};

export default function NotificationHandler() {
  const { userData } = useAuth();
  const prevRetrancasRef = useRef<Map<string, { status: string; editorId: string; isUrgent?: boolean }>>(new Map());
  const initialSyncRef = useRef(true);

  // Auto-sync FCM token silently if user has already granted permission
  useEffect(() => {
    if (userData?.uid && 'Notification' in window && Notification.permission === 'granted') {
      registerDeviceToken(userData, false).catch(() => {});
    }
  }, [userData?.uid]);

  // Monitor retrancas in real time across the entire newsroom
  useEffect(() => {
    if (!userData?.uid) return;

    const myUid = (userData.uid || '').toLowerCase().trim();
    const myName = (userData.name || '').toLowerCase().trim();

    const isMatchMe = (targetId: string) => {
      if (!targetId) return false;
      const clean = targetId.toLowerCase().trim();
      return clean === myUid || clean === myName || (myUid && clean.includes(myUid)) || (myName && clean.includes(myName));
    };

    const q = query(collection(db, 'retrancas'));
    const unsubRetrancas = onSnapshot(q, (snap) => {
      snap.docs.forEach((d) => {
        const data = d.data();
        const prev = prevRetrancasRef.current.get(d.id);

        if (!initialSyncRef.current) {
          const isUrgent = !!data.isUrgent;
          const isUnassigned = !data.editorId;
          const isNowAssignedToMe = isMatchMe(data.editorId);
          const wasAssignedToMe = prev && isMatchMe(prev.editorId);

          // 1. Voice Announcement & Desktop Alert: Brand NEW UNASSIGNED URGENT retranca -> announce to everyone!
          // (Only if not created by me)
          const isCreatedByMe = data.createdBy === userData.uid || (userData.name && data.createdByName?.toLowerCase() === userData.name.toLowerCase());
          const isSelfClaimed = data.claimedBy === myUid || data.claimedBy === myName;

          if (!prev && isUnassigned && isUrgent && !isCreatedByMe) {
            speakUnassignedUrgentAnnouncement(data.title);
            toast.error(`🚨 RETRANCA URGENTE NA FILA ABERTA: ${data.title}!`, { duration: 9000 });

            // Display OS notification even if tab is in the background
            triggerLocalNotification(`🚨 RETRANCA URGENTE NA FILA ABERTA!`, {
              body: `A matéria "${data.title}" aguarda um editor livre na Central RIC.`,
              requireInteraction: true,
              tag: `urgent-open-${d.id}`,
            });
          }

          // 2. Voice Announcement & Desktop Alert when a retranca ARRIVES assigned to this Editor
          // CRITICAL: Must ONLY speak when it arrives ("quando chega"), NOT when the editor accepts/claims it himself!
          else if (isNowAssignedToMe && (!wasAssignedToMe || (prev && prev.editorId !== data.editorId)) && !isCreatedByMe && !isSelfClaimed) {
            speakEditorAssignment(data.editorId || userData.name || 'Editor', data.title, isUrgent);
            
            const alertTitle = isUrgent 
              ? `🚨 PAUTA URGENTE ATRIBUÍDA A VOCÊ!` 
              : `🎬 Nova Matéria Atribuída`;
            const alertBody = isUrgent
              ? `URGENTE: "${data.title}" requer atenção prioritária na sua ilha!`
              : `"${data.title}" foi atribuída à sua ilha de edição.`;

            if (isUrgent) {
              toast.error(alertBody, { duration: 10000 });
            } else {
              toast.success(alertBody, { duration: 6000 });
            }

            // Desktop push notification for the editor
            triggerLocalNotification(alertTitle, {
              body: alertBody,
              requireInteraction: isUrgent,
              tag: `assigned-${d.id}`,
            });
          }

          // 3. Alert creator when VT is completed
          if (prev && prev.status !== 'concluido' && data.status === 'concluido') {
            const isCreator =
              data.createdBy === userData.uid ||
              (userData.name && data.createdByName?.toLowerCase() === userData.name.toLowerCase()) ||
              (userData.email && userData.email.toLowerCase().includes('guilherme'));

            if (isCreator && data.editorId !== userData.uid) {
              playSuccessChime();
              toast.success(`🎬 VT Concluído! O editor finalizou a matéria: "${data.title}"`, {
                duration: 10000,
                position: 'top-right',
              });

              triggerLocalNotification(`🎬 VT Concluído!`, {
                body: `O editor finalizou a matéria: "${data.title}"`,
                tag: `done-${d.id}`,
              });
            }
          }
        }

        prevRetrancasRef.current.set(d.id, {
          status: data.status,
          editorId: data.editorId || '',
          isUrgent: !!data.isUrgent,
        });
      });
      initialSyncRef.current = false;
    }, (err) => {
      console.warn('Retrancas notification sync:', err);
    });

    return () => unsubRetrancas();
  }, [userData?.uid, userData?.name, userData?.email]);

  useEffect(() => {
    if (!userData || !messaging) return;

    // Foreground message handler
    const unsubOnMessage = onMessage(messaging, (payload) => {
      console.log('FCM Foreground message:', payload);
      if (payload.notification) {
        toast(
          `${payload.notification.title || 'Notificação'}: ${payload.notification.body || ''}`,
          {
            icon: '🔔',
            duration: 6000,
            position: 'top-right',
          }
        );
      }
    });

    return () => unsubOnMessage();
  }, [userData]);

  return null;
}
