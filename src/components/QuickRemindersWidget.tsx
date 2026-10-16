import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  QuickReminder, 
  QuickReminderPriority, 
  QuickReminderScope 
} from '../types/quickReminder';
import { 
  Pin, 
  Plus, 
  Check, 
  Trash2, 
  Flame, 
  AlertCircle, 
  Info, 
  Users, 
  Lock, 
  X,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';
import { playSuccessChime } from '../lib/soundChime';

export default function QuickRemindersWidget() {
  const { userData } = useAuth();
  const [reminders, setReminders] = useState<QuickReminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter & View State
  const [scopeFilter, setScopeFilter] = useState<'all' | 'geral' | 'pessoal'>('all');
  const [hideCompleted, setHideCompleted] = useState<boolean>(true);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Form State
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<QuickReminderPriority>('media');
  const [newScope, setNewScope] = useState<QuickReminderScope>('geral');
  const [newIsPinned, setNewIsPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isManager = userData?.role === 'admin' || userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira';

  // Real-time Firestore listener
  useEffect(() => {
    const q = query(collection(db, 'quickReminders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list: QuickReminder[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<QuickReminder, 'id'>)
      }));
      setReminders(list);
      setIsLoading(false);
    }, (err) => {
      console.warn('Erro ao carregar quickReminders:', err);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  // Filter reminders based on user and scope
  const filteredReminders = reminders.filter(r => {
    // If it's private ('pessoal'), only show to the creator
    if (r.scope === 'pessoal' && r.createdBy !== userData?.uid) {
      return false;
    }

    if (hideCompleted && r.isCompleted) {
      return false;
    }

    if (scopeFilter === 'geral') {
      return r.scope === 'geral';
    }
    if (scopeFilter === 'pessoal') {
      return r.scope === 'pessoal' && r.createdBy === userData?.uid;
    }

    return true;
  });

  // Sort: Pinned first, then by priority (alta -> media -> baixa), then by createdAt
  const priorityWeight: Record<QuickReminderPriority, number> = {
    alta: 3,
    media: 2,
    baixa: 1
  };

  const sortedReminders = [...filteredReminders].sort((a, b) => {
    // 1. Pinned
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    // 2. Active before completed
    if (a.isCompleted !== b.isCompleted) {
      return a.isCompleted ? 1 : -1;
    }
    // 3. Priority weight
    const pA = priorityWeight[a.priority] || 1;
    const pB = priorityWeight[b.priority] || 1;
    if (pA !== pB) {
      return pB - pA;
    }
    // 4. Creation time
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) {
      return toast.error('Digite o texto do lembrete.');
    }

    setIsSubmitting(true);
    try {
      const now = Date.now();
      await addDoc(collection(db, 'quickReminders'), {
        text: newText.trim(),
        priority: newPriority,
        scope: newScope,
        isPinned: newIsPinned,
        isCompleted: false,
        createdBy: userData?.uid || 'anon',
        createdByName: userData?.name ? userData.name.split(' ')[0] : 'Colaborador',
        createdAt: now,
        updatedAt: now
      });

      playSuccessChime();
      toast.success('Lembrete rápido adicionado!');
      setNewText('');
      setNewPriority('media');
      setNewScope('geral');
      setNewIsPinned(false);
      setIsFormOpen(false);
    } catch (err: any) {
      toast.error('Erro ao salvar lembrete: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleComplete = async (r: QuickReminder) => {
    try {
      await updateDoc(doc(db, 'quickReminders', r.id), {
        isCompleted: !r.isCompleted,
        updatedAt: Date.now()
      });
      if (!r.isCompleted) {
        toast.success('Lembrete concluído!');
      }
    } catch (err: any) {
      toast.error('Erro ao atualizar: ' + err.message);
    }
  };

  const handleTogglePin = async (r: QuickReminder) => {
    try {
      await updateDoc(doc(db, 'quickReminders', r.id), {
        isPinned: !r.isPinned,
        updatedAt: Date.now()
      });
      toast.success(r.isPinned ? 'Lembrete desafixado.' : '📌 Lembrete fixado no topo!');
    } catch (err: any) {
      toast.error('Erro ao fixar: ' + err.message);
    }
  };

  const handleDeleteReminder = (r: QuickReminder) => {
    // Only author or admin/editor can delete
    const canDelete = r.createdBy === userData?.uid || isManager;
    if (!canDelete) {
      return toast.error('Você não tem permissão para remover este lembrete.');
    }

    confirmAction('Deseja excluir este lembrete da Dashboard?', async () => {
      try {
        await deleteDoc(doc(db, 'quickReminders', r.id));
        toast.success('Lembrete excluído.');
      } catch (err: any) {
        toast.error('Erro ao excluir: ' + err.message);
      }
    });
  };

  const totalActive = reminders.filter(r => 
    !r.isCompleted && (r.scope === 'geral' || r.createdBy === userData?.uid)
  ).length;

  const totalPinned = reminders.filter(r => 
    r.isPinned && !r.isCompleted && (r.scope === 'geral' || r.createdBy === userData?.uid)
  ).length;

  const countAll = reminders.filter(r => 
    (!hideCompleted || !r.isCompleted) && (r.scope === 'geral' || r.createdBy === userData?.uid)
  ).length;

  const countPessoais = reminders.filter(r => 
    (!hideCompleted || !r.isCompleted) && r.scope === 'pessoal' && r.createdBy === userData?.uid
  ).length;

  const countGeral = reminders.filter(r => 
    (!hideCompleted || !r.isCompleted) && r.scope === 'geral'
  ).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-ric-border overflow-hidden">
      {/* Header Bar */}
      <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-600/90 text-white flex items-center justify-center font-bold shadow-inner">
            <Pin size={17} className="rotate-45" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-sm uppercase tracking-wide text-white">
                Lembretes Rápidos da Redação
              </h2>
              {totalActive > 0 && (
                <span className="bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums">
                  {totalActive} {totalActive === 1 ? 'ativo' : 'ativos'}
                </span>
              )}
              {totalPinned > 0 && (
                <span className="bg-amber-500/30 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  📌 {totalPinned} fixado(s)
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-300">
              Avisos operacionais, comunicados urgentes e anotações imediatas do plantão
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* New Reminder Button */}
          <button
            type="button"
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-red-600 hover:bg-red-700 active:scale-95 text-white px-3.5 py-2 rounded-lg text-xs font-black uppercase shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isFormOpen ? <X size={15} /> : <Plus size={15} strokeWidth={3} />}
            <span>{isFormOpen ? 'Fechar' : 'Novo Lembrete'}</span>
          </button>
        </div>
      </div>

      {/* Sub-bar de Filtros: Todos / Pessoais / Geral */}
      <div className="bg-slate-50 border-b border-slate-200 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-black uppercase text-slate-500 mr-1 flex items-center gap-1">
            <Filter size={12} /> Filtrar:
          </span>
          <button
            type="button"
            onClick={() => setScopeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
              scopeFilter === 'all'
                ? 'bg-ric-blue text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span>Todos</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              scopeFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {countAll}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setScopeFilter('pessoal')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
              scopeFilter === 'pessoal'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-purple-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Lock size={12} />
            <span>Pessoais</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              scopeFilter === 'pessoal' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {countPessoais}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setScopeFilter('geral')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
              scopeFilter === 'geral'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:text-emerald-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Users size={12} />
            <span>Geral</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
              scopeFilter === 'geral' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {countGeral}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHideCompleted(!hideCompleted)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer flex items-center gap-1.5 ${
              hideCompleted 
                ? 'bg-white border-slate-200 text-slate-600 hover:text-slate-900' 
                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
            }`}
            title={hideCompleted ? 'Exibir lembretes já concluídos' : 'Ocultar lembretes concluídos'}
          >
            <CheckCircle2 size={13} className={hideCompleted ? 'text-slate-400' : 'text-emerald-600'} />
            <span>{hideCompleted ? 'Ocultando Concluídos' : 'Exibindo Concluídos'}</span>
          </button>
        </div>
      </div>

      {/* Creation Form Panel (Expandable) */}
      {isFormOpen && (
        <div className="bg-slate-50 border-b border-slate-200 p-4 md:p-5 animate-in slide-in-from-top-2 duration-150">
          <form onSubmit={handleCreateReminder} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600 mb-1">
                Texto do Lembrete <span className="text-red-500">*</span>
              </label>
              <textarea
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="Ex: Coletiva da Defesa Civil às 11h30; Atenção ao VT 03 que precisa de corte na sonora..."
                rows={2}
                className="w-full bg-white border border-slate-300 focus:border-ric-blue focus:ring-1 focus:ring-ric-blue rounded-xl p-3 text-xs text-slate-900 outline-none leading-relaxed transition-all shadow-xs"
                autoFocus
                required
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {/* Priority Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Prioridade:</span>
                <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setNewPriority('alta')}
                    className={`px-2.5 py-1 text-xs font-black rounded-md flex items-center gap-1.5 cursor-pointer transition-all ${
                      newPriority === 'alta'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-red-600'
                    }`}
                  >
                    <Flame size={13} /> Alta
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPriority('media')}
                    className={`px-2.5 py-1 text-xs font-black rounded-md flex items-center gap-1.5 cursor-pointer transition-all ${
                      newPriority === 'media'
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-amber-600'
                    }`}
                  >
                    <AlertCircle size={13} /> Média
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPriority('baixa')}
                    className={`px-2.5 py-1 text-xs font-black rounded-md flex items-center gap-1.5 cursor-pointer transition-all ${
                      newPriority === 'baixa'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Info size={13} /> Baixa
                  </button>
                </div>
              </div>

              {/* Scope & Pin Options */}
              <div className="flex items-center gap-3">
                {/* Scope */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Destino:</span>
                  <select
                    value={newScope}
                    onChange={e => setNewScope(e.target.value as QuickReminderScope)}
                    className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                  >
                    <option value="geral">👥 Mural Geral (Toda a Equipe)</option>
                    <option value="pessoal">🔒 Apenas Meu (Pessoal)</option>
                  </select>
                </div>

                {/* Pin toggle */}
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer select-none bg-white border border-slate-300 px-2.5 py-1 rounded-lg hover:border-amber-400">
                  <input
                    type="checkbox"
                    checked={newIsPinned}
                    onChange={e => setNewIsPinned(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                  />
                  <span>📌 Fixar no Topo</span>
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-ric-blue hover:bg-[#002244] text-white px-4 py-1.5 rounded-lg text-xs font-black uppercase shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Plus size={14} strokeWidth={3} />
                  <span>{isSubmitting ? 'Salvando...' : 'Adicionar Lembrete'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Reminders List / Grid */}
      <div className="p-4 md:p-5">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-slate-400 font-bold">
            Carregando lembretes rápidos...
          </div>
        ) : sortedReminders.length === 0 ? (
          <div className="py-7 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            <Pin size={24} className="mx-auto mb-2 text-slate-300 rotate-45" />
            <p className="font-bold text-xs text-slate-700">Nenhum lembrete rápido ativo no momento.</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Clique em <strong>+ Novo Lembrete</strong> acima para postar recados urgentes ou anotações para o plantão.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedReminders.map((r) => {
              const isOwner = r.createdBy === userData?.uid;
              const canDelete = isOwner || isManager;

              // Priority styling
              const isHigh = r.priority === 'alta';
              const isMedium = r.priority === 'media';

              return (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3.5 transition-all duration-150 flex flex-col justify-between relative group ${
                    r.isCompleted 
                      ? 'bg-slate-50 border-slate-200 opacity-60' 
                      : isHigh
                      ? 'bg-red-50/40 border-red-200 border-l-4 border-l-red-600 shadow-2xs'
                      : isMedium
                      ? 'bg-amber-50/30 border-amber-200 border-l-4 border-l-amber-500 shadow-2xs'
                      : 'bg-white border-slate-200 border-l-4 border-l-slate-400 shadow-2xs'
                  }`}
                >
                  {/* Top Header Row of the Card */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      {/* Priority Tag */}
                      {isHigh && (
                        <span className="font-black text-red-700 flex items-center gap-1 text-[10px] uppercase">
                          <Flame size={12} className="text-red-600 animate-pulse" /> Urgente
                        </span>
                      )}
                      {isMedium && (
                        <span className="font-bold text-amber-700 flex items-center gap-1 text-[10px] uppercase">
                          <AlertCircle size={12} className="text-amber-600" /> Importante
                        </span>
                      )}
                      {!isHigh && !isMedium && (
                        <span className="font-medium text-slate-500 flex items-center gap-1 text-[10px] uppercase">
                          <Info size={12} /> Normal
                        </span>
                      )}

                      <span className="text-slate-300">·</span>

                      {/* Scope Tag */}
                      {r.scope === 'pessoal' ? (
                        <span className="font-bold text-purple-700 flex items-center gap-1 text-[10px]">
                          <Lock size={10} /> Pessoal
                        </span>
                      ) : (
                        <span className="font-medium text-slate-500 flex items-center gap-1 text-[10px]">
                          <Users size={10} /> Mural
                        </span>
                      )}

                      {/* Pinned Marker */}
                      {r.isPinned && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="font-black text-amber-600 text-[10px] flex items-center gap-0.5">
                            📌 Fixado
                          </span>
                        </>
                      )}
                    </div>

                    {/* Quick Card Top Actions (Pin & Delete) */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleTogglePin(r)}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          r.isPinned 
                            ? 'text-amber-600 bg-amber-100 hover:bg-amber-200' 
                            : 'text-slate-400 hover:text-amber-600 opacity-60 group-hover:opacity-100'
                        }`}
                        title={r.isPinned ? 'Desafixar do topo' : 'Fixar no topo'}
                      >
                        <Pin size={13} className={r.isPinned ? 'rotate-45 fill-amber-500' : ''} />
                      </button>

                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteReminder(r)}
                          className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-60 group-hover:opacity-100 cursor-pointer"
                          title="Excluir lembrete"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Reminder Text Content */}
                  <div className="flex items-start gap-2.5 my-1">
                    <button
                      type="button"
                      onClick={() => handleToggleComplete(r)}
                      className={`w-5 h-5 rounded border mt-0.5 flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                        r.isCompleted
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-300 bg-white hover:border-emerald-500 text-transparent'
                      }`}
                      title={r.isCompleted ? 'Marcar como pendente' : 'Marcar como concluído'}
                    >
                      <Check size={13} strokeWidth={3} className={r.isCompleted ? 'block' : 'hidden'} />
                    </button>

                    <p className={`text-xs text-slate-900 leading-relaxed break-words font-medium flex-1 ${
                      r.isCompleted ? 'line-through text-slate-400 font-normal' : ''
                    }`}>
                      {r.text}
                    </p>
                  </div>

                  {/* Card Typographic Metadata Footer */}
                  <div className="mt-3 pt-2 border-t border-slate-100/80 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>
                      Por: <strong className="text-slate-600">{r.createdByName || 'Colaborador'}</strong>
                    </span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {r.createdAt ? format(r.createdAt, 'HH:mm') : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
