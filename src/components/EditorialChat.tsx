import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { playMessageChime } from '../lib/soundChime';
import { 
  MessageSquare, 
  X, 
  Send, 
  Smile, 
  Film, 
  Users, 
  Flame, 
  Volume2, 
  VolumeX, 
  Minimize2, 
  Maximize2,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';

export interface ChatMessage {
  id: string;
  channel: 'geral' | 'ilha' | 'urgente';
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  createdAt: number;
}

export default function EditorialChat() {
  const { userData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'geral' | 'ilha' | 'urgente'>('geral');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const initialLoadRef = useRef(true);

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

      // Check if new message arrived after initial load
      if (!initialLoadRef.current && docs.length > messages.length) {
        const lastMsg = docs[docs.length - 1];
        if (lastMsg && lastMsg.senderId !== userData?.uid) {
          if (soundEnabled) {
            playMessageChime();
          }
          if (!isOpen) {
            setUnreadCount(prev => prev + 1);
          }
        }
      }

      initialLoadRef.current = false;
      setMessages(docs);
    }, err => {
      console.warn("Could not load chat messages:", err);
    });

    return unsub;
  }, [userData?.uid, soundEnabled, isOpen, messages.length]);

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

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || !userData?.uid) return;

    try {
      await addDoc(collection(db, 'chat_messages'), {
        channel: activeChannel,
        senderId: userData.uid,
        senderName: userData.name || userData.email?.split('@')[0] || 'Usuário',
        senderRole: userData.role || 'editor',
        text,
        createdAt: Date.now()
      });
      setInputText('');
      scrollToBottom();
    } catch (e: any) {
      console.error("Error sending message:", e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const channelMessages = messages.filter(m => m.channel === activeChannel);

  // Preset quick responses for fast newsroom communication
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
            ? 'w-80 h-14' 
            : 'w-[92vw] sm:w-[380px] h-[520px] max-h-[85vh]'
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

            <div className="flex items-center gap-1 text-slate-300">
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
                    <p className="text-[11px] mt-1 text-slate-400">Comece a conversa com a equipe!</p>
                  </div>
                ) : (
                  channelMessages.map(msg => {
                    const isMe = msg.senderId === userData?.uid;
                    const isEditor = msg.senderRole === 'editor';
                    const isPauteiro = ['pauteiro', 'pauteira'].includes(msg.senderRole);
                    const isAdmin = msg.senderRole === 'admin';

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

                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed font-medium shadow-2xs ${
                            isMe
                              ? 'bg-ric-blue text-white rounded-br-xs'
                              : activeChannel === 'urgente'
                                ? 'bg-red-50 border border-red-200 text-red-950 rounded-bl-xs font-bold'
                                : 'bg-white border border-slate-200 text-slate-900 rounded-bl-xs'
                          }`}
                        >
                          {msg.text}
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

              {/* Input Form */}
              <div className="p-2.5 bg-white border-t border-slate-200 shrink-0 flex items-center gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Mensagem em #${activeChannel}...`}
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
