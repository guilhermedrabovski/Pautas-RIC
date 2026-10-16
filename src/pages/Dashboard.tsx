import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getDisplayNames } from '../lib/userUtils';
import { useAuth } from '../contexts/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Bell, 
  ChevronRight, 
  Plus, 
  Film, 
  Timer, 
  Flame, 
  X, 
  ClipboardList, 
  MessageSquare, 
  BookOpen, 
  GraduationCap,
  Calendar,
  Sparkles,
  CheckCircle2,
  Clock,
  Scale
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import EditorWorkloadWidget from '../components/EditorWorkloadWidget';
import QuickRemindersWidget from '../components/QuickRemindersWidget';
import { IMAGE_EDITORS_LIST } from '../lib/constants';
import { playSuccessChime } from '../lib/soundChime';
import { notifyUrgentPautaPush } from '../lib/notifications';

export default function Dashboard() {
  const { userData, users } = useAuth();
  const navigate = useNavigate();
  const [unreadReminders, setUnreadReminders] = useState<any[]>([]);
  const [recentAgendas, setRecentAgendas] = useState<any[]>([]);
  
  // Modal de Atribuir Pauta para Editor Livre
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignEditorId, setAssignEditorId] = useState('zand');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDescription, setAssignDescription] = useState('');
  const [assignJournal, setAssignJournal] = useState<'BG' | 'Cidade Alerta' | 'Geral'>('BG');
  const [assignFormat, setAssignFormat] = useState<'VT' | 'Sonora' | 'Compacto' | 'Ao Vivo' | 'Bruto'>('VT');
  const [assignDeadline, setAssignDeadline] = useState('');
  const [assignIsUrgent, setAssignIsUrgent] = useState(false);
  const [availableAgendas, setAvailableAgendas] = useState<any[]>([]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const todayFormatted = format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR });
  const isManager = userData?.role === 'admin' || userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira';
  const isIntern = userData?.role === 'estagiario';
  const displayNames = getDisplayNames(users);

  useEffect(() => {
    if (!userData) return;
    
    // Reminders
    const qReminders = query(collection(db, 'reminders'), where('toId', '==', userData.uid), where('read', '==', false));
    const unsubR = onSnapshot(qReminders, snap => {
      setUnreadReminders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn('Dashboard reminders error:', err));
    
    // Recent Agendas (pautas)
    const qAgendas = query(collection(db, 'agendas'), orderBy('createdAt', 'desc'), limit(15));
    const unsubAgendas = onSnapshot(qAgendas, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRecentAgendas(list);
      setAvailableAgendas(list);
    }, err => console.warn('Dashboard agendas error:', err));

    return () => { 
      unsubR(); 
      unsubAgendas(); 
    };
  }, [userData, today, isManager]);

  const openAssignPautaModal = (editorId?: string) => {
    if (editorId) {
      setAssignEditorId(editorId);
    }
    setIsAssignModalOpen(true);
  };

  const handleSelectExistingAgenda = (agendaId: string) => {
    if (!agendaId) return;
    const agenda = availableAgendas.find(a => a.id === agendaId);
    if (agenda) {
      setAssignTitle(agenda.title || '');
      setAssignDescription(agenda.details || agenda.description || '');
      if (agenda.journal) setAssignJournal(agenda.journal);
      if (agenda.time) setAssignDeadline(agenda.time);
    }
  };

  const handleAssignPautaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTitle.trim()) {
      return toast.error('Informe ao menos a retranca ou título da pauta.');
    }
    try {
      await addDoc(collection(db, 'retrancas'), {
        title: assignTitle.trim().toUpperCase(),
        description: assignDescription.trim(),
        editorId: assignEditorId || '',
        status: 'pendente',
        hasNewMedia: false,
        isUrgent: assignIsUrgent,
        deadline: assignDeadline.trim() || '',
        journal: assignJournal,
        format: assignFormat,
        updates: [],
        createdBy: userData?.uid || 'coordenador',
        createdByName: userData?.name || 'Coordenação',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      const editorObj = IMAGE_EDITORS_LIST.find(e => e.uid === assignEditorId);
      playSuccessChime();

      if (assignIsUrgent) {
        notifyUrgentPautaPush({
          title: assignTitle.trim().toUpperCase(),
          editorId: assignEditorId || '',
          editorName: editorObj?.name,
          isUrgent: true,
          url: '/ilhas-de-edicao',
        }).catch(err => console.warn('Erro ao disparar Web Push no Dashboard:', err));
      }

      toast.success(`Pauta atribuída com sucesso para ${editorObj?.name || assignEditorId}!`);
      setIsAssignModalOpen(false);
      setAssignTitle('');
      setAssignDescription('');
      setAssignDeadline('');
      setAssignIsUrgent(false);
    } catch (err: any) {
      toast.error('Erro ao salvar retranca: ' + err.message);
    }
  };

  const getUserName = (id: string) => {
    const u = users.find(u => u.uid === id);
    if (!u) return id;
    return displayNames[u.uid] || u.name || u.email?.split('@')[0] || id;
  };

  return (
    <div className="space-y-[15px] pb-10">
      {/* Top Welcome Bar */}
      <div className="bg-white rounded-[8px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ric-text">
            Olá, {userData?.name ? userData.name.split(' ')[0] : (userData?.email ? userData.email.split('@')[0] : 'Colaborador')}!
          </h1>
          <p className="text-[13px] text-ric-muted mt-1 capitalize flex items-center gap-1.5">
            <Calendar size={13} className="text-gray-400" />
            {todayFormatted} • Central de Produção e Edição
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => openAssignPautaModal()}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95 shrink-0"
          >
            <Plus size={16} strokeWidth={3} /> Atribuir Pauta p/ Editor Livre
          </button>
        </div>
      </div>

      {/* Intern Friendly Notice (APENAS para quem é estagiário, ex: Pedro) */}
      {isIntern && (
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-4 rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <GraduationCap size={22} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">Sua Rotina Diária de Estagiário</p>
              <p className="text-xs text-white/90">
                Cheque as páginas de notícias, grupos de WhatsApp e informe suas potenciais pautas.
              </p>
            </div>
          </div>
          <Link
            to="/checklist"
            className="bg-white text-emerald-800 hover:bg-emerald-50 px-4 py-2 rounded-lg font-black text-xs uppercase shadow-sm shrink-0 transition-colors"
          >
            Abrir Checklist da Rotina
          </Link>
        </div>
      )}

      {/* LEMBRETES RÁPIDOS DA REDAÇÃO (Prioridades, Mural Geral / Pessoal, Fixação no Topo) */}
      <QuickRemindersWidget />

      {/* STATUS DA ILHA DE EDIÇÃO (OCUPAÇÃO, PORCENTAGEM & ALERTA LIVRE) */}
      <EditorWorkloadWidget 
        showLinkToDashboard={true} 
        onAssignClick={(editorId) => openAssignPautaModal(editorId)}
      />

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Link
          to="/agendas"
          className="bg-white p-4 rounded-xl border border-ric-border shadow-xs hover:border-ric-blue hover:shadow-sm transition-all flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-ric-blue flex items-center justify-center shrink-0 group-hover:bg-ric-blue group-hover:text-white transition-colors">
            <ClipboardList size={20} />
          </div>
          <div>
            <span className="block font-bold text-xs text-ric-text group-hover:text-ric-blue">Pautas</span>
            <span className="text-[11px] text-ric-muted">Gerenciar reportagens</span>
          </div>
        </Link>

        <Link
          to="/whatsapp"
          className="bg-white p-4 rounded-xl border border-ric-border shadow-xs hover:border-emerald-600 hover:shadow-sm transition-all flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <MessageSquare size={20} />
          </div>
          <div>
            <span className="block font-bold text-xs text-ric-text group-hover:text-emerald-700">WhatsApp</span>
            <span className="text-[11px] text-ric-muted">Sugestões de pauta</span>
          </div>
        </Link>

        <Link
          to="/editor-dashboard"
          className="bg-white p-4 rounded-xl border border-ric-border shadow-xs hover:border-purple-600 hover:shadow-sm transition-all flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Film size={20} />
          </div>
          <div>
            <span className="block font-bold text-xs text-ric-text group-hover:text-purple-700">Ilhas de Edição</span>
            <span className="text-[11px] text-ric-muted">Fila & ilhas de vídeo</span>
          </div>
        </Link>

        <Link
          to="/processos"
          className="bg-white p-4 rounded-xl border border-ric-border shadow-xs hover:border-amber-600 hover:shadow-sm transition-all flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <Scale size={20} />
          </div>
          <div>
            <span className="block font-bold text-xs text-ric-text group-hover:text-amber-700">Processos</span>
            <span className="text-[11px] text-ric-muted">CNJ, varas & réus</span>
          </div>
        </Link>

        <Link
          to="/reminders"
          className="bg-white p-4 rounded-xl border border-ric-border shadow-xs hover:border-amber-600 hover:shadow-sm transition-all flex items-center gap-3 group"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors relative">
            <Bell size={20} />
            {unreadReminders.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-ric-red text-white text-[9px] font-black rounded-full flex items-center justify-center">
                {unreadReminders.length}
              </span>
            )}
          </div>
          <div>
            <span className="block font-bold text-xs text-ric-text group-hover:text-amber-700">Lembretes</span>
            <span className="text-[11px] text-ric-muted">
              {unreadReminders.length > 0 ? `${unreadReminders.length} pendentes` : 'Em dia'}
            </span>
          </div>
        </Link>
      </div>

      {/* Main Operational Hub: Pautas Recentes & Lembretes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[15px]">
        {/* Pautas Recentes da Redação (2 Cols) */}
        <div className="lg:col-span-2 bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden flex flex-col">
          <div className="bg-[#F8F9FA] px-4 py-3 border-b border-ric-border flex justify-between items-center border-t-[3px] border-t-ric-blue">
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-ric-blue" />
              <h2 className="font-bold text-ric-text uppercase tracking-wider text-[13px]">
                Pautas Recentes da Redação
              </h2>
            </div>
            <Link 
              to="/agendas" 
              className="text-[12px] font-bold text-ric-blue hover:underline flex items-center"
            >
              Ver todas as pautas <ChevronRight size={14} />
            </Link>
          </div>

          <div className="p-4 flex-1">
            {recentAgendas.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {recentAgendas.slice(0, 6).map((ag: any) => (
                  <div key={ag.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                          ag.journal === 'BG' ? 'bg-orange-100 text-orange-800' :
                          ag.journal === 'Cidade Alerta' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {ag.journal || 'Geral'}
                        </span>
                        <h4 className="font-bold text-[13px] text-ric-text truncate">
                          {ag.title}
                        </h4>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-ric-muted mt-0.5">
                        {ag.reporter && <span>Repórter: <strong>{ag.reporter}</strong></span>}
                        {ag.time && <span>Horário: <strong>{ag.time}</strong></span>}
                        {ag.status && (
                          <span className={`capitalize ${ag.status === 'gravada' ? 'text-green-600 font-bold' : ''}`}>
                            Status: {ag.status}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      to={`/agendas`}
                      className="text-gray-400 hover:text-ric-blue p-1 rounded transition-colors shrink-0"
                      title="Ver pauta"
                    >
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-ric-muted text-xs">
                <ClipboardList size={24} className="mx-auto mb-2 text-gray-300" />
                <p>Nenhuma pauta cadastrada recentemente.</p>
              </div>
            )}
          </div>
        </div>

        {/* Lembretes Pendentes (1 Col) */}
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden flex flex-col">
          <div className="bg-[#EFF6FF] px-4 py-3 border-b border-ric-border flex justify-between items-center border-t-[3px] border-t-ric-blue">
            <h2 className="font-bold text-ric-blue uppercase tracking-wider text-[13px] flex items-center">
              <Bell size={15} className="mr-2" /> Lembretes Pendentes
            </h2>
            <Link to="/reminders" className="text-[12px] font-bold text-ric-blue hover:underline flex items-center">
              Abrir <ChevronRight size={14}/>
            </Link>
          </div>
          <div className="p-4 flex-1">
            {unreadReminders.length > 0 ? (
              <div className="space-y-2.5">
                {unreadReminders.slice(0, 4).map(rem => (
                  <div key={rem.id} className="bg-gray-50 border border-gray-200 rounded-[6px] p-2.5 text-[12px]">
                    <p className="text-ric-text font-medium leading-snug">{rem.text}</p>
                    <div className="flex justify-between text-[10px] text-ric-muted mt-1.5">
                      <span>De: <strong>{getUserName(rem.fromId)}</strong></span>
                      <span>{rem.createdAt ? format(rem.createdAt, 'HH:mm') : ''}</span>
                    </div>
                  </div>
                ))}
                {unreadReminders.length > 4 && (
                  <Link 
                    to="/reminders"
                    className="block text-[11px] text-center text-ric-blue hover:underline font-bold mt-2"
                  >
                    +{unreadReminders.length - 4} lembretes pendentes na lista...
                  </Link>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-ric-muted text-xs">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="font-bold text-gray-700">Tudo em dia!</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Nenhum lembrete pendente para você.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL DE ATRIBUIR PAUTA PARA EDITOR LIVRE */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="bg-emerald-700 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <Film size={20} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">Atribuir Pauta p/ Editor Livre</h3>
                  <p className="text-[10px] text-emerald-200 font-bold uppercase tracking-wider">
                    Ilhas de Edição • Grupo RIC
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsAssignModalOpen(false)} 
                className="p-1 hover:bg-white/10 rounded-full cursor-pointer text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssignPautaSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Urgent toggle */}
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="text-red-600 animate-pulse" size={18} />
                  <div>
                    <span className="text-xs font-black uppercase text-red-900 block">🚨 URGENTE / PRIORIDADE MÁXIMA</span>
                    <span className="text-[10px] text-red-700">Notifica o editor com alerta prioritário</span>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={assignIsUrgent}
                  onChange={e => setAssignIsUrgent(e.target.checked)}
                  className="w-5 h-5 accent-red-600 rounded cursor-pointer"
                />
              </div>

              {/* Editor Selection */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                  Editor de Imagem Destinatário <span className="text-red-500">*</span>
                </label>
                <select
                  value={assignEditorId}
                  onChange={e => setAssignEditorId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  required
                >
                  {IMAGE_EDITORS_LIST.map(e => (
                    <option key={e.uid} value={e.uid}>
                      {e.name} (Editor de Imagem)
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional: Pick from existing agendas */}
              {availableAgendas.length > 0 && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                    Ou Selecione uma Pauta Existente Cadastrada:
                  </label>
                  <select
                    onChange={e => handleSelectExistingAgenda(e.target.value)}
                    defaultValue=""
                    className="w-full bg-blue-50/60 border border-blue-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none cursor-pointer"
                  >
                    <option value="">-- Digitar manualmente ou escolher pauta... --</option>
                    {availableAgendas.map(ag => (
                      <option key={ag.id} value={ag.id}>
                        [{ag.journal || 'BG'}] {ag.title} {ag.reporter ? `(${ag.reporter})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title / Retranca */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                  Retranca / Assunto da Pauta <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={assignTitle}
                  onChange={e => setAssignTitle(e.target.value.toUpperCase())}
                  placeholder="EX: ACIDENTE BR 277 OU CASO VACINACAO"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-black uppercase tracking-wide focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                  required
                />
              </div>

              {/* Journal & Format */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                    Jornal de Exibição
                  </label>
                  <select 
                    value={assignJournal}
                    onChange={e => setAssignJournal(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  >
                    <option value="BG">Balanço Geral (BG)</option>
                    <option value="Cidade Alerta">Cidade Alerta (CA)</option>
                    <option value="Geral">Geral / Ambos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                    Formato do Material
                  </label>
                  <select 
                    value={assignFormat}
                    onChange={e => setAssignFormat(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none cursor-pointer"
                  >
                    <option value="VT">VT Completo (com OFF)</option>
                    <option value="Sonora">Sonora / Entrevista</option>
                    <option value="Compacto">Compacto de Imagens</option>
                    <option value="Ao Vivo">Cobertura Ao Vivo</option>
                    <option value="Bruto">Bruto Decupado</option>
                  </select>
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                  Horário Limite (Deadline)
                </label>
                <div className="relative">
                  <Timer size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    value={assignDeadline}
                    onChange={e => setAssignDeadline(e.target.value)}
                    placeholder="Ex: 11:45 ou 12:20"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                  Orientações para o Editor
                </label>
                <textarea 
                  rows={3}
                  value={assignDescription}
                  onChange={e => setAssignDescription(e.target.value)}
                  placeholder="Ex: Pegar sonoras do delegado no cartão 2, destacar o momento da batida..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:bg-white focus:ring-2 focus:ring-emerald-600 outline-none leading-relaxed"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-black uppercase shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus size={15} strokeWidth={3} /> Atribuir & Notificar Editor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
