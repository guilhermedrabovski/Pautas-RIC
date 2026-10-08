import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  orderBy, 
  limit 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { 
  MessageSquare, 
  Plus, 
  Search, 
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
  X,
  TrendingUp,
  Send,
  Bell,
  Check,
  Phone,
  LayoutGrid,
  Columns3,
  Calendar,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Copy,
  Pencil,
  Lock
} from 'lucide-react';
import { confirmAction } from '../lib/confirmHelper';

export interface AttachmentItem {
  name: string;
  url: string;
  type: string;
  size?: number;
  dataUrl?: string;
}

interface WhatsAppMessage {
  id: string;
  subject: string;
  description: string;
  pauteiraId: string;
  phone?: string;
  journal: 'BG' | 'Cidade Alerta';
  status: 'pendente' | 'resolvido' | 'pauta' | 'descartado';
  attachments: AttachmentItem[];
  createdAt: number;
  createdBy: string;
}

export default function WhatsAppMessages() {
  const { userData, users } = useAuth();
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [viewMode, setViewMode] = useState<'funnel' | 'grid'>('funnel');
  const [journalFilter, setJournalFilter] = useState<'all' | 'BG' | 'Cidade Alerta'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showDidacticHelp, setShowDidacticHelp] = useState(false);
  
  // Quick preview message
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppMessage | null>(null);

  // Form State for New WhatsApp Message
  const [pauteiraId, setPauteiraId] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [journal, setJournal] = useState<'BG' | 'Cidade Alerta'>('BG');
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);

  // State for Editing WhatsApp Message (Only Creator)
  const [editingMessage, setEditingMessage] = useState<WhatsAppMessage | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editJournal, setEditJournal] = useState<'BG' | 'Cidade Alerta'>('BG');
  const [editPauteiraId, setEditPauteiraId] = useState('');
  const [editStatus, setEditStatus] = useState<WhatsAppMessage['status']>('pendente');
  const [editAttachments, setEditAttachments] = useState<AttachmentItem[]>([]);
  const [isEditUploading, setIsEditUploading] = useState(false);
  const [isEditDraggingOver, setIsEditDraggingOver] = useState(false);

  // WhatsApp Turning into Pauta & Lembrete State
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

  // Realtime subscription with error handling
  useEffect(() => {
    const q = query(collection(db, 'whatsapp_messages'), orderBy('createdAt', 'desc'), limit(150));
    const unsub = onSnapshot(
      q, 
      snap => {
        setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as WhatsAppMessage)));
      }, 
      err => console.warn('WhatsApp messages snapshot error:', err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (userData && !pauteiraId) {
      setPauteiraId(userData.uid);
    }
  }, [userData]);

  const getUserName = (id: string) => {
    return displayNames[id] || users.find(u => u.uid === id)?.name || id || 'Não definido';
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  // Verification: ONLY the creator can edit this WhatsApp message
  const isAuthorOf = (msg: WhatsAppMessage | null | undefined): boolean => {
    if (!msg || !userData) return false;
    const currentUid = userData.uid;
    const currentEmail = (userData.email || '').toLowerCase().trim();
    const currentName = (userData.name || '').toLowerCase().trim();

    // 1. Direct UID match with createdBy
    if (msg.createdBy && msg.createdBy === currentUid) return true;

    // 2. Direct UID match with pauteiraId
    if (msg.pauteiraId && msg.pauteiraId === currentUid) return true;

    // 3. Match against creator in users collection
    const creatorUser = users.find(u => u.uid === msg.createdBy || u.uid === msg.pauteiraId);
    if (creatorUser) {
      if (creatorUser.uid === currentUid) return true;
      if (creatorUser.email && creatorUser.email.toLowerCase() === currentEmail) return true;
      if (creatorUser.name && creatorUser.name.toLowerCase() === currentName) return true;
    }

    // 4. Match against email or username strings (legacy)
    if (msg.createdBy) {
      const cleanCreated = msg.createdBy.toLowerCase().trim();
      if (cleanCreated === currentEmail || cleanCreated === currentName) return true;
    }

    return false;
  };

  const uploadFiles = async (
    fileList: FileList | File[],
    currentAttachments: AttachmentItem[],
    setTargetAttachments: React.Dispatch<React.SetStateAction<AttachmentItem[]>>,
    setTargetUploading: React.Dispatch<React.SetStateAction<boolean>>
  ) => {
    const files = Array.from(fileList);
    if (!files || files.length === 0) return;

    const MAX_FILE_SIZE = 35 * 1024 * 1024; // 35MB
    setTargetUploading(true);
    const newAttachments = [...currentAttachments];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`Arquivo "${file.name}" excede o limite de 35MB`);
        continue;
      }

      const fileTypeCategory = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'doc';

      try {
        const base64Data = await readFileAsBase64(file);

        // Upload to server endpoint
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: file.name,
            type: file.type || 'application/octet-stream',
            data: base64Data,
          }),
        });

        if (!res.ok) {
          const errRes = await res.json().catch(() => ({}));
          throw new Error(errRes.error || `Erro HTTP ${res.status}`);
        }

        const data = await res.json();
        const fileUrl = data.url || base64Data;
        const isSmallImage = fileTypeCategory === 'image' && file.size <= 500 * 1024;

        newAttachments.push({
          name: file.name,
          url: fileUrl,
          type: fileTypeCategory,
          size: file.size,
          ...(isSmallImage ? { dataUrl: base64Data } : {}),
        });

        toast.success(`"${file.name}" adicionado com sucesso!`);
      } catch (err: any) {
        console.warn('Falha no upload via servidor, testando fallback local:', err);
        // Fallback for smaller files < 700KB: store inline dataUrl in Firestore
        if (file.size < 700 * 1024) {
          try {
            const base64Data = await readFileAsBase64(file);
            newAttachments.push({
              name: file.name,
              url: base64Data,
              type: fileTypeCategory,
              size: file.size,
              dataUrl: base64Data,
            });
            toast.success(`"${file.name}" anexado localmente!`);
            continue;
          } catch (innerErr) {
            // ignore
          }
        }
        toast.error(`Falha ao subir ${file.name}: ` + (err.message || 'Erro ao processar arquivo'));
      }
    }

    setTargetAttachments(newAttachments);
    setTargetUploading(false);
  };

  const processFiles = async (fileList: FileList | File[]) => {
    await uploadFiles(fileList, attachments, setAttachments, setIsUploading);
  };

  const processEditFiles = async (fileList: FileList | File[]) => {
    await uploadFiles(fileList, editAttachments, setEditAttachments, setIsEditUploading);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  const resetForm = () => {
    setSubject('');
    setDescription('');
    setPhone('');
    setJournal('BG');
    setAttachments([]);
    setIsFormOpen(false);
  };

  const openEditModal = (msg: WhatsAppMessage) => {
    if (!isAuthorOf(msg)) {
      const authorName = getUserName(msg.createdBy || msg.pauteiraId);
      toast.error(`Apenas o criador desta mensagem (${authorName}) pode editá-la!`, {
        icon: '🔒'
      });
      return;
    }
    setEditingMessage(msg);
    setEditSubject(msg.subject || '');
    setEditDescription(msg.description || '');
    setEditPhone(msg.phone || '');
    setEditJournal(msg.journal || 'BG');
    setEditPauteiraId(msg.pauteiraId || userData?.uid || '');
    setEditStatus(msg.status || 'pendente');
    setEditAttachments(msg.attachments ? [...msg.attachments] : []);
  };

  const closeEditModal = () => {
    setEditingMessage(null);
    setEditSubject('');
    setEditDescription('');
    setEditPhone('');
    setEditJournal('BG');
    setEditPauteiraId('');
    setEditAttachments([]);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMessage) return;

    if (!isAuthorOf(editingMessage)) {
      toast.error('Apenas o usuário que criou esta mensagem tem permissão para editá-la!', {
        icon: '🔒'
      });
      return;
    }

    if (!editSubject.trim()) {
      return toast.error('Informe o assunto da mensagem');
    }

    try {
      const cleanPhone = editPhone.trim().replace(/\D/g, '');
      await updateDoc(doc(db, 'whatsapp_messages', editingMessage.id), {
        subject: editSubject.trim(),
        description: editDescription.trim(),
        phone: cleanPhone,
        journal: editJournal,
        pauteiraId: editPauteiraId || editingMessage.pauteiraId || userData?.uid || '',
        status: editStatus,
        attachments: editAttachments,
        updatedAt: Date.now(),
        updatedBy: userData?.uid || ''
      });

      toast.success('Mensagem de WhatsApp atualizada com sucesso!');

      if (selectedMessage?.id === editingMessage.id) {
        setSelectedMessage(prev => prev ? {
          ...prev,
          subject: editSubject.trim(),
          description: editDescription.trim(),
          phone: cleanPhone,
          journal: editJournal,
          pauteiraId: editPauteiraId || editingMessage.pauteiraId || userData?.uid || '',
          status: editStatus,
          attachments: editAttachments
        } : null);
      }

      closeEditModal();
    } catch (err: any) {
      toast.error('Erro ao salvar alterações: ' + (err.message || 'Falha ao atualizar'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return toast.error('Informe o assunto da mensagem');
    try {
      await addDoc(collection(db, 'whatsapp_messages'), {
        subject: subject.trim(),
        description: description.trim(),
        pauteiraId: pauteiraId || userData?.uid || '',
        phone: phone.trim().replace(/\D/g, ''),
        journal,
        status: 'pendente',
        attachments,
        createdAt: Date.now(),
        createdBy: userData?.uid || 'anon'
      });
      toast.success('Mensagem registrada na triagem com sucesso!');
      resetForm();
    } catch (err: any) {
      toast.error('Erro ao salvar mensagem: ' + err.message);
    }
  };

  const openConversionModal = (m: WhatsAppMessage) => {
    setConversionMsg(m);
    setPautaTitle(m.subject);

    // Auto-generate clean 3-word slug in uppercase
    const cleanSlug = m.subject
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join(' ')
      .slice(0, 24);

    setPautaSlug(cleanSlug || 'WHATSAPP');

    let docsUrlText = '';
    if (m.attachments && m.attachments.length > 0) {
      docsUrlText = '\n\n📎 Anexos enviados:\n' + m.attachments.map(a => `- ${a.name}: ${a.url}`).join('\n');
    }

    setPautaDescription(
      `${m.description || ''}\n\n` +
      `[Origem: Triagem WhatsApp Grupo RIC]\n` +
      `Contato do Telespectador: ${m.phone ? `https://wa.me/55${m.phone} (${m.phone})` : 'Não informado'}\n` +
      `Canal Original: ${m.journal}` +
      docsUrlText
    );

    setPautaStatus('approved');
    setPautaPriority('media');
    setPautaJournal(m.journal || 'BG');
    setReminderUserId('');
    setReminderText(`Nova pauta aprovada originada do WhatsApp: "${m.subject}"`);
    setSendReminderCheckbox(false);
  };

  const handleConversionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pautaTitle.trim() || !pautaSlug.trim() || !conversionMsg) {
      return toast.error('Preencha o título e a retranca.');
    }

    try {
      // 1. Add to agendas collection (Official Pautas)
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

      // 3. Update status in whatsapp_messages to 'pauta'
      await updateDoc(doc(db, 'whatsapp_messages', conversionMsg.id), { status: 'pauta' });
      toast.success('Pauta gerada e cadastrada no sistema!');
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
      toast.success(`Status alterado para: ${status.toUpperCase()}`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id: string) => {
    confirmAction('Deseja excluir este registro do WhatsApp?', async () => {
      try {
        await deleteDoc(doc(db, 'whatsapp_messages', id));
        if (selectedMessage?.id === id) setSelectedMessage(null);
        toast.success('Mensagem excluída!');
      } catch (error: any) {
        toast.error(error.message);
      }
    });
  };

  // Filter messages
  const filteredMessages = messages.filter(m => {
    const journalMatches = journalFilter === 'all' || m.journal === journalFilter;
    const searchMatches = !searchTerm.trim() || 
      m.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.phone || '').includes(searchTerm);
    return journalMatches && searchMatches;
  });

  const pendentesList = filteredMessages.filter(m => m.status === 'pendente');
  const pautasList = filteredMessages.filter(m => m.status === 'pauta');
  const resolvidosList = filteredMessages.filter(m => m.status === 'resolvido');
  const descartadosList = filteredMessages.filter(m => m.status === 'descartado');

  const copyPhone = (phoneNum?: string) => {
    if (!phoneNum) return;
    navigator.clipboard.writeText(phoneNum);
    toast.success(`Telefone ${phoneNum} copiado!`);
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Top Banner / Didactic Header */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 pointer-events-none transform skew-x-12" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-emerald-300 border border-white/20">
                <MessageSquare size={22} />
              </div>
              <div>
                <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                  Triagem Inteligente de WhatsApp
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded-full font-bold">
                    Didático & Prático
                  </span>
                </h1>
                <p className="text-xs text-white/80 font-medium">
                  Central de recepção, validação jornalística e conversão direta em Pautas do Balanço Geral e Cidade Alerta.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={() => setShowDidacticHelp(!showDidacticHelp)}
              className="py-2.5 px-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
            >
              <HelpCircle size={15} />
              {showDidacticHelp ? 'Ocultar Guia' : 'Como Funciona?'}
            </button>
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="flex-1 md:flex-initial py-2.5 px-4 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-xs uppercase rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
            >
              <Plus size={16} strokeWidth={3} />
              Nova Mensagem
            </button>
          </div>
        </div>

        {/* Didactic Step-by-Step Box (Toggleable) */}
        {showDidacticHelp && (
          <div className="mt-5 pt-4 border-t border-white/15 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs animate-in fade-in duration-200">
            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 space-y-1">
              <span className="text-[10px] font-black uppercase text-amber-300 tracking-wider flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black flex items-center justify-center">1</span>
                Recepção & Triagem
              </span>
              <p className="text-[11px] text-white/90 font-medium leading-relaxed">
                Mensagens novas chegam em <strong>Pendente</strong>. A pauteira analisa foto, vídeo ou denúncia enviada pelo público.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-300 tracking-wider flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black flex items-center justify-center">2</span>
                Virou Pauta Oficial
              </span>
              <p className="text-[11px] text-white/90 font-medium leading-relaxed">
                Clique em <strong>"Gerar Pauta"</strong>. O sistema cria a pauta com retranca e link direto para o repórter no plantão.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 space-y-1">
              <span className="text-[10px] font-black uppercase text-blue-300 tracking-wider flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-blue-400 text-slate-950 text-[10px] font-black flex items-center justify-center">3</span>
                Resolvido / Apoio
              </span>
              <p className="text-[11px] text-white/90 font-medium leading-relaxed">
                Informações pontuais checadas com a produção ou assessoria que não necessitam de equipe de rua.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/15 space-y-1">
              <span className="text-[10px] font-black uppercase text-rose-300 tracking-wider flex items-center gap-1">
                <span className="w-4 h-4 rounded-full bg-rose-400 text-slate-950 text-[10px] font-black flex items-center justify-center">4</span>
                Descartado
              </span>
              <p className="text-[11px] text-white/90 font-medium leading-relaxed">
                Mensagens repetidas, spam, ou conteúdo fora do escopo editorial da RICtv Record.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar: Filters, Channel selector & View Toggle */}
      <div className="bg-white p-4 rounded-2xl border border-ric-border shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por assunto, resumo ou telefone..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none transition-all"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')} 
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Channel Filter (BG, Cidade Alerta, Todos) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          {(['all', 'BG', 'Cidade Alerta'] as const).map(j => (
            <button
              key={j}
              type="button"
              onClick={() => setJournalFilter(j)}
              className={`px-3 py-2 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                journalFilter === j 
                  ? j === 'BG' ? 'bg-amber-500 text-white shadow-xs' : j === 'Cidade Alerta' ? 'bg-red-600 text-white shadow-xs' : 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              {j === 'all' ? 'Todos os Jornais' : j === 'BG' ? 'Balanço Geral' : 'Cidade Alerta'}
            </button>
          ))}
        </div>

        {/* View Mode Toggle: Funnel vs Grid */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-end md:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('funnel')}
            className={`px-3 py-2 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'funnel' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Visualização em colunas didáticas (Kanban)"
          >
            <Columns3 size={15} />
            Colunas (Funil)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-3 py-2 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'grid' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Visualização em grade compacta"
          >
            <LayoutGrid size={15} />
            Grade
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-amber-800 tracking-wider block">
              1. Na Fila de Triagem
            </span>
            <span className="text-2xl font-black text-amber-900">
              {pendentesList.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
            <Clock size={20} />
          </div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-emerald-800 tracking-wider block">
              2. Viraram Pauta
            </span>
            <span className="text-2xl font-black text-emerald-900">
              {pautasList.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-blue-800 tracking-wider block">
              3. Resolvidos
            </span>
            <span className="text-2xl font-black text-blue-900">
              {resolvidosList.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-xs">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider block">
              4. Descartados
            </span>
            <span className="text-2xl font-black text-slate-800">
              {descartadosList.length}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-400 text-white flex items-center justify-center font-bold shadow-xs">
            <XCircle size={20} />
          </div>
        </div>
      </div>

      {/* Main View: Funnel (Didactic Kanban) or Grid */}
      {viewMode === 'funnel' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {/* Column 1: Pendentes */}
          <MessageColumn
            title="1. Pendente / Triagem"
            description="Novas mensagens aguardando decisão"
            badgeColor="bg-amber-500 text-white"
            count={pendentesList.length}
            messages={pendentesList}
            emptyMessage="Nenhuma mensagem na fila de triagem."
            onConvert={openConversionModal}
            onUpdateStatus={updateStatus}
            onDelete={handleDelete}
            onEdit={openEditModal}
            onSelect={setSelectedMessage}
            onCopyPhone={copyPhone}
            getUserName={getUserName}
            isAuthorOf={isAuthorOf}
          />

          {/* Column 2: Virou Pauta */}
          <MessageColumn
            title="2. Virou Pauta"
            description="Aprovadas e cadastradas no sistema"
            badgeColor="bg-emerald-600 text-white"
            count={pautasList.length}
            messages={pautasList}
            emptyMessage="Nenhuma pauta aprovada ainda."
            onConvert={openConversionModal}
            onUpdateStatus={updateStatus}
            onDelete={handleDelete}
            onEdit={openEditModal}
            onSelect={setSelectedMessage}
            onCopyPhone={copyPhone}
            getUserName={getUserName}
            isAuthorOf={isAuthorOf}
          />

          {/* Column 3: Resolvidos */}
          <MessageColumn
            title="3. Resolvidos"
            description="Informações checadas e respondidas"
            badgeColor="bg-blue-600 text-white"
            count={resolvidosList.length}
            messages={resolvidosList}
            emptyMessage="Nenhuma mensagem resolvida."
            onConvert={openConversionModal}
            onUpdateStatus={updateStatus}
            onDelete={handleDelete}
            onEdit={openEditModal}
            onSelect={setSelectedMessage}
            onCopyPhone={copyPhone}
            getUserName={getUserName}
            isAuthorOf={isAuthorOf}
          />

          {/* Column 4: Descartados */}
          <MessageColumn
            title="4. Descartados"
            description="Fora do perfil ou repetidos"
            badgeColor="bg-slate-500 text-white"
            count={descartadosList.length}
            messages={descartadosList}
            emptyMessage="Nenhum descarte."
            onConvert={openConversionModal}
            onUpdateStatus={updateStatus}
            onDelete={handleDelete}
            onEdit={openEditModal}
            onSelect={setSelectedMessage}
            onCopyPhone={copyPhone}
            getUserName={getUserName}
            isAuthorOf={isAuthorOf}
          />
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMessages.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
              <MessageSquare size={36} className="text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-black uppercase text-slate-500 tracking-wider">
                Nenhuma mensagem encontrada para os filtros
              </p>
            </div>
          ) : (
            filteredMessages.map(m => (
              <MessageCard
                key={m.id}
                msg={m}
                onConvert={openConversionModal}
                onUpdateStatus={updateStatus}
                onDelete={handleDelete}
                onEdit={openEditModal}
                onSelect={setSelectedMessage}
                onCopyPhone={copyPhone}
                getUserName={getUserName}
                isAuthorOf={isAuthorOf}
              />
            ))
          )}
        </div>
      )}

      {/* Modal: New WhatsApp Message */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-emerald-700 text-white p-4.5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">Nova Mensagem de WhatsApp</h3>
                  <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider">Cadastro direto para triagem rápida</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={resetForm} 
                className="p-1.5 hover:bg-white/20 rounded-lg transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Jornal Sugerido <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={journal}
                    onChange={e => setJournal(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  >
                    <option value="BG">Balanço Geral (BG)</option>
                    <option value="Cidade Alerta">Cidade Alerta (CA)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Pauteira Responsável
                  </label>
                  <select
                    value={pauteiraId}
                    onChange={e => setPauteiraId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  >
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {getUserName(u.uid)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                  Assunto Principal / Retranca <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Ex: Acidente com vítimas na BR-277 / Buraco perigoso na CIC..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                  Telefone de Contato (WhatsApp)
                </label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Ex: (41) 99999-9999"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                  Descrição / Conteúdo da Mensagem
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Cole aqui o texto da mensagem recebida no WhatsApp, detalhes de local, horário..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none leading-relaxed"
                />
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-2 uppercase tracking-wider flex items-center justify-between">
                  <span>Anexos / Mídias Enviadas ({attachments.length})</span>
                  {isUploading && (
                    <span className="text-emerald-700 font-bold animate-pulse text-[10px] flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                      Subindo arquivo para o servidor...
                    </span>
                  )}
                </label>

                {/* Dropzone area */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);
                    if (e.dataTransfer.files) {
                      await processFiles(e.dataTransfer.files);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-3 transition-all ${
                    isDraggingOver
                      ? 'border-emerald-500 bg-emerald-50/70 scale-[1.01]'
                      : 'border-slate-200 hover:border-emerald-500/60 bg-slate-50/60'
                  }`}
                >
                  {/* File previews */}
                  {attachments.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {att.type === 'image' ? (
                              <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                <img
                                  src={att.dataUrl || att.url}
                                  alt={att.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-500">
                                <Paperclip size={14} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 text-[11px] truncate leading-tight">
                                {att.name}
                              </p>
                              {att.size && (
                                <span className="text-[10px] text-slate-400">
                                  {(att.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(idx)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                            title="Remover anexo"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex flex-col items-center justify-center py-3 px-2 cursor-pointer group">
                    <div className="flex items-center gap-2 text-slate-600 group-hover:text-emerald-700 font-bold text-xs">
                      <Plus size={16} className="text-emerald-600 group-hover:scale-110 transition-transform" />
                      <span>Arraste ou clique para selecionar fotos, vídeos ou documentos</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Suporta imagens, vídeos, áudios, PDFs e planilhas (até 35MB por arquivo)
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2.5 px-3 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-[2] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check size={14} strokeWidth={3} />
                  Salvar na Triagem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Mensagem de WhatsApp (Apenas Criador) */}
      {editingMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-amber-600 text-white p-4.5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
                  <Pencil size={18} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">Editar Mensagem de WhatsApp</h3>
                  <p className="text-[10px] text-white/90 font-bold uppercase tracking-wider">
                    Autor: {getUserName(editingMessage.createdBy || editingMessage.pauteiraId)} (Você)
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={closeEditModal} 
                className="p-1.5 hover:bg-white/20 rounded-lg transition-all cursor-pointer"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Jornal Sugerido <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editJournal}
                    onChange={e => setEditJournal(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none cursor-pointer"
                  >
                    <option value="BG">Balanço Geral (BG)</option>
                    <option value="Cidade Alerta">Cidade Alerta (CA)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Pauteira Responsável
                  </label>
                  <select
                    value={editPauteiraId}
                    onChange={e => setEditPauteiraId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none cursor-pointer"
                  >
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {getUserName(u.uid)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Telefone de Contato (WhatsApp)
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={editPhone}
                      onChange={e => setEditPhone(e.target.value)}
                      placeholder="(41) 99999-9999"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Status da Mensagem
                  </label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none cursor-pointer"
                  >
                    <option value="pendente">Pendente / Triagem</option>
                    <option value="pauta">Virou Pauta Oficial</option>
                    <option value="resolvido">Resolvido</option>
                    <option value="descartado">Descartado</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                  Assunto Principal / Retranca <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={e => setEditSubject(e.target.value)}
                  placeholder="Ex: Acidente na BR-277..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                  Detalhes / Texto da Mensagem
                </label>
                <textarea
                  rows={4}
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  placeholder="Texto completo enviado pelo telespectador, contexto, endereço, etc."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
                />
              </div>

              {/* Attachments Section */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">
                    Anexos e Mídias ({editAttachments.length})
                  </label>
                  {isEditUploading && (
                    <span className="text-[10px] font-bold text-amber-700 animate-pulse flex items-center gap-1">
                      <RefreshCw size={11} className="animate-spin" /> Processando upload...
                    </span>
                  )}
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsEditDraggingOver(true);
                  }}
                  onDragLeave={() => setIsEditDraggingOver(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsEditDraggingOver(false);
                    if (e.dataTransfer.files) {
                      await processEditFiles(e.dataTransfer.files);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-3 transition-colors ${
                    isEditDraggingOver
                      ? 'border-amber-500 bg-amber-50/60'
                      : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                  }`}
                >
                  {editAttachments.length > 0 && (
                    <div className="space-y-1.5 mb-2.5 max-h-36 overflow-y-auto">
                      {editAttachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-2 text-xs shadow-2xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {att.type === 'image' ? (
                              <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                <img
                                  src={att.dataUrl || att.url}
                                  alt={att.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-500">
                                <Paperclip size={14} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 text-[11px] truncate leading-tight">
                                {att.name}
                              </p>
                              {att.size && (
                                <span className="text-[10px] text-slate-400">
                                  {(att.size / 1024 / 1024).toFixed(2)} MB
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditAttachments(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-600 p-1 rounded-md hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                            title="Remover anexo"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <label className="flex flex-col items-center justify-center py-2.5 px-2 cursor-pointer group">
                    <div className="flex items-center gap-2 text-slate-600 group-hover:text-amber-700 font-bold text-xs">
                      <Plus size={16} className="text-amber-600 group-hover:scale-110 transition-transform" />
                      <span>Arraste ou clique para adicionar mais arquivos</span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5">
                      Fotos, vídeos, áudios, PDFs e planilhas (até 35MB)
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={async (e) => {
                        if (e.target.files) {
                          await processEditFiles(e.target.files);
                          e.target.value = '';
                        }
                      }}
                      className="hidden"
                      disabled={isEditUploading}
                    />
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 py-2.5 px-3 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isEditUploading}
                  className="flex-[2] py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check size={14} strokeWidth={3} />
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Converter Mensagem em Pauta Oficial */}
      {conversionMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white p-4.5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">Converter em Pauta Oficial</h3>
                  <p className="text-[10px] text-white/80 font-bold uppercase tracking-wider">
                    Origem: WhatsApp • {conversionMsg.journal}
                  </p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setConversionMsg(null)} 
                className="p-1.5 hover:bg-white/20 rounded-lg transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConversionSubmit} className="p-5 space-y-4 overflow-y-auto">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 space-y-1">
                <div className="font-black uppercase text-[10px] text-emerald-800 flex items-center gap-1">
                  <Sparkles size={12} /> Transformação Automática
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Esta mensagem sairá da triagem do WhatsApp e será enviada diretamente para a lista oficial de <strong>Pautas</strong> da equipe de reportagem.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Retranca (Slug) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={pautaSlug}
                    onChange={e => setPautaSlug(e.target.value.toUpperCase())}
                    placeholder="EX: ACIDENTE BR"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-black uppercase tracking-wide focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Título Completo da Pauta <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={pautaTitle}
                    onChange={e => setPautaTitle(e.target.value)}
                    placeholder="Ex: Grave colisão entre caminhão e carro interdita BR-277..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Jornal
                  </label>
                  <select
                    value={pautaJournal}
                    onChange={e => setPautaJournal(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  >
                    <option value="BG">Balanço Geral</option>
                    <option value="Cidade Alerta">Cidade Alerta</option>
                    <option value="Ambos">Ambos / Geral</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Prioridade
                  </label>
                  <select
                    value={pautaPriority}
                    onChange={e => setPautaPriority(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta (Urgente)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                    Status Inicial
                  </label>
                  <select
                    value={pautaStatus}
                    onChange={e => setPautaStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  >
                    <option value="approved">Aprovada</option>
                    <option value="pending">Sugestão Pendente</option>
                    <option value="in_progress">Em Andamento</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-600 mb-1 uppercase tracking-wider">
                  Orientações para a Equipe de Rua
                </label>
                <textarea
                  rows={4}
                  value={pautaDescription}
                  onChange={e => setPautaDescription(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none leading-relaxed"
                />
              </div>

              {/* Lembrete opcional */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendReminderCheckbox}
                    onChange={e => setSendReminderCheckbox(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span className="text-xs font-black uppercase text-slate-800 flex items-center gap-1.5">
                    <Bell size={13} className="text-emerald-600" />
                    Enviar Lembrete / Notificação para Alguém
                  </span>
                </label>

                {sendReminderCheckbox && (
                  <div className="pt-2 space-y-2 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase">
                        Destinatário do Alerta
                      </label>
                      <select
                        value={reminderUserId}
                        onChange={e => {
                          setReminderUserId(e.target.value);
                          const u = users.find(usr => usr.uid === e.target.value);
                          if (u) {
                            setReminderText(`Olá ${u.name}! Nova pauta cadastrada do WhatsApp: "${pautaTitle}"`);
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-bold focus:ring-2 focus:ring-emerald-600 outline-none"
                      >
                        <option value="">Selecione quem receberá o lembrete...</option>
                        {users.map(u => (
                          <option key={u.uid} value={u.uid}>
                            {getUserName(u.uid)} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1 uppercase">
                        Mensagem do Lembrete
                      </label>
                      <input
                        type="text"
                        value={reminderText}
                        onChange={e => setReminderText(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-medium focus:ring-2 focus:ring-emerald-600 outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConversionMsg(null)}
                  className="flex-1 py-2.5 px-3 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check size={14} strokeWidth={3} />
                  Confirmar e Gerar Pauta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail / Full View Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className={`p-4.5 flex justify-between items-center text-white ${
              selectedMessage.journal === 'BG' ? 'bg-amber-600' : 'bg-red-600'
            }`}>
              <div className="flex items-center gap-2">
                <Tv size={16} />
                <span className="text-xs font-black uppercase tracking-wider">
                  {selectedMessage.journal} • Detalhes da Mensagem
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="p-1 hover:bg-white/20 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                  Assunto da Mensagem
                </span>
                <h3 className="text-base font-black text-slate-900 uppercase">
                  {selectedMessage.subject}
                </h3>
                <span className="text-[10px] text-slate-400 font-bold block mt-1">
                  Cadastrado em {format(selectedMessage.createdAt || Date.now(), 'dd/MM/yyyy HH:mm')}
                </span>
              </div>

              {selectedMessage.phone && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Phone size={16} className="text-emerald-700" />
                    <div>
                      <span className="text-[10px] font-black uppercase text-emerald-800 block">
                        WhatsApp do Telespectador
                      </span>
                      <span className="text-xs font-black text-emerald-950">
                        {selectedMessage.phone}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => copyPhone(selectedMessage.phone)}
                      className="p-2 bg-white text-slate-700 hover:text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold cursor-pointer"
                      title="Copiar número"
                    >
                      <Copy size={13} />
                    </button>
                    <a
                      href={`https://wa.me/55${selectedMessage.phone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-black uppercase flex items-center gap-1 shadow-xs"
                    >
                      <MessageSquare size={13} /> Abrir Chat
                    </a>
                  </div>
                </div>
              )}

              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1">
                  Descrição Completa
                </span>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-800 leading-relaxed font-medium whitespace-pre-wrap">
                  {selectedMessage.description || '(Sem descrição detalhada)'}
                </div>
              </div>

              {selectedMessage.attachments && selectedMessage.attachments.length > 0 && (
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider block mb-1.5">
                    Anexos e Mídias ({selectedMessage.attachments.length})
                  </span>
                  <div className="space-y-2">
                    {selectedMessage.attachments.map((att, idx) => {
                      const isImage = att.type === 'image' || (att.name && /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(att.name));
                      const isVideo = att.type === 'video' || (att.name && /\.(mp4|webm|mov|m4v)$/i.test(att.name));
                      const isAudio = att.type === 'audio' || (att.name && /\.(mp3|ogg|wav|m4a|aac)$/i.test(att.name));
                      const previewUrl = att.dataUrl || att.url;

                      return (
                        <div
                          key={idx}
                          className="p-3 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 transition-all flex flex-col gap-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 truncate">
                              <Paperclip size={13} className="text-emerald-600 shrink-0" />
                              <span className="truncate">{att.name}</span>
                              {att.size && (
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({(att.size / 1024 / 1024).toFixed(2)} MB)
                                </span>
                              )}
                            </span>
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              download={att.name}
                              className="flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-800 font-bold hover:underline shrink-0 ml-2"
                            >
                              <span>Abrir / Baixar</span>
                              <ExternalLink size={12} />
                            </a>
                          </div>

                          {isImage && previewUrl && (
                            <div className="mt-1 rounded-lg overflow-hidden border border-slate-200 max-h-56 bg-slate-900/5 flex items-center justify-center">
                              <img
                                src={previewUrl}
                                alt={att.name}
                                className="max-h-56 w-auto object-contain rounded"
                                loading="lazy"
                              />
                            </div>
                          )}

                          {isVideo && att.url && (
                            <video
                              src={att.url}
                              controls
                              className="max-h-48 w-full rounded border border-slate-200 bg-black mt-1"
                            />
                          )}

                          {isAudio && previewUrl && (
                            <audio
                              src={previewUrl}
                              controls
                              className="w-full mt-1"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 font-bold text-[11px] block">
                    Pauteira(o): <strong>{getUserName(selectedMessage.pauteiraId)}</strong>
                  </span>
                  <span className="text-slate-400 font-medium text-[10px] block">
                    Criado por: <strong>{getUserName(selectedMessage.createdBy || selectedMessage.pauteiraId)}</strong>
                    {isAuthorOf(selectedMessage) && (
                      <span className="ml-1 text-emerald-700 font-bold">(Você)</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isAuthorOf(selectedMessage) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const msg = selectedMessage;
                        setSelectedMessage(null);
                        openEditModal(msg);
                      }}
                      className="py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
                      title="Editar mensagem (você é o autor)"
                    >
                      <Pencil size={13} /> Editar
                    </button>
                  ) : (
                    <span 
                      className="py-1.5 px-2.5 bg-slate-100 border border-slate-200 text-slate-500 rounded-xl text-[10px] font-bold flex items-center gap-1.5"
                      title={`Apenas o criador (${getUserName(selectedMessage.createdBy || selectedMessage.pauteiraId)}) pode editar`}
                    >
                      <Lock size={12} className="text-slate-400" /> Somente autor edita
                    </span>
                  )}

                  {selectedMessage.status !== 'pauta' && (
                    <button
                      type="button"
                      onClick={() => {
                        const msg = selectedMessage;
                        setSelectedMessage(null);
                        openConversionModal(msg);
                      }}
                      className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <TrendingUp size={14} /> Gerar Pauta Oficial
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Column in Didactic Funnel
function MessageColumn({
  title,
  description,
  badgeColor,
  count,
  messages,
  emptyMessage,
  onConvert,
  onUpdateStatus,
  onDelete,
  onEdit,
  onSelect,
  onCopyPhone,
  getUserName,
  isAuthorOf
}: {
  title: string;
  description: string;
  badgeColor: string;
  count: number;
  messages: WhatsAppMessage[];
  emptyMessage: string;
  onConvert: (m: WhatsAppMessage) => void;
  onUpdateStatus: (id: string, s: WhatsAppMessage['status']) => void;
  onDelete: (id: string) => void;
  onEdit: (m: WhatsAppMessage) => void;
  onSelect: (m: WhatsAppMessage) => void;
  onCopyPhone: (p?: string) => void;
  getUserName: (id: string) => string;
  isAuthorOf: (m: WhatsAppMessage) => boolean;
}) {
  return (
    <div className="bg-slate-100/70 border border-slate-200/90 rounded-2xl p-3 flex flex-col min-h-[500px]">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-1 pb-2 border-b border-slate-200">
        <div>
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-tight">
            {title}
          </h3>
          <p className="text-[10px] text-slate-500 font-medium">
            {description}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${badgeColor}`}>
          {count}
        </span>
      </div>

      {/* Cards List */}
      <div className="space-y-2.5 mt-2 flex-1 overflow-y-auto max-h-[75vh]">
        {messages.length === 0 ? (
          <div className="py-12 px-3 text-center text-slate-400 text-xs font-bold border-2 border-dashed border-slate-200 rounded-xl">
            {emptyMessage}
          </div>
        ) : (
          messages.map(m => (
            <MessageCard
              key={m.id}
              msg={m}
              onConvert={onConvert}
              onUpdateStatus={onUpdateStatus}
              onDelete={onDelete}
              onEdit={onEdit}
              onSelect={onSelect}
              onCopyPhone={onCopyPhone}
              getUserName={getUserName}
              isAuthorOf={isAuthorOf}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Subcomponent: Individual Card
function MessageCard({
  msg,
  onConvert,
  onUpdateStatus,
  onDelete,
  onEdit,
  onSelect,
  onCopyPhone,
  getUserName,
  isAuthorOf
}: {
  key?: React.Key;
  msg: WhatsAppMessage;
  onConvert: (m: WhatsAppMessage) => void;
  onUpdateStatus: (id: string, s: WhatsAppMessage['status']) => void;
  onDelete: (id: string) => void;
  onEdit: (m: WhatsAppMessage) => void;
  onSelect: (m: WhatsAppMessage) => void;
  onCopyPhone: (p?: string) => void;
  getUserName: (id: string) => string;
  isAuthorOf: (m: WhatsAppMessage) => boolean;
}) {
  const isBG = msg.journal === 'BG';
  const canEdit = isAuthorOf(msg);

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs hover:shadow-xs p-3.5 transition-all space-y-2.5 group">
      {/* Card Header: Journal tag + Time */}
      <div className="flex items-center justify-between text-[10px]">
        <span className={`px-2 py-0.5 rounded-md font-black uppercase text-[9px] tracking-wider ${
          isBG ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-red-100 text-red-900 border border-red-300'
        }`}>
          {msg.journal === 'BG' ? 'Balanço Geral' : 'Cidade Alerta'}
        </span>
        <span className="text-slate-400 font-bold">
          {msg.createdAt ? format(msg.createdAt, 'HH:mm • dd/MM') : '-'}
        </span>
      </div>

      {/* Subject and Description Preview */}
      <div 
        onClick={() => onSelect(msg)}
        className="cursor-pointer space-y-1"
      >
        <h4 className="text-xs font-black text-slate-900 uppercase leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
          {msg.subject}
        </h4>
        {msg.description && (
          <p className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
            {msg.description}
          </p>
        )}
      </div>

      {/* Phone Link & Attachments count */}
      <div className="flex items-center justify-between text-[11px] pt-1">
        {msg.phone ? (
          <div className="flex items-center gap-1.5">
            <a
              href={`https://wa.me/55${msg.phone}`}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 transition-all"
              title="Abrir no WhatsApp"
            >
              <MessageSquare size={11} /> {msg.phone}
            </a>
            <button
              type="button"
              onClick={() => onCopyPhone(msg.phone)}
              className="text-slate-400 hover:text-slate-700 cursor-pointer p-0.5"
              title="Copiar telefone"
            >
              <Copy size={11} />
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400 font-medium">Sem telefone</span>
        )}

        {msg.attachments && msg.attachments.length > 0 && (
          <span className="text-[10px] font-black text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md flex items-center gap-1 border border-blue-200">
            <Paperclip size={10} /> {msg.attachments.length}
          </span>
        )}
      </div>

      {/* Pauteira attribution & Author Edit Action */}
      <div className="text-[10px] text-slate-400 font-bold flex items-center justify-between border-t border-slate-100 pt-2">
        <span className="truncate max-w-[125px]" title={`Pauteira: ${getUserName(msg.pauteiraId)}`}>
          Pauteira: <strong className="text-slate-700">{getUserName(msg.pauteiraId)}</strong>
        </span>
        <div className="flex items-center gap-1.5">
          {canEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(msg);
              }}
              className="text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300/80 px-2 py-0.5 rounded-md text-[10px] font-black uppercase flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95"
              title="Editar mensagem (você é o autor)"
            >
              <Pencil size={11} />
              <span>Editar</span>
            </button>
          ) : (
            <span
              className="text-slate-400 bg-slate-100/80 border border-slate-200/80 px-1.5 py-0.5 rounded-md text-[9px] font-bold flex items-center gap-1 cursor-help"
              title={`Apenas o criador (${getUserName(msg.createdBy || msg.pauteiraId)}) pode editar esta mensagem`}
            >
              <Lock size={10} className="text-slate-400" />
              <span>Autor</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onDelete(msg.id)}
            className="text-slate-300 hover:text-red-600 p-1 rounded-md transition-colors cursor-pointer"
            title="Excluir mensagem"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Didactic Action Buttons */}
      <div className="pt-1 flex items-center gap-1.5">
        {msg.status !== 'pauta' ? (
          <button
            type="button"
            onClick={() => onConvert(msg)}
            className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95"
            title="Aprovar e enviar para a fila oficial de pautas"
          >
            <TrendingUp size={12} /> Gerar Pauta
          </button>
        ) : (
          <span className="flex-1 py-1.5 px-2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1">
            <CheckCircle2 size={12} /> Pauta Gerada
          </span>
        )}

        {/* Status Dropdown */}
        <select
          value={msg.status}
          onChange={e => onUpdateStatus(msg.id, e.target.value as any)}
          className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-black uppercase px-2 py-1.5 cursor-pointer outline-none"
        >
          <option value="pendente">Pendente</option>
          <option value="pauta">Virou Pauta</option>
          <option value="resolvido">Resolvido</option>
          <option value="descartado">Descartar</option>
        </select>
      </div>
    </div>
  );
}
