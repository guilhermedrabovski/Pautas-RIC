import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, getDocs, addDoc, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { 
  MessageSquare, 
  Plus, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Paperclip, 
  Trash2, 
  Clock, 
  Tv, 
  User,
  ExternalLink,
  ChevronDown,
  X,
  TrendingUp,
  Send,
  Bell,
  Check
} from 'lucide-react';
import { confirmAction } from '../lib/confirmHelper';

interface WhatsAppMessage {
  id: string;
  subject: string;
  description: string;
  pauteiraId: string;
  phone?: string;
  journal: 'BG' | 'Cidade Alerta';
  status: 'pendente' | 'resolvido' | 'pauta' | 'descartado';
  attachments: { name: string; url: string; type: string }[];
  createdAt: number;
  createdBy: string;
}

export default function WhatsAppMessages() {
  const { userData, users } = useAuth();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [journalFilter, setJournalFilter] = useState<'all' | 'BG' | 'Cidade Alerta'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | WhatsAppMessage['status']>('all');
  
  // Form State
  const [pauteiraId, setPauteiraId] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [journal, setJournal] = useState<'BG' | 'Cidade Alerta'>('BG');
  const [isUploading, setIsUploading] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; url: string; type: string }[]>([]);

  // WhatsApp turning into Pauta & Lembrete State
  const [conversionMsg, setConversionMsg] = useState<WhatsAppMessage | null>(null);
  const [pautaTitle, setPautaTitle] = useState('');
  const [pautaSlug, setPautaSlug] = useState('');
  const [pautaDescription, setPautaDescription] = useState('');
  const [pautaStatus, setPautaStatus] = useState('approved');
  const [pautaPriority, setPautaPriority] = useState('media');
  const [pautaJournal, setPautaJournal] = useState('BG');
  const [reminderUserId, setReminderUserId] = useState('');
  const [reminderText, setReminderText] = useState('');
  const [sendReminderCheckbox, setSendReminderCheckbox] = useState(false);

  const displayNames = getDisplayNames(users);

  useEffect(() => {
    const q = query(collection(db, 'whatsapp_messages'), orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppMessage)));
    }, err => console.warn('WhatsApp messages snapshot error:', err));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (userData) {
      setPauteiraId(userData.uid);
    }
  }, [userData]);

  const getUserName = (id: string) => {
    return displayNames[id] || users.find(u => u.uid === id)?.name || id;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    setIsUploading(true);
    const newAttachments = [...attachments];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} é muito grande. O limite é 20MB.`);
        continue;
      }

      const storageRef = ref(storage, `whatsapp_attachments/${Date.now()}_${file.name}`);
      
      try {
        const snapshot = await uploadBytes(storageRef, file);
        const url = await getDownloadURL(snapshot.ref);
        newAttachments.push({
          name: file.name,
          url: url,
          type: file.type
        });
      } catch (error: any) {
        toast.error(`Erro ao subir ${file.name}: ${error.message}`);
      }
    }

    setAttachments(newAttachments);
    setIsUploading(false);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !pauteiraId) return toast.error('Preencha os campos obrigatórios');

    try {
      await addDoc(collection(db, 'whatsapp_messages'), {
        subject,
        description,
        pauteiraId,
        phone: phone.replace(/\D/g, ''),
        journal,
        status: 'pendente',
        attachments,
        createdAt: Date.now(),
        createdBy: userData?.uid
      });
      toast.success('Mensagem registrada!');
      resetForm();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setSubject('');
    setDescription('');
    setPhone('');
    setAttachments([]);
    setIsFormOpen(false);
    if (userData) setPauteiraId(userData.uid);
  };

  const openConversionModal = (m: WhatsAppMessage) => {
    setConversionMsg(m);
    setPautaTitle(m.subject);
    
    // Generate a simple slug
    const cleanSlug = m.subject
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^A-Z0-9\s]/g, '')     // keep letters, numbers, spaces
      .trim()
      .split(/\s+/)
      .slice(0, 3)                     // take first 3 words
      .join(' ')
      .slice(0, 20);

    setPautaSlug(cleanSlug || 'WHATSAPP');
    
    let docsUrlText = '';
    if (m.attachments && m.attachments.length > 0) {
      docsUrlText = '\n\nAnexos:\n' + m.attachments.map(a => `- ${a.name}: ${a.url}`).join('\n');
    }

    setPautaDescription(
      `${m.description || ''}\n\n` +
      `[Origem: Filtro WhatsApp]\n` +
      `Contato: ${m.phone ? `https://wa.me/55${m.phone} (${m.phone})` : 'Nenhum'}\n` +
      `Canal Original: ${m.journal}` +
      docsUrlText
    );
    
    setPautaStatus('approved');
    setPautaPriority('media');
    setPautaJournal(m.journal || 'BG');
    setReminderUserId('');
    setReminderText(`Por favor, verifique a pauta aprovada vinda do WhatsApp: "${m.subject}"`);
    setSendReminderCheckbox(false);
  };

  const handleConversionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pautaTitle.trim() || !pautaSlug.trim() || !conversionMsg) {
      return toast.error('Preencha o título e a retranca.');
    }

    try {
      // 1. Add to agendas collection
      await addDoc(collection(db, 'agendas'), {
        title: pautaTitle.trim(),
        slug: pautaSlug.trim().toUpperCase(),
        description: pautaDescription.trim(),
        status: pautaStatus,
        priority: pautaPriority,
        continuing: false,
        date: format(new Date(), 'yyyy-MM-dd'),
        journal: pautaJournal,
        reporterId: '',
        cinegrafistaId: '',
        audienceSuccess: false,
        isMochilink: false,
        suggestedBy: userData?.uid || conversionMsg.createdBy || 'Sistema',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        fromWhatsAppId: conversionMsg.id
      });

      // 2. Add Lembrete if checked
      if (sendReminderCheckbox && reminderUserId) {
        await addDoc(collection(db, 'reminders'), {
          text: reminderText.trim(),
          fromId: userData?.uid || 'Sistema',
          toId: reminderUserId,
          read: false,
          createdAt: Date.now()
        });
      }

      // 3. Update status to pauta
      await updateDoc(doc(db, 'whatsapp_messages', conversionMsg.id), { status: 'pauta' });
      toast.success('Pauta gerada com sucesso e status atualizado!');
      setConversionMsg(null);
    } catch (error: any) {
      toast.error('Erro ao converter: ' + error.message);
    }
  };

  const updateStatus = async (id: string, status: WhatsAppMessage['status']) => {
    try {
      if (status === 'pauta') {
        const msg = messages.find(m => m.id === id);
        if (msg) {
          openConversionModal(msg);
          return;
        }
      }
      await updateDoc(doc(db, 'whatsapp_messages', id), { status });
      toast.success('Status atualizado');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    confirmAction('Deseja excluir este registro?', async () => {
      try {
        await deleteDoc(doc(db, 'whatsapp_messages', id));
        toast.success('Excluído com sucesso');
      } catch (error: any) {
        toast.error(error.message);
      }
    });
  };

  const filteredMessages = messages.filter(m => {
    const journalMatches = journalFilter === 'all' || m.journal === journalFilter;
    const statusMatches = statusFilter === 'all' || m.status === statusFilter;
    return journalMatches && statusMatches;
  });

  const getStatusBadge = (status: WhatsAppMessage['status']) => {
    switch (status) {
      case 'resolvido': return <span className="bg-ric-blue text-white px-2 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><CheckCircle2 size={12}/> Resolvido</span>;
      case 'pauta': return <span className="bg-ric-green text-white px-2 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><TrendingUp size={12}/> Virou Pauta</span>;
      case 'descartado': return <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><XCircle size={12}/> Descartado</span>;
      default: return <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1"><Clock size={12}/> Pendente</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Main Stats */}
      <div className="bg-white p-6 rounded-2xl border border-ric-border shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-black text-ric-text uppercase flex items-center gap-2">
            <MessageSquare className="text-ric-red" /> WhatsApp Sugestões
          </h2>
          <p className="text-xs text-ric-muted font-medium uppercase tracking-widest mt-1">Triagem de sugestões e mensagens recebidas para BG e Cidade Alerta</p>
        </div>
        
        <div className="flex gap-2">
           <button 
            onClick={() => setIsFormOpen(true)}
            className="bg-ric-red text-white px-5 py-3 rounded-xl text-sm font-black uppercase shadow-lg shadow-ric-red/20 hover:bg-red-700 transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={18} /> Nova Mensagem
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
        <Filter size={16} className="text-ric-muted mr-1" />
        
        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          {(['all', 'BG', 'Cidade Alerta'] as const).map(j => (
            <button
              key={j}
              onClick={() => setJournalFilter(j)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${journalFilter === j ? 'bg-ric-blue text-white' : 'text-ric-muted hover:bg-gray-50'}`}
            >
              {j === 'all' ? 'Todos Canais' : j}
            </button>
          ))}
        </div>

        <div className="flex bg-white rounded-lg p-1 border border-gray-200 shadow-sm">
          {(['all', 'pendente', 'resolvido', 'pauta'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-black uppercase transition-all ${statusFilter === s ? 'bg-ric-red text-white' : 'text-ric-muted hover:bg-gray-50'}`}
            >
              {s === 'all' ? 'Todos Status' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredMessages.length === 0 ? (
          <div className="col-span-full py-20 text-center">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="text-gray-400" size={32} />
            </div>
            <p className="text-ric-muted font-bold uppercase text-xs tracking-[2px]">Nenhuma mensagem encontrada para os filtros aplicados</p>
          </div>
        ) : (
          filteredMessages.map(m => {
            const cardStyles: Record<string, any> = {
              pauta: {
                bg: 'bg-green-50/80 border-green-200',
                divider: 'border-green-200/50',
                select: 'bg-green-100/50 border-green-300 text-green-800',
                hint: 'text-green-800/60',
                iconBg: 'bg-green-100/50'
              },
              resolvido: {
                bg: 'bg-blue-50/80 border-blue-200',
                divider: 'border-blue-200/50',
                select: 'bg-blue-100/50 border-blue-300 text-blue-800',
                hint: 'text-blue-800/60',
                iconBg: 'bg-blue-100/50'
              },
              pendente: {
                bg: 'bg-white border-gray-100',
                divider: 'border-gray-50',
                select: 'bg-gray-50 border-gray-200 text-ric-muted',
                hint: 'text-ric-muted',
                iconBg: 'bg-ric-bg'
              },
              descartado: {
                bg: 'bg-white border-gray-100',
                divider: 'border-gray-50',
                select: 'bg-gray-50 border-gray-200 text-ric-muted',
                hint: 'text-ric-muted',
                iconBg: 'bg-ric-bg'
              }
            };
            const style = cardStyles[m.status] || cardStyles.pendente;

            return (
            <div key={m.id} className={`rounded-2xl border shadow-sm overflow-hidden flex flex-col group transition-all hover:shadow-md ${style.bg}`}>
              {/* Card Header: Channel & Date */}
              <div className={`px-5 py-3 flex justify-between items-center ${m.journal === 'BG' ? 'bg-amber-500' : 'bg-red-600'} text-white`}>
                <div className="flex items-center gap-2">
                  <Tv size={14} />
                  <span className="text-[11px] font-black uppercase tracking-wider">{m.journal}</span>
                </div>
                <span className="text-[10px] font-bold opacity-80">{m.createdAt ? format(m.createdAt, 'dd/MM/yyyy HH:mm') : '-'}</span>
              </div>

              {/* Card Content */}
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-sm font-black text-ric-text uppercase leading-tight line-clamp-2">{m.subject}</h3>
                  <div className="ml-2 flex-shrink-0">
                    {getStatusBadge(m.status)}
                  </div>
                </div>

                <p className="text-xs text-ric-muted leading-relaxed line-clamp-3 mb-4">{m.description || "(Sem descrição)"}</p>

                {m.phone && (
                  <div className="mb-4">
                    <a 
                      href={`https://wa.me/55${m.phone}`} 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-2 p-2 bg-green-500 border border-green-600 rounded-xl text-[11px] font-black text-white hover:bg-green-600 transition-all uppercase shadow-sm"
                    >
                      <MessageSquare size={14} />
                      WhatsApp: {m.phone}
                      <ExternalLink size={12} className="ml-auto" />
                    </a>
                  </div>
                )}

                <div className={`flex items-center gap-3 mb-4 pt-4 border-t ${style.divider}`}>
                  <div className={`p-1.5 rounded-lg ${style.iconBg}`}>
                    <User size={14} className="text-ric-blue" />
                  </div>
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${style.hint}`}>Pauteira:</span>
                    <span className="text-[11px] font-black text-ric-text">{getUserName(m.pauteiraId)}</span>
                  </div>
                </div>

                {/* Attachments */}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-4">
                    <span className={`text-[9px] font-black uppercase block mb-1 ${style.hint}`}>Anexos ({m.attachments.length})</span>
                    <div className="flex flex-wrap gap-2">
                      {m.attachments.map((file, idx) => (
                        <a 
                          key={idx} 
                          href={file.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-2 py-1 bg-white/60 border border-black/10 rounded text-[10px] font-bold text-ric-blue hover:bg-white transition-all truncate max-w-[120px]"
                        >
                          <Paperclip size={10} />
                          {file.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className={`mt-auto pt-4 border-t flex flex-wrap gap-2 ${style.divider}`}>
                  <select 
                    value={m.status} 
                    onChange={(e) => {
                      if (e.target.value === 'remover') {
                        handleDelete(m.id);
                      } else {
                        updateStatus(m.id, e.target.value as any);
                      }
                    }}
                    className={`text-[11px] font-black uppercase rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ric-blue cursor-pointer ${style.select}`}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="resolvido">Resolvido</option>
                    <option value="pauta">Virou Pauta</option>
                    <option value="remover" className="text-red-700 bg-red-50">Recusar / Remover</option>
                  </select>

                  {m.status !== 'pauta' && (
                    <button 
                      onClick={() => openConversionModal(m)}
                      className="text-[10px] font-black uppercase text-white bg-ric-blue hover:bg-[#002244] px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-95 shadow-sm"
                      title="Clique para aprovar e converter em Pauta oficial no sistema"
                    >
                      <Plus size={12} /> Gerar Pauta
                    </button>
                  )}

                  <button 
                    onClick={() => handleDelete(m.id)}
                    className="ml-auto text-gray-400 hover:text-ric-red transition-all p-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )})
        )}
      </div>

      {/* Create Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300">
            <div className="bg-ric-blue text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">Novo Registro de WhatsApp</h3>
                  <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest">Preencha os detalhes para triagem</p>
                </div>
              </div>
              <button onClick={resetForm} className="p-2 hover:bg-white/10 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-ric-muted mb-2 uppercase tracking-widest">Pauteira(o)</label>
                  <select 
                    value={pauteiraId} 
                    onChange={e => setPauteiraId(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all"
                  >
                    {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-ric-muted mb-2 uppercase tracking-widest">Destino (Jornal)</label>
                  <select 
                    value={journal} 
                    onChange={e => setJournal(e.target.value as any)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all"
                  >
                    <option value="BG">BG (Balanço Geral)</option>
                    <option value="Cidade Alerta">Cidade Alerta</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-ric-muted mb-2 uppercase tracking-widest">Assunto da Mensagem</label>
                  <input 
                    type="text" 
                    value={subject} 
                    onChange={e => setSubject(e.target.value)} 
                    placeholder="Ex: Denúncia de buraco..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-ric-muted mb-2 uppercase tracking-widest">Telefone de quem mandou</label>
                  <input 
                    type="tel" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)} 
                    placeholder="(00) 00000-0000"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-[13px] font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-ric-muted mb-2 uppercase tracking-widest">Resumo / Detalhes</label>
                <textarea 
                  rows={4}
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="Descreva brevemente o conteúdo da mensagem..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-ric-muted mb-3 uppercase tracking-widest flex items-center justify-between">
                  Anexos (Opcional)
                  {isUploading && <span className="text-ric-blue animate-pulse lowercase font-bold">Subindo...</span>}
                </label>
                
                <div className="flex flex-wrap gap-2 mb-3">
                  {attachments.map((file, idx) => (
                    <div key={idx} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 flex items-center gap-2 group relative pr-8">
                      <FileText size={16} className="text-ric-muted" />
                      <span className="text-[11px] font-bold text-ric-text truncate max-w-[120px]">{file.name}</span>
                      <button 
                        type="button"
                        onClick={() => removeAttachment(idx)}
                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-ric-red"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  
                  <label className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-3 flex items-center justify-center text-ric-muted hover:border-ric-blue hover:text-ric-blue cursor-pointer transition-all flex-1 min-w-[120px]">
                    <Plus size={18} className="mr-2" />
                    <span className="text-[11px] font-black uppercase">Adicionar</span>
                    <input type="file" multiple onChange={handleFileUpload} className="hidden" disabled={isUploading} />
                  </label>
                </div>
                <p className="text-[9px] text-ric-muted italic">Vídeos, áudios ou capturas de tela importantes.</p>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={resetForm}
                  className="flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase text-ric-muted border border-gray-200 hover:bg-gray-50 transition-all font-bold"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] bg-ric-blue text-white px-4 py-3 rounded-xl text-xs font-black uppercase border border-ric-blue shadow-lg shadow-ric-blue/20 hover:bg-blue-800 transition-all active:scale-95"
                >
                  Salvar Registro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Conversion Modal: Convert WhatsApp message to Agenda and Option to create Reminder */}
      {conversionMsg && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto text-ric-text">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-50 rounded-xl text-green-700">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h2 className="text-md font-black text-ric-text uppercase tracking-wider">Aprovar e Gerar Pauta Oficial</h2>
                  <p className="text-[10px] text-ric-muted font-bold uppercase tracking-wider">Origem: {conversionMsg.journal} • WhatsApp</p>
                </div>
              </div>
              <button 
                onClick={() => setConversionMsg(null)}
                className="text-gray-400 hover:text-ric-red transition-all p-1"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConversionSubmit} className="space-y-4">
              {/* Row 1: Slug and Title */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-[11px] font-black uppercase text-ric-muted mb-1 tracking-wide text-left">Retranca (Slug) <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={pautaSlug} 
                    onChange={e => setPautaSlug(e.target.value.toUpperCase())}
                    placeholder="Ex: ACIDENTE BR"
                    className="block w-full rounded-xl border border-gray-200 p-2.5 bg-gray-50/55 focus:bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-ric-blue transition-all"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-black uppercase text-ric-muted mb-1 tracking-wide text-left">Título da Pauta <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    value={pautaTitle} 
                    onChange={e => setPautaTitle(e.target.value)}
                    placeholder="Título resumido da pauta..."
                    className="block w-full rounded-xl border border-gray-200 p-2.5 bg-gray-50/55 focus:bg-white text-xs outline-none focus:ring-2 focus:ring-ric-blue transition-all"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Status, Priority and Journal */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-black uppercase text-ric-muted mb-1 tracking-wide text-left">Status da Pauta</label>
                  <select 
                    value={pautaStatus} 
                    onChange={e => setPautaStatus(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 p-2.5 bg-gray-50 focus:bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-ric-blue transition-all cursor-pointer"
                  >
                    <option value="pending">💡 Sugestão Pendente</option>
                    <option value="approved">✅ Aprovada (Área Geral)</option>
                    <option value="in_progress">⚙️ Em Andamento (Ficou Fixa)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase text-ric-muted mb-1 tracking-wide text-left">Prioridade</label>
                  <select 
                    value={pautaPriority} 
                    onChange={e => setPautaPriority(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 p-2.5 bg-gray-50 focus:bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-ric-blue transition-all cursor-pointer"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media font-bold text-amber-600">Média</option>
                    <option value="alta font-bold text-red-600">Alta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase text-ric-muted mb-1 tracking-wide text-left">Jornal de Destino</label>
                  <select 
                    value={pautaJournal} 
                    onChange={e => setPautaJournal(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 p-2.5 bg-gray-50 focus:bg-white text-xs font-bold outline-none focus:ring-2 focus:ring-ric-blue transition-all cursor-pointer"
                  >
                    <option value="BG">Balanço Geral (BG)</option>
                    <option value="Cidade Alerta">Cidade Alerta (CA)</option>
                    <option value="Ambos">Ambos / Geral</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-black uppercase text-ric-muted mb-1 tracking-wide text-left">Descrição e Detalhes da Pauta</label>
                <textarea 
                  rows={4}
                  value={pautaDescription} 
                  onChange={e => setPautaDescription(e.target.value)}
                  placeholder="Informações adicionais obtidas no WhatsApp..."
                  className="block w-full rounded-xl border border-gray-200 p-2.5 bg-gray-50/55 focus:bg-white text-xs outline-none focus:ring-2 focus:ring-ric-blue transition-all"
                />
              </div>

              {/* Separator / Divider */}
              <div className="border-t border-gray-100 my-4 pt-4"></div>

              {/* Reminder Section */}
              <div className="bg-blue-50/40 rounded-2xl p-4 border border-blue-100/50">
                <label className="flex items-center space-x-2.5 cursor-pointer mb-2">
                  <input 
                    type="checkbox" 
                    checked={sendReminderCheckbox} 
                    onChange={e => setSendReminderCheckbox(e.target.checked)}
                    className="rounded text-ric-blue border-gray-300 focus:ring-ric-blue bg-white w-4 h-4 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 label text-left">
                    <Bell className="text-ric-blue" size={16} />
                    <span className="text-xs font-black uppercase text-ric-blue">Criar Lembrete / Notificação no Painel</span>
                  </div>
                </label>
                <p className="text-[10px] text-gray-500 font-medium ml-6 mb-3 text-left">Se ativado, envia um alerta no painel de lembretes para o repórter ou produtor encarregado.</p>

                {sendReminderCheckbox && (
                  <div className="space-y-3 ml-6 transition-all duration-300">
                    <div className="text-left">
                      <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">Responsável a ser alertado</label>
                      <select 
                        value={reminderUserId} 
                        onChange={e => {
                          setReminderUserId(e.target.value);
                          // Pre-fill text nicely if user is selected
                          const u = users.find(usr => usr.uid === e.target.value);
                          if (u) {
                            setReminderText(`Olá ${u.name}! Nova pauta aprovada: "${pautaTitle}" [Vinda do WhatsApp]`);
                          }
                        }}
                        className="block w-full rounded-xl border border-gray-200 p-2 bg-white text-xs outline-none focus:ring-2 focus:ring-ric-blue transition-all cursor-pointer"
                      >
                        <option value="">Selecione um usuário para receber...</option>
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>{displayNames[u.uid] || u.name} ({u.role})</option>
                        ))}
                      </select>
                    </div>

                    <div className="text-left">
                      <label className="block text-[10px] font-bold uppercase text-gray-600 mb-1">Mensagem do Lembrete</label>
                      <textarea 
                        rows={2}
                        value={reminderText} 
                        onChange={e => setReminderText(e.target.value)}
                        placeholder="Mensagem do lembrete..."
                        className="block w-full rounded-xl border border-gray-200 p-2 bg-white text-xs outline-none focus:ring-2 focus:ring-ric-blue transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Form Buttons */}
              <div className="pt-4 flex gap-3">
                <button 
                  type="button" 
                  onClick={() => setConversionMsg(null)}
                  className="flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase text-gray-500 border border-gray-200 hover:bg-gray-50 transition-all font-bold"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-[2] bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl text-xs font-black uppercase shadow-lg shadow-green-600/10 transition-all active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <Check size={16} /> Salvar como Pauta Aprovada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
