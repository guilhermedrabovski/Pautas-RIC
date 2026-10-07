import { useEffect, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, collection, query, onSnapshot } from 'firebase/firestore';
import { messaging, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { playSuccessChime, speakEditorAssignment, speakUnassignedUrgentAnnouncement } from '../lib/soundChime';

export const requestNotificationPermission = async (userData: any) => {
  if (!userData || !messaging) {
    toast.error('Erro: Usuário não autenticado ou mensagens não suportadas.');
    return;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

  if (isIOS && !isStandalone) {
    toast.error('No iPhone, as notificações só funcionam no App Instalado. Clique no botão de Compartilhar do Safari (quadrado com seta para cima) -> "Adicionar à Tela de Início". Depois, abra o aplicativo pela sua tela inicial e tente novamente.', { duration: 15000 });
    return;
  }

  if (!('Notification' in window)) {
    toast.error('Este dispositivo não suporta notificações web ou precisa de configuração.', { duration: 10000 });
    return;
  }
  
  try {
    Notification.requestPermission().then(async (permission) => {
      if (permission === 'granted') {
        const rawVapidKey = (import.meta as any).env.VITE_VAPID_KEY;
        const vapidKey = rawVapidKey || 'BJk0w20G8WKfX2UPyhQTbuyPeq-dG9VrdQS1nkOXq9seLH0yI8JMx3y3yEjkxn_avr2ur1n8c8HHHdbWuoN72SI';
        
        if (!vapidKey) {
          toast.error('Erro de configuração do servidor (Vapid Key). Contate o suporte.');
          return;
        }

        if (!rawVapidKey) {
          toast.loading('Usando configuração de teste. Caso falte permissão ao se conectar ao Firebase, adicione VITE_VAPID_KEY no .env ou nos Segredos.', { duration: 6000 });
        } else {
          toast.success('Permissão concedida. Registrando dispositivo...');
        }

        try {
          const registration = await navigator.serviceWorker.ready;
          
          const token = await getToken(messaging, {
            vapidKey: vapidKey,
            serviceWorkerRegistration: registration
          });

          if (token) {
            const userRef = doc(db, 'users', userData.uid);
            await updateDoc(userRef, {
              fcmTokens: arrayUnion(token)
            });
            toast.success('Notificações vinculadas ao seu dispositivo com sucesso!');
            console.log('FCM Token registered', token);
          } else {
            toast.error('Ocorreu um erro ao gerar a credencial do dispositivo.');
          }
        } catch (e: any) {
          console.error(e);
          let userFriendlyMessage = `Erro ao obter token: ${e.message}`;
          const isExpectedPatternError = e.message?.includes('The string did not match the expected pattern') || e.name === 'SyntaxError';
          
          if (isExpectedPatternError) {
            userFriendlyMessage = 'A Chave VAPID de teste não pertence ao seu projeto do Firebase. Obtenha a "Web Push Certificate" correta nas configurações do seu site Firebase Console e salve a variável VITE_VAPID_KEY.';
          }
          toast.error(userFriendlyMessage, { duration: 15000 });
        }
      } else if (permission === 'denied') {
        toast.error('Você negou a permissão de notificação neste navegador.');
      }
    }).catch(err => {
      console.error(err);
      toast.error('Erro ao pedir permissão ao navegador.');
    });
  } catch (error: any) {
    console.error('Error getting notification token:', error);
  }
};

export default function NotificationHandler() {
  const { userData } = useAuth();
  const prevRetrancasRef = useRef<Map<string, { status: string; editorId: string }>>(new Map());
  const initialSyncRef = useRef(true);

  // Monitor retrancas in real time across the entire app
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
    const unsubRetrancas = onSnapshot(q, snap => {
      snap.docs.forEach(d => {
        const data = d.data();
        const prev = prevRetrancasRef.current.get(d.id);

        if (!initialSyncRef.current) {
          const isUrgent = !!data.isUrgent;
          const isUnassigned = !data.editorId;
          const isNowAssignedToMe = isMatchMe(data.editorId);
          const wasAssignedToMe = prev && isMatchMe(prev.editorId);

          // 1. Voice Announcement: Brand NEW UNASSIGNED URGENT retranca -> announce to everyone!
          if (!prev && isUnassigned && isUrgent) {
            speakUnassignedUrgentAnnouncement(data.title);
            toast.error(`🚨 RETRANCA URGENTE NA FILA ABERTA: ${data.title}!`, { duration: 9000 });
          }

          // 2. Voice Announcement when a retranca is assigned to the current user (Editor)
          else if (isNowAssignedToMe && (!wasAssignedToMe || (prev && prev.editorId !== data.editorId))) {
            // Trigger spoken voice announcement with editor name (with urgency stress if urgent!)
            speakEditorAssignment(data.editorId || userData.name || 'Editor', data.title, isUrgent);
          }

          // 3. Alert creator when VT is completed
          if (prev && prev.status !== 'concluido' && data.status === 'concluido') {
            const isCreator = data.createdBy === userData.uid || 
              (userData.name && data.createdByName?.toLowerCase() === userData.name.toLowerCase()) ||
              (userData.email && userData.email.toLowerCase().includes('guilherme'));

            if (isCreator && data.editorId !== userData.uid) {
              playSuccessChime();
              toast.success(
                `🎬 VT Concluído! O editor finalizou a matéria: "${data.title}"`,
                { duration: 10000, position: 'top-right' }
              );
            }
          }
        }

        prevRetrancasRef.current.set(d.id, {
          status: data.status,
          editorId: data.editorId || ''
        });
      });
      initialSyncRef.current = false;
    }, err => {
      console.warn("Retrancas notification sync:", err);
    });

    return () => unsubRetrancas();
  }, [userData?.uid, userData?.name, userData?.email]);

  useEffect(() => {
    if (!userData || !messaging) return;

    // Foreground message handler
    const unsubOnMessage = onMessage(messaging, (payload) => {
      console.log('Message received in foreground:', payload);
      if (payload.notification) {
        toast.success(`${payload.notification.title}: ${payload.notification.body}`, {
          duration: 5000,
          position: 'top-right'
        });
      }
    });

    return () => unsubOnMessage();
  }, [userData]);

  return null;
}
