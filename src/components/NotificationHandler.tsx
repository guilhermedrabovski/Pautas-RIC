import { useEffect, useRef } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, collection, query, onSnapshot } from 'firebase/firestore';
import { messaging, db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { playSuccessChime } from '../lib/soundChime';

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
    // Need to call this synchronously without await to ensure Safari doesn't block it as non-user interaction
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
            userFriendlyMessage = 'A Chave VAPID de teste não pertence ao seu projeto do Firebase. Obtenha a "Web Push Certificate" correta nas configurações do seu site Firebase Console (Configurações -> Cloud Messaging -> Web Push certificates) e salve a variável de ambiente VITE_VAPID_KEY nos Segredos do seu app.';
          }
          toast.error(userFriendlyMessage, { duration: 15000 });
        }
      } else if (permission === 'denied') {
        toast.error('Você negou a permissão de notificação neste navegador. Caso queira ativar, altere as permissões do site nas configurações do navegador.', { duration: 6000 });
      } else {
        toast.error('Permissão de notificação não foi concedida (' + permission + ').');
      }
    }).catch(err => {
      console.error(err);
      toast.error('Erro ao pedir permissão ao navegador.');
    });
  } catch (error: any) {
    console.error('Error getting notification token:', error);
    toast.error(`Erro técnico ao ativar notificações: ${error.message}. Tente recarregar a página e garantir que a internet está estável.`, { duration: 6000 });
  }
};

export default function NotificationHandler() {
  const { userData } = useAuth();
  const prevStatusesRef = useRef<Map<string, string>>(new Map());
  const initialSyncRef = useRef(true);

  // Monitor retrancas in real time to alert the creator when completed
  useEffect(() => {
    if (!userData?.uid) return;

    const q = query(collection(db, 'retrancas'));
    const unsubRetrancas = onSnapshot(q, snap => {
      snap.docs.forEach(d => {
        const data = d.data();
        const prevStatus = prevStatusesRef.current.get(d.id);

        if (!initialSyncRef.current && prevStatus && prevStatus !== 'concluido' && data.status === 'concluido') {
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
        prevStatusesRef.current.set(d.id, data.status);
      });
      initialSyncRef.current = false;
    }, err => {
      console.warn("Retrancas notification sync:", err);
    });

    return () => unsubRetrancas();
  }, [userData?.uid, userData?.name, userData?.email]);

  useEffect(() => {
    if (!userData || !messaging) return;

    // Remove automatic permission request: requestPermission();

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
