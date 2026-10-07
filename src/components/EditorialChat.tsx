import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc,
  getDocs,
  writeBatch,
  doc,
  setDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import { 
  playMessageChime, 
  playMentionChime, 
  speakUserMentionAnnouncement 
} from '../lib/soundChime';
import { confirmAction } from '../lib/confirmHelper';
import { triggerLocalNotification } from './NotificationHandler';
import { sendPushNotification } from '../lib/notifications';
import { PREDEFINED_USERS, IMAGE_EDITORS_LIST } from '../lib/constants';
import { 
  MessageSquare, 
  X, 
  Send, 
  Film, 
  Users, 
  Flame, 
  Volume2, 
  VolumeX, 
  Minimize2, 
  Maximize2,
  Trash2,
  AtSign,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export interface ChatMessage {
  id: string;
  channel: 'geral' | 'ilha' | 'urgente';
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  mentions?: string[];
  createdAt: number;
}

export interface ChatCleanupRecord {
  lastClearedDate: string; // YYYY-MM-DD
  lastClearedAt: number;
  clearedBy: string;
  clearedByName: string;
}

export default function EditorialChat() {
  const { userData, users } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'geral' | 'ilha' | 'urgente'>('geral');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Mention system state
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  // Once-a-day cleanup state
  const [cleanupRecord, setCleanupRecord] = useState<ChatCleanupRecord | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const initialLoadRef = useRef(true);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isClearedToday = cleanupRecord?.lastClearedDate === todayStr;

  // Compile combined list of distinct team members for @mentions
  const availableMentionUsers = useMemo(() => {
    const map = new Map<string, { uid: string; name: string; role: string; email?: string; username?: string; fcmTokens?: string[] }>();

    // 1. Predefined image editors (Zand, Jamir, Jean, Miúdo, Valdeilton)
    IMAGE_EDITORS_LIST.forEach(e => {
      map.set(e.uid.toLowerCase(), {
        uid: e.uid,
        name: e.name,
        role: 'editor',
        username: e.uid,
      });
    });

    // 2. Predefined users
    PREDEFINED_USERS.forEach(p => {
      map.set(p.username.toLowerCase(), {
        uid: p.username,
        name: p.name,
        role: p.role,
        username: p.username,
      });
    });

    // 3. Database users from AuthContext
    users.forEach(u => {
      if (u.name) {
        const key = (u.uid || u.name).toLowerCase();
        const existing = map.get(key);
        map.set(key, {
          uid: u.uid,
          name: u.name,
          role: u.role || 'editor',
          email: u.email,
          fcmTokens: u.fcmTokens || existing?.fcmTokens,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  // Filter mention candidates based on current typed query
  const filteredMentionUsers = useMemo(() => {
    if (!mentionQuery) return availableMentionUsers.slice(0, 7);
    const q = mentionQuery.toLowerCase();
    return availableMentionUsers
      .filter(u => u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || (u.username && u.username.toLowerCase().includes(q)))
      .slice(0, 7);
  }, [availableMentionUsers, mentionQuery]);

  // Helper: check if a message mentions the current user
  const checkIsMentionOfMe = (msg: ChatMessage) => {
    if (!userData?.name && !userData?.uid) return false;
    const myName = (userData.name || '').toLowerCase().trim();
    const myFirstName = myName.split(' ')[0];
    const myUid = (userData.uid || '').toLowerCase().trim();
    const textLower = (msg.text || '').toLowerCase();

    const explicitlyTaggedByName = textLower.includes(`@${myName}`) || (myFirstName.length >= 3 && textLower.includes(`@${myFirstName}`));
    const explicitlyTaggedByUid = myUid.length >= 3 && textLower.includes(`@${myUid}`);
    const inMentionsArray = Array.isArray(msg.mentions) && msg.mentions.some(m => {
      const cleanM = (m || '').toLowerCase();
      return cleanM === myUid || cleanM === myName || cleanM === myFirstName;
    });

    return explicitlyTaggedByName || explicitlyTaggedByUid || inMentionsArray;
  };

  // Real-time listener for cleanup state
  useEffect(() => {
    const unsubCleanup = onSnapshot(doc(db, 'system_settings', 'chat_cleanup'), (snap) => {
      if (snap.exists()) {
        setCleanupRecord(snap.data() as ChatCleanupRecord);
      } else {
        setCleanupRecord(null);
      }
    }, (err) => {
      console.warn("Chat cleanup listener:", err);
    });

    return () => unsubCleanup();
  }, []);

  // Real-time listener for messages
  useEffect(() => {
    const q = query(
      collection(db, 'chat_messages'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsub = onSnapshot(q, snap => {
      const docs: ChatMessage[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as ChatMessage)).reverse();

      // Check if new messages arrived after initial load
      if (!initialLoadRef.current && docs.length > messages.length) {
        const newBatch = docs.slice(messages.length);
        const myMentionMsg = newBatch.find(m => m.senderId !== userData?.uid && checkIsMentionOfMe(m));
        const otherMsg = newBatch.find(m => m.senderId !== userData?.uid);

        if (myMentionMsg) {
          // ⭐ DISTINCT ALERT FOR MENTION!
          if (soundEnabled) {
            speakUserMentionAnnouncement(myMentionMsg.senderName);
          }
          toast(
            `⭐ Você foi mencionado no Chat por ${myMentionMsg.senderName}: "${myMentionMsg.text}"`,
            {
              icon: '📢',
              duration: 10000,
              style: {
                background: '#FEF3C7',
                color: '#78350F',
                border: '2px solid #F59E0B',
                fontWeight: '900',
              }
            }
          );
          triggerLocalNotification(`⭐ @Você no Chat da Redação!`, {
            body: `${myMentionMsg.senderName}: ${myMentionMsg.text}`,
            requireInteraction: true,
            tag: `chat-mention-${myMentionMsg.id}`
          });
        } else if (otherMsg) {
          if (soundEnabled) {
            playMessageChime();
          }
        }

        if (!isOpen) {
          setUnreadCount(prev => prev + (docs.length - messages.length));
        }
      }

      initialLoadRef.current = false;
      setMessages(docs);
    }, err => {
      console.warn("Could not load chat messages:", err);
    });

    return () => unsub();
  }, [userData?.uid, userData?.name, soundEnabled, isOpen, messages.length]);

  // Reset unread count when opening
  useEffect(() => {
    if (isOpen) {
      setUnreadCount(0);
      scrollToBottom();
    }
  }, [isOpen, activeChannel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Handle Input text & trigger @mention autocomplete
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAt = textBeforeCursor.lastIndexOf('@');

    if (lastAt !== -1) {
      const queryPart = textBeforeCursor.slice(lastAt + 1);
      // Only show menu if there is no space between @ and cursor
      if (!queryPart.includes(' ')) {
        setMentionQuery(queryPart);
        setMentionStartIndex(lastAt);
        setShowMentionMenu(true);
        setSelectedMentionIndex(0);
        return;
      }
    }

    setShowMentionMenu(false);
  };

  // Select a user from the @mention dropdown
  const handleSelectMention = (user: { name: string; uid: string }) => {
    if (mentionStartIndex === -1) {
      setInputText(prev => prev + `@${user.name} `);
    } else {
      const before = inputText.slice(0, mentionStartIndex);
      const after = inputText.slice(mentionStartIndex + 1 + mentionQuery.length);
      setInputText(`${before}@${user.name} ${after}`);
    }
    setShowMentionMenu(false);
    inputRef.current?.focus();
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !userData?.uid) return;

    try {
      // Extract mentioned users
      const textLower = text.toLowerCase();
      const mentionedUsers = availableMentionUsers.filter(u => {
        const nameLower = u.name.toLowerCase();
        const firstLower = nameLower.split(' ')[0];
        const uidLower = u.uid.toLowerCase();
        return (
          textLower.includes(`@${nameLower}`) ||
          (firstLower.length >= 3 && textLower.includes(`@${firstLower}`)) ||
          (uidLower.length >= 3 && textLower.includes(`@${uidLower}`))
        );
      });

      const mentions = Array.from(new Set(mentionedUsers.map(u => u.uid)));

      await addDoc(collection(db, 'chat_messages'), {
        channel: activeChannel,
        senderId: userData.uid,
        senderName: userData.name || userData.email?.split('@')[0] || 'Usuário',
        senderRole: userData.role || 'editor',
        text,
        mentions,
        createdAt: Date.now()
      });

      // Dispatch Web Push to mentioned users if they have registered tokens
      mentionedUsers.forEach(u => {
        if (u.uid !== userData.uid && u.fcmTokens && u.fcmTokens.length > 0) {
          sendPushNotification(
            u as any,
            `💬 @Você no Chat da Redação!`,
            `${userData.name || 'Alguém'}: ${text}`,
            true,
            '/ilhas-de-edicao'
          ).catch(() => {});
        }
      });

      setInputText('');
      setShowMentionMenu(false);
      scrollToBottom();
    } catch (e: any) {
      console.error("Error sending message:", e);
      toast.error("Erro ao enviar mensagem.");
    }
  };

  // Keyboard navigation for mentions & submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionMenu && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev + 1) % filteredMentionUsers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev - 1 + filteredMentionUsers.length) % filteredMentionUsers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(filteredMentionUsers[selectedMentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionMenu(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Clear messages once per day
  const handleClearDailyChat = async () => {
    if (isClearedToday) {
      toast(`O chat já foi limpo hoje (${format(cleanupRecord.lastClearedAt, 'HH:mm')} por ${cleanupRecord.clearedByName}). A limpeza diária é permitida 1 vez ao dia.`, {
        icon: 'ℹ️',
        duration: 6000
      });
      return;
    }

    confirmAction(
      `Deseja realmente limpar as mensagens do chat da redação? Esta limpeza pode ser feita 1 vez por dia para organizar o plantão de hoje (${format(new Date(), 'dd/MM/yyyy')}).`,
      async () => {
        setIsCleaning(true);
        const toastId = toast.loading('Limpando mensagens do chat...');
        try {
          const snap = await getDocs(collection(db, 'chat_messages'));
          const batch = writeBatch(db);
          snap.docs.forEach(d => {
            batch.delete(d.ref);
          });
          await batch.commit();

          // Save cleanup date
          await setDoc(doc(db, 'system_settings', 'chat_cleanup'), {
            lastClearedDate: todayStr,
            lastClearedAt: Date.now(),
            clearedBy: userData?.uid || '',
            clearedByName: userData?.name || 'Coordenação',
          });

          // Post greeting system message
          await addDoc(collection(db, 'chat_messages'), {
            channel: 'geral',
            senderId: 'system',
            senderName: 'SISTEMA',
            senderRole: 'admin',
            text: `🧹 Chat limpo por ${userData?.name || 'Coordenação'} para o plantão de hoje (${format(new Date(), 'dd/MM/yyyy')}). Bom trabalho a toda a redação!`,
            createdAt: Date.now()
          });

          toast.success('Chat da redação limpo com sucesso para o dia de hoje!', { id: toastId });
        } catch (err: any) {
          console.error("Erro ao limpar chat:", err);
          toast.error('Erro ao limpar chat: ' + err.message, { id: toastId });
        } finally {
          setIsCleaning(false);
        }
      }
    );
  };

  const channelMessages = messages.filter(m => m.channel === activeChannel);

  // Quick Chips
  const quickChips = activeChannel === 'ilha' ? [
    'VT concluído!',
    'Assumi a retranca',
    'Subindo mídia no drive',
    'Quem está livre na ilha?'
  ] : activeChannel === 'urgente' ? [
    '🚨 Material urgente no ar!',
    'Furo de reportagem!',
    'Prioridade total na edição'
  ] : [
    'Bom plantão a todos!',
    'Pauta liberada',
    'Aguardando material',
    'Alguém na escuta?'
  ];

  // Helper to parse and highlight @Mentions in message text
  const renderMessageContent = (text: string) => {
    const myName = (userData?.name || '').toLowerCase();
    const myFirst = myName.split(' ')[0];
    const myUid = (userData?.uid || '').toLowerCase();

    // Regex to split on @Mention sequences
    const parts = text.split(/(@[a-zA-Z0-9À-ÿ_\-]+)/g);

    return parts.map((part, i) => {
      if (part.startsWith('@')) {
        const cleanTag = part.slice(1).toLowerCase();
        const isMeTagged = cleanTag === myName || (myFirst.length >= 3 && cleanTag === myFirst) || cleanTag === myUid;
        return (
          <span
            key={i}
            className={`inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded-md font-black text-[11px] shadow-2xs ${
              isMeTagged
                ? 'bg-amber-300 text-amber-950 border border-amber-500 animate-pulse'
                : 'bg-blue-100 text-blue-900 border border-blue-300'
            }`}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setIsMinimized(false);
          }}
          className="bg-ric-blue hover:bg-[#002244] text-white px-4 py-3.5 rounded-full shadow-2xl flex items-center gap-2.5 transition-all transform hover:scale-105 active:scale-95 cursor-pointer border-2 border-white/30"
          title="Abrir Chat da Redação & Ilha de Edição"
        >
          <div className="relative flex items-center justify-center">
            <MessageSquare size={20} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-ric-blue animate-pulse" />
          </div>
          <span className="text-xs font-black uppercase tracking-wide">
            Chat da Redação
          </span>
          {unreadCount > 0 && (
            <span className="bg-ric-red text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col transition-all overflow-hidden ${
          isMinimized 
            ? 'w-84 h-14' 
            : 'w-[94vw] sm:w-[410px] h-[550px] max-h-[88vh]'
        }`}>
          {/* Header */}
          <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between shrink-0 select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold shrink-0">
                <MessageSquare size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="font-black text-xs uppercase tracking-wide truncate">
                  Chat da Redação & Ilha
                </h3>
                <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ao Vivo
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300">
              {/* Button: Limpar mensagens 1x por dia */}
              <button
                type="button"
                onClick={handleClearDailyChat}
                disabled={isCleaning}
                className={`p-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                  isClearedToday 
                    ? 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700' 
                    : 'bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/60 shadow-xs'
                }`}
                title={
                  isClearedToday
                    ? `Limpo hoje às ${format(cleanupRecord.lastClearedAt, 'HH:mm')} por ${cleanupRecord.clearedByName}. Limpeza disponível 1x ao dia.`
                    : 'Limpar mensagens do chat (permitido 1 vez por dia)'
                }
              >
                <Trash2 size={13} className={isClearedToday ? 'text-slate-400' : 'text-red-400'} />
                <span className="text-[10px] uppercase font-black">
                  {isClearedToday ? 'Limpo Hoje' : 'Limpar (1x/dia)'}
                </span>
              </button>

              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className="p-1 hover:text-white rounded-md cursor-pointer transition-colors"
                title={soundEnabled ? 'Desativar aviso sonoro' : 'Ativar aviso sonoro'}
              >
                {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} className="text-slate-500" />}
              </button>
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1 hover:text-white rounded-md cursor-pointer transition-colors"
                title={isMinimized ? 'Expandir' : 'Minimizar'}
              >
                {isMinimized ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:text-white rounded-md cursor-pointer transition-colors"
                title="Fechar chat"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Daily Cleanup Status Sub-bar */}
              {isClearedToday && cleanupRecord && (
                <div className="bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 border-b border-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-slate-700">
                    <CheckCircle2 size={11} className="text-emerald-600" />
                    Limpeza diária realizada às {format(cleanupRecord.lastClearedAt, 'HH:mm')} por <strong>{cleanupRecord.clearedByName}</strong>
                  </span>
                  <span className="text-[9px] bg-slate-200 px-1.5 py-0.2 rounded font-black text-slate-600">
                    1x ao dia
                  </span>
                </div>
              )}

              {/* Channel Tabs */}
              <div className="flex border-b border-slate-200 bg-slate-50 p-1.5 gap-1 shrink-0">
                <button
                  onClick={() => setActiveChannel('geral')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeChannel === 'geral' 
                      ? 'bg-white text-ric-blue shadow-xs border border-slate-200' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users size={12} /> Geral
                </button>
                <button
                  onClick={() => setActiveChannel('ilha')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeChannel === 'ilha' 
                      ? 'bg-blue-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Film size={12} /> Ilha Edição
                </button>
                <button
                  onClick={() => setActiveChannel('urgente')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeChannel === 'urgente' 
                      ? 'bg-red-600 text-white shadow-xs' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Flame size={12} /> Urgentes
                </button>
              </div>

              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/50">
                {channelMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <MessageSquare size={28} className="mb-2 opacity-40" />
                    <p className="text-xs font-bold uppercase">Nenhuma mensagem neste canal ainda.</p>
                    <p className="text-[11px] mt-1 text-slate-400">Marque colegas com <strong>@Nome</strong> para chamar a atenção!</p>
                  </div>
                ) : (
                  channelMessages.map(msg => {
                    const isMe = msg.senderId === userData?.uid;
                    const isSystem = msg.senderId === 'system';
                    const isEditor = msg.senderRole === 'editor';
                    const isPauteiro = ['pauteiro', 'pauteira'].includes(msg.senderRole);
                    const isAdmin = msg.senderRole === 'admin';
                    const isMentionedForMe = !isMe && checkIsMentionOfMe(msg);

                    if (isSystem) {
                      return (
                        <div key={msg.id} className="flex justify-center my-2 animate-in fade-in">
                          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-1.5 rounded-xl text-[11px] font-bold text-center max-w-[90%] shadow-2xs flex items-center gap-1.5">
                            <Sparkles size={13} className="text-emerald-600 shrink-0" />
                            <span>{msg.text}</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className={`text-[10px] font-black uppercase ${
                            isMe ? 'text-ric-blue' : 'text-slate-800'
                          }`}>
                            {isMe ? 'Você' : msg.senderName}
                          </span>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded-md ${
                            isAdmin ? 'bg-red-100 text-red-700' :
                            isEditor ? 'bg-blue-100 text-blue-700' :
                            isPauteiro ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-200 text-slate-700'
                          }`}>
                            {msg.senderRole}
                          </span>
                          <span className="text-[9px] text-slate-400 font-medium">
                            {msg.createdAt ? format(msg.createdAt, 'HH:mm') : ''}
                          </span>
                        </div>

                        {/* Distinct Alert Styling for Mentions */}
                        {isMentionedForMe && (
                          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-t-lg shadow-2xs mb-0.5">
                            <AlertCircle size={10} className="animate-pulse text-amber-600" />
                            <span>Você foi mencionado nesta mensagem</span>
                          </div>
                        )}

                        <div
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed font-medium shadow-2xs ${
                            isMentionedForMe
                              ? 'bg-amber-50 border-2 border-amber-400 text-amber-950 font-bold ring-2 ring-amber-300/40 rounded-tl-xs shadow-md'
                              : isMe
                                ? 'bg-ric-blue text-white rounded-br-xs'
                                : activeChannel === 'urgente'
                                  ? 'bg-red-50 border border-red-200 text-red-950 rounded-bl-xs font-bold'
                                  : 'bg-white border border-slate-200 text-slate-900 rounded-bl-xs'
                          }`}
                        >
                          {renderMessageContent(msg.text)}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Chips */}
              <div className="px-3 py-1.5 bg-white border-t border-slate-100 flex gap-1.5 overflow-x-auto shrink-0 no-scrollbar">
                {quickChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    className="whitespace-nowrap px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-colors cursor-pointer shrink-0"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Mention Suggestion Dropdown */}
              {showMentionMenu && filteredMentionUsers.length > 0 && (
                <div className="bg-white border-2 border-blue-600 rounded-xl shadow-2xl mx-2 mb-1 p-1 max-h-48 overflow-y-auto z-50">
                  <div className="px-2 py-1 text-[9px] font-black uppercase tracking-wider text-blue-700 border-b border-slate-100 flex items-center justify-between">
                    <span>Mencionar Colega (@)</span>
                    <span className="text-[8px] text-slate-400 font-normal">Use ↑↓ ou clique</span>
                  </div>
                  {filteredMentionUsers.map((u, idx) => (
                    <button
                      key={u.uid}
                      type="button"
                      onClick={() => handleSelectMention(u)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between text-xs transition-colors cursor-pointer ${
                        idx === selectedMentionIndex 
                          ? 'bg-blue-50 text-blue-900 font-black' 
                          : 'text-slate-800 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-black text-[10px] flex items-center justify-center">
                          {u.name.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-bold">@{u.name}</span>
                      </div>
                      <span className="text-[9px] font-bold uppercase bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                        {u.role}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Input Form with @mention trigger button */}
              <div className="p-2.5 bg-white border-t border-slate-200 shrink-0 flex items-center gap-2 relative">
                {/* Quick @ mention button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMentionMenu(!showMentionMenu);
                    setMentionQuery('');
                    setMentionStartIndex(inputText.length);
                    inputRef.current?.focus();
                  }}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    showMentionMenu 
                      ? 'bg-blue-600 text-white shadow-xs' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  title="Marcar usuário com @"
                >
                  <AtSign size={16} />
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Mensagem em #${activeChannel}... (digite @ para marcar)`}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none"
                />

                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim()}
                  className="bg-ric-blue hover:bg-[#002244] disabled:opacity-40 text-white p-2.5 rounded-xl transition-all cursor-pointer active:scale-95 shrink-0"
                  title="Enviar mensagem"
                >
                  <Send size={15} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
