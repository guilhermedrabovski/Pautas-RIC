import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Plus, 
  Check, 
  Clock, 
  Play, 
  Users, 
  Trash2, 
  LayoutDashboard, 
  Flame, 
  Timer, 
  UserCheck, 
  UserX,
  Sparkles,
  Bell, 
  X, 
  Filter, 
  CheckCircle2, 
  Video, 
  Film, 
  ChevronDown, 
  ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';
import { format } from 'date-fns';
import { PREDEFINED_USERS, IMAGE_EDITORS_LIST } from '../lib/constants';
import EditorWorkloadWidget from '../components/EditorWorkloadWidget';
import { playSuccessChime } from '../lib/soundChime';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: string;
}

export interface RetrancaUpdate {
  id: string;
  type: 'midia' | 'informacao' | 'sonora' | 'urgente';
  note: string;
  createdAt: number;
  authorName: string;
}

export interface Retranca {
  id: string;
  title: string;
  description: string;
  editorId: string; // empty string means "Disponível na fila / Sem Editor"
  status: 'pendente' | 'editando' | 'concluido';
  hasNewMedia: boolean;
  isUrgent?: boolean;
  deadline?: string; // e.g. "11:45"
  journal?: 'BG' | 'Cidade Alerta' | 'Geral';
  format?: 'VT' | 'Sonora' | 'Compacto' | 'Ao Vivo' | 'Bruto';
  updates?: RetrancaUpdate[];
  createdBy: string;
  createdByName?: string;
  createdAt: number;
  updatedAt?: number;
}

// Crisp synthesized audio chime using Web Audio API (100% reliable, zero asset dependencies)
function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12); // A5
    gain2.gain.setValueAtTime(0.35, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch (err) {
    console.warn("Could not play sound chime:", err);
  }
}

export default function EditorDashboard() {
  const { userData } = useAuth();
  const [retrancas, setRetrancas] = useState<Retranca[]>([]);
  const [editors, setEditors] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Update Modal State (Adicionar Mais Coisas / Nova Mídia / Informação Adicional)
  const [updateModalRetranca, setUpdateModalRetranca] = useState<Retranca | null>(null);
  const [updateType, setUpdateType] = useState<'midia' | 'informacao' | 'sonora' | 'urgente'>('midia');
  const [updateNote, setUpdateNote] = useState('');
  const [reopenForEditing, setReopenForEditing] = useState(true);

  // Real-time notification toast/modal state
  const [realtimeAlert, setRealtimeAlert] = useState<{
    retranca: Retranca;
    message: string;
    isMine: boolean;
  } | null>(null);

  // Filters
  const [filterView, setFilterView] = useState<'all' | 'mine' | 'urgent' | 'unassigned'>('all');
  const [journalFilter, setJournalFilter] = useState<'all' | 'BG' | 'Cidade Alerta'>('all');

  // Form State (Nova Retranca)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editorId, setEditorId] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [deadline, setDeadline] = useState('');
  const [journal, setJournal] = useState<'BG' | 'Cidade Alerta' | 'Geral'>('BG');
  const [formatType, setFormatType] = useState<'VT' | 'Sonora' | 'Compacto' | 'Ao Vivo' | 'Bruto'>('VT');

  const initialLoadRef = useRef(true);
  const prevRetrancasRef = useRef<Map<string, Retranca>>(new Map());

  const cleanUserUid = (userData?.uid || '').toLowerCase().trim();
  const isImageEditorUser = ['zand', 'jamir', 'jean', 'miudo', 'valdeilton'].includes(cleanUserUid) || userData?.role === 'editor';

  const isPauteiro = !isImageEditorUser && (
    ['admin', 'pauteiro', 'pauteira'].includes(userData?.role || '') ||
    (userData?.email || '').toLowerCase().includes('guilherme') ||
    (userData?.name || '').toLowerCase().includes('guilherme')
  );

  // Load Image Editors (Zand, Jamir, Jean, Miúdo, Valdeilton)
  useEffect(() => {
    const predefinedEditors: User[] = [
      { uid: 'zand', name: 'Zand', email: 'zand@ric.com.br', role: 'editor' },
      { uid: 'jamir', name: 'Jamir', email: 'jamir@ric.com.br', role: 'editor' },
      { uid: 'jean', name: 'Jean', email: 'jean@ric.com.br', role: 'editor' },
      { uid: 'miudo', name: 'Miúdo', email: 'miudo@ric.com.br', role: 'editor' },
      { uid: 'valdeilton', name: 'Valdeilton', email: 'valdeilton@ric.com.br', role: 'editor' },
    ];

    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snap) => {
      const allUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
      const firestoreEditors = allUsers.filter(u => {
        const cleanId = (u.uid || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const cleanName = (u.name || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return ['zand', 'jamir', 'jean', 'miudo', 'valdeilton'].some(target => cleanId === target || cleanName === target || cleanName.includes(target));
      });
      
      const merged = [...predefinedEditors];
      firestoreEditors.forEach(fe => {
        const cleanFeId = fe.uid.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const idx = merged.findIndex(m => m.uid.toLowerCase() === cleanFeId);
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...fe };
        }
      });
      setEditors(merged);
    }, (err) => {
      console.warn("Error fetching users for editors in EditorDashboard:", err);
      setEditors(predefinedEditors);
    });
    return unsub;
  }, []);

  // Real-time listener with audio/popup alerts
  useEffect(() => {
    const q = query(collection(db, 'retrancas'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const currentList: Retranca[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Retranca));
      
      // Check for real-time changes after initial load
      if (!initialLoadRef.current && userData?.uid) {
        currentList.forEach(r => {
          const prev = prevRetrancasRef.current.get(r.id);
          const isAssignedToMe = isTargetOfRetranca(r);
          const isUnassigned = !r.editorId;

          // Condition 1: Brand new retranca assigned to me
          if (!prev && isAssignedToMe) {
            playNotificationSound();
            setRealtimeAlert({
              retranca: r,
              message: `Nova retranca atribuída a você: "${r.title}"`,
              isMine: true
            });
            toast.success(`🔔 Nova retranca para você: ${r.title}`, { duration: 6000 });
          }
          // Condition 2: Brand new unassigned urgent retranca (alert all editors)
          else if (!prev && isUnassigned && r.isUrgent) {
            playNotificationSound();
            toast(`🚨 Nova retranca URGENTE na fila: ${r.title}`, { icon: '🔥', duration: 7000 });
          }
          // Condition 3: Existing retranca was assigned to me
          else if (prev && prev.editorId !== userData.uid && isAssignedToMe) {
            playNotificationSound();
            setRealtimeAlert({
              retranca: r,
              message: `Você foi marcado na retranca: "${r.title}"`,
              isMine: true
            });
            toast.success(`🔔 Retranca atribuída a você: ${r.title}`, { duration: 6000 });
          }
          // Condition 4: New update or media arrived for active/completed retranca
          else if (prev && isAssignedToMe) {
            const hasNewUpdate = (r.updates?.length || 0) > (prev.updates?.length || 0);
            if ((!prev.hasNewMedia && r.hasNewMedia) || hasNewUpdate) {
              playNotificationSound();
              toast.error(`📹 NOVA MÍDIA / ATUALIZAÇÃO para sua retranca: ${r.title}!`, { duration: 8000 });
            }
          }
        });
      }

      // Update refs
      const newMap = new Map<string, Retranca>();
      currentList.forEach(item => newMap.set(item.id, item));
      prevRetrancasRef.current = newMap;
      initialLoadRef.current = false;

      setRetrancas(currentList);
    });

    return () => unsub();
  }, [userData?.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPauteiro) {
      return toast.error('Apenas pauteiros e coordenadores podem criar novas retrancas.');
    }
    if (!title.trim() || !userData?.uid) {
      return toast.error('Informe ao menos o título da retranca.');
    }

    try {
      await addDoc(collection(db, 'retrancas'), {
        title: title.trim().toUpperCase(),
        description: description.trim(),
        editorId: editorId || '',
        status: 'pendente',
        hasNewMedia: false,
        isUrgent,
        deadline: deadline.trim() || '',
        journal,
        format: formatType,
        updates: [],
        createdBy: userData.uid,
        createdByName: userData.name || 'Pauteiro',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });

      toast.success(editorId ? 'Retranca criada e editor notificado!' : 'Retranca enviada para a fila de edição!');
      resetForm();
    } catch (error: any) {
      toast.error('Erro ao salvar retranca: ' + error.message);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setEditorId('');
    setIsUrgent(false);
    setDeadline('');
    setJournal('BG');
    setFormatType('VT');
    setIsModalOpen(false);
  };

  // Handle adding new media, material, or info after/during editing
  const handleAddUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updateModalRetranca || !updateNote.trim()) {
      return toast.error('Descreva as informações ou mídias adicionais.');
    }

    try {
      const newUpdate: RetrancaUpdate = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        type: updateType,
        note: updateNote.trim(),
        createdAt: Date.now(),
        authorName: userData?.name || 'Pauteiro'
      };

      const currentUpdates = updateModalRetranca.updates || [];
      const updatedList = [newUpdate, ...currentUpdates];

      // If requested or if status was concluded, reopen for editor
      let newStatus = updateModalRetranca.status;
      if (reopenForEditing) {
        newStatus = updateModalRetranca.editorId ? 'editando' : 'pendente';
      }

      await updateDoc(doc(db, 'retrancas', updateModalRetranca.id), {
        updates: updatedList,
        hasNewMedia: true,
        status: newStatus,
        updatedAt: Date.now()
      });

      playNotificationSound();
      toast.success('Atualização registrada! O editor foi alertado.');
      setUpdateModalRetranca(null);
      setUpdateNote('');
    } catch (error: any) {
      toast.error('Erro ao registrar atualização: ' + error.message);
    }
  };

  const openUpdateModal = (retranca: Retranca) => {
    setUpdateModalRetranca(retranca);
    setUpdateType('midia');
    setUpdateNote('');
    // Auto-check reopen if it was already marked as concluido
    setReopenForEditing(retranca.status === 'concluido');
  };

  const updateStatus = async (id: string, status: Retranca['status']) => {
    try {
      const targetRetranca = retrancas.find(r => r.id === id);
      await updateDoc(doc(db, 'retrancas', id), { 
        status, 
        updatedAt: Date.now(),
        ...(status === 'editando' ? { hasNewMedia: false } : {})
      });

      if (status === 'concluido' && targetRetranca) {
        playSuccessChime();
        toast.success(`VT "${targetRetranca.title}" concluído com sucesso!`);

        // Emit notification / reminder to whoever created the retranca
        if (targetRetranca.createdBy && targetRetranca.createdBy !== userData?.uid) {
          try {
            await addDoc(collection(db, 'reminders'), {
              fromId: userData?.uid || 'editor',
              toId: targetRetranca.createdBy,
              text: `🎬 Material Concluído! O editor ${userData?.name || 'Editor'} concluiu o VT: "${targetRetranca.title}".`,
              read: false,
              createdAt: Date.now(),
              type: 'retranca_concluida',
              retrancaId: id,
              retrancaTitle: targetRetranca.title
            });
          } catch (remErr) {
            console.warn("Could not send reminder for conclusion:", remErr);
          }
        }
      } else {
        toast.success(status === 'editando' ? 'Edição iniciada!' : 'Status atualizado!');
      }
    } catch (error: any) {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  };

  // Claim unassigned retranca ("Assumir Edição")
  const handleClaimRetranca = async (retranca: Retranca) => {
    if (!userData?.uid) return;
    try {
      await updateDoc(doc(db, 'retrancas', retranca.id), {
        editorId: userData.uid,
        status: 'editando',
        updatedAt: Date.now()
      });
      toast.success(`Você assumiu a edição de "${retranca.title}"!`);
    } catch (error: any) {
      toast.error('Erro ao assumir retranca: ' + error.message);
    }
  };

  // Unclaim retranca ("Desassumir Retranca / Liberar para a Fila")
  const handleUnclaimRetranca = async (retranca: Retranca) => {
    confirmAction(`Liberar a retranca "${retranca.title}" de volta para a fila aberta?`, async () => {
      try {
        await updateDoc(doc(db, 'retrancas', retranca.id), {
          editorId: '',
          status: 'pendente',
          updatedAt: Date.now()
        });
        toast.success(`Retranca "${retranca.title}" liberada de volta para a fila!`);
      } catch (error: any) {
        toast.error('Erro ao desassumir retranca: ' + error.message);
      }
    });
  };

  const handleDelete = (id: string) => {
    confirmAction('Deseja realmente excluir esta retranca do painel?', async () => {
      try {
        await deleteDoc(doc(db, 'retrancas', id));
        toast.success('Retranca excluída com sucesso!');
      } catch (err: any) {
        console.error("Erro ao excluir retranca:", err);
        toast.error('Erro ao excluir: ' + (err.message || 'Sem permissão'));
      }
    });
  };

  const getEditorName = (id: string) => {
    if (!id) return 'Disponível na Fila';
    const cleanId = id.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (cleanId === 'zand') return 'Zand';
    if (cleanId === 'jamir') return 'Jamir';
    if (cleanId === 'jean') return 'Jean';
    if (cleanId === 'miudo') return 'Miúdo';
    if (cleanId === 'valdeilton') return 'Valdeilton';
    const found = editors.find(e => {
      const eUid = (e.uid || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const eName = (e.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return eUid === cleanId || eName === cleanId;
    });
    if (found) return found.name;
    const predefined = PREDEFINED_USERS.find(p => {
      const pU = p.username.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const pN = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return pU === cleanId || pN === cleanId;
    });
    return predefined ? predefined.name : 'Editor Designado';
  };

  const isTargetOfRetranca = (r: Retranca) => {
    if (!r.editorId || !userData) return false;
    const target = (r.editorId || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const myUid = (userData.uid || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const myName = (userData.name || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const myEmail = (userData.email || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const myUsername = myEmail.includes('@') ? myEmail.split('@')[0] : '';

    if (target === myUid || target === myName || (myUsername && target === myUsername)) return true;
    if (myName && (myName.includes(target) || target.includes(myName))) return true;
    if (myUid && (myUid.includes(target) || target.includes(myUid))) return true;
    if (myUsername && (myUsername.includes(target) || target.includes(myUsername))) return true;

    // Check image editors explicitly (Zand, Jamir, Jean, Miúdo, Valdeilton)
    const imageEditors = ['zand', 'jamir', 'jean', 'miudo', 'valdeilton'];
    for (const ed of imageEditors) {
      if (target.includes(ed) && (myName.includes(ed) || myUid.includes(ed) || myEmail.includes(ed) || myUsername.includes(ed))) {
        return true;
      }
    }
    return false;
  };

  // Filtered Retrancas
  const filteredRetrancas = retrancas.filter(r => {
    if (journalFilter !== 'all' && r.journal !== journalFilter) return false;
    if (filterView === 'mine') return isTargetOfRetranca(r);
    if (filterView === 'urgent') return !!r.isUrgent;
    if (filterView === 'unassigned') return !r.editorId;
    return true;
  });

  const pendentes = filteredRetrancas.filter(r => r.status === 'pendente');
  const editando = filteredRetrancas.filter(r => r.status === 'editando');
  const concluidos = filteredRetrancas.filter(r => r.status === 'concluido');

  // Retrancas assumidas especificamente pelo usuário/editor logado (em edição ativa ou pendente atribuída)
  const myAssumedRetrancas = retrancas.filter(r => {
    if (r.status === 'concluido') return false;
    return isTargetOfRetranca(r);
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-ric-border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-ric-blue flex items-center justify-center font-bold">
              <LayoutDashboard size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                Ilhas de Edição
              </h1>
              <p className="text-xs text-ric-muted font-bold uppercase tracking-wider mt-0.5">
                Controle das Ilhas de Edição, Retrancas, Prazos e Atualizações Contínuas
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {isPauteiro && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-ric-blue hover:bg-[#002244] text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase shadow-md shadow-ric-blue/20 transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus size={16} /> Nova Retranca
            </button>
          )}
        </div>
      </div>

      {/* STATUS DA ILHA DE EDIÇÃO (OCUPAÇÃO, PORCENTAGEM & ALERTA LIVRE) */}
      <EditorWorkloadWidget 
        initialRetrancas={retrancas} 
        initialEditors={editors}
        showLinkToDashboard={false}
        onAssignClick={isPauteiro ? ((chosenEditorId) => {
          setEditorId(chosenEditorId);
          setIsModalOpen(true);
        }) : undefined}
      />

      {/* BLOCO SEPARADO COM FUNDO PRETO: RETRANCAS ASSUMIDAS PELO EDITOR (SEM CONFUSÃO) */}
      <div className="bg-black text-white rounded-2xl border-2 border-zinc-800 shadow-2xl p-5 md:p-6 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center font-black shadow-lg shadow-red-600/40 shrink-0">
              <Film size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base md:text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
                  Suas Retrancas Assumidas
                </h2>
                <span className="bg-zinc-800 text-zinc-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border border-zinc-700">
                  {myAssumedRetrancas.length} em edição
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider mt-0.5">
                {userData?.name || 'Editor'} • Bloco Exclusivo de Edição Ativa
              </p>
            </div>
          </div>

          <div>
            {myAssumedRetrancas.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 rounded-xl text-xs font-black uppercase animate-pulse">
                <Sparkles size={14} /> Você está LIVRE (Sem Retranca)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-950/80 border border-blue-500/50 text-blue-400 rounded-xl text-xs font-black uppercase">
                <Play size={12} fill="currentColor" /> {myAssumedRetrancas.length} Em Produção
              </span>
            )}
          </div>
        </div>

        {myAssumedRetrancas.length === 0 ? (
          <div className="py-6 px-5 bg-zinc-900/70 border border-dashed border-zinc-800 rounded-xl text-center space-y-2">
            <div className="text-emerald-400 font-black text-sm uppercase flex items-center justify-center gap-2">
              <Sparkles size={17} /> Você está 100% Livre no momento
            </div>
            <p className="text-xs text-zinc-400 max-w-lg mx-auto">
              Nenhuma retranca assumida por você. Para editar, escolha qualquer matéria aberta na coluna <strong className="text-amber-400">"Pendente / Fila"</strong> abaixo e clique no botão <strong className="text-white bg-amber-600 px-2 py-0.5 rounded text-[11px]">Assumir Edição</strong>!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myAssumedRetrancas.map(retranca => (
              <div 
                key={retranca.id}
                className="bg-zinc-900 border-2 border-zinc-700 hover:border-red-500 rounded-xl p-4 shadow-lg flex flex-col justify-between transition-all relative overflow-hidden"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        retranca.journal === 'BG' ? 'bg-amber-500 text-black' : retranca.journal === 'Cidade Alerta' ? 'bg-red-600 text-white' : 'bg-zinc-700 text-white'
                      }`}>
                        {retranca.journal || 'Geral'}
                      </span>
                      <span className="text-[10px] font-bold uppercase bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md border border-zinc-700">
                        {retranca.format || 'VT'}
                      </span>
                      {retranca.isUrgent && (
                        <span className="text-[10px] font-black uppercase bg-red-600 text-white px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                          <Flame size={11} /> URGENTE
                        </span>
                      )}
                    </div>

                    {retranca.deadline && (
                      <span className="text-xs font-black text-amber-300 bg-amber-950/60 border border-amber-500/40 px-2.5 py-1 rounded-md flex items-center gap-1">
                        <Timer size={13} className="text-amber-400" /> Prazo: {retranca.deadline}
                      </span>
                    )}
                  </div>

                  <h3 className="font-black text-white text-base uppercase tracking-wide leading-tight mb-2">
                    {retranca.title}
                  </h3>

                  {retranca.description && (
                    <p className="text-xs text-zinc-300 leading-relaxed mb-3 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                      {retranca.description}
                    </p>
                  )}

                  {retranca.hasNewMedia && (
                    <div className="mb-3 px-3 py-2 bg-amber-500/20 border border-amber-500/50 rounded-lg flex items-center gap-2 text-xs font-black uppercase text-amber-300 animate-pulse">
                      <Bell size={14} className="text-amber-400" />
                      <span>Nova mídia / material adicional adicionado!</span>
                    </div>
                  )}
                </div>

                {/* Actions: Iniciar/Concluir, Desassumir, Nova Mídia */}
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-800 mt-2">
                  {retranca.status === 'pendente' ? (
                    <button
                      onClick={() => handleClaimRetranca(retranca)}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase py-2.5 px-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Play size={16} fill="white" /> Assumir & Iniciar Edição
                    </button>
                  ) : (
                    <button
                      onClick={() => updateStatus(retranca.id, 'concluido')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase py-2.5 px-3 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Check size={16} strokeWidth={3} /> Concluir VT
                    </button>
                  )}

                  <button
                    onClick={() => handleUnclaimRetranca(retranca)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-amber-300 hover:text-amber-200 border border-zinc-700 text-xs font-black uppercase py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    title="Desassumir e liberar retranca de volta para a fila aberta"
                  >
                    <UserX size={15} /> Desassumir
                  </button>

                  <button
                    onClick={() => openUpdateModal(retranca)}
                    className="bg-black hover:bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-black uppercase py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                    title="Adicionar novas mídias ou informações"
                  >
                    <Plus size={15} /> Mídia / Info
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Tabs & Quick View Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] font-black uppercase text-ric-muted mr-1.5 flex items-center gap-1">
            <Filter size={12} /> Exibir:
          </span>
          <button
            onClick={() => setFilterView('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${filterView === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Todas ({retrancas.length})
          </button>
          <button
            onClick={() => setFilterView('mine')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${filterView === 'mine' ? 'bg-ric-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Minhas ({retrancas.filter(r => isTargetOfRetranca(r)).length})
          </button>
          <button
            onClick={() => setFilterView('unassigned')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${filterView === 'unassigned' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Na Fila ({retrancas.filter(r => !r.editorId).length})
          </button>
          <button
            onClick={() => setFilterView('urgent')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${filterView === 'urgent' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            Urgentes ({retrancas.filter(r => r.isUrgent).length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase text-ric-muted">Jornal:</span>
          <select
            value={journalFilter}
            onChange={e => setJournalFilter(e.target.value as any)}
            className="bg-slate-50 border border-slate-200 text-xs font-black uppercase rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
          >
            <option value="all">Todos os Jornais</option>
            <option value="BG">Balanço Geral (BG)</option>
            <option value="Cidade Alerta">Cidade Alerta (CA)</option>
          </select>
        </div>
      </div>

      {/* Real-time Alert Banner Popup (if triggered) */}
      {realtimeAlert && (
        <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-2xl shadow-xl flex items-center justify-between gap-4 border border-blue-700 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 animate-bounce">
              <Bell size={22} className="text-yellow-300" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-200 block">
                Aviso em Tempo Real da Ilha
              </span>
              <h3 className="text-sm font-black uppercase">{realtimeAlert.message}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {realtimeAlert.isMine && realtimeAlert.retranca.status === 'pendente' && (
              <button
                onClick={() => {
                  updateStatus(realtimeAlert.retranca.id, 'editando');
                  setRealtimeAlert(null);
                }}
                className="bg-yellow-400 hover:bg-yellow-500 text-slate-900 px-3.5 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <Play size={13} /> Iniciar Edição Agora
              </button>
            )}
            <button
              onClick={() => setRealtimeAlert(null)}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-all cursor-pointer text-white/70 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Kanban 3 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUMN 1: PENDENTES / NA FILA */}
        <div className="bg-slate-100/70 rounded-2xl border border-slate-200 p-4 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2 text-slate-800 font-black text-sm uppercase">
              <Clock className="text-amber-500" size={18} />
              <span>Aguardando Edição</span>
            </div>
            <span className="bg-amber-100 text-amber-800 font-black text-xs px-2.5 py-0.5 rounded-full">
              {pendentes.length}
            </span>
          </div>

          <div className="space-y-3.5 flex-1">
            {pendentes.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs font-bold uppercase">
                Nenhuma retranca pendente
              </div>
            ) : (
              pendentes.map(r => (
                <RetrancaCard
                  key={r.id}
                  retranca={r}
                  editorName={getEditorName(r.editorId)}
                  onStatusChange={updateStatus}
                  onClaim={handleClaimRetranca}
                  onUnclaim={handleUnclaimRetranca}
                  onOpenUpdateModal={openUpdateModal}
                  onDelete={handleDelete}
                  isPauteiro={isPauteiro}
                  isImageEditorUser={isImageEditorUser}
                  currentUser={userData}
                  isTarget={isTargetOfRetranca(r)}
                />
              ))
            )}
          </div>
        </div>

        {/* COLUMN 2: EDITANDO */}
        <div className="bg-blue-50/40 rounded-2xl border border-blue-200/70 p-4 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-blue-200">
            <div className="flex items-center gap-2 text-blue-900 font-black text-sm uppercase">
              <Play className="text-blue-600" size={18} />
              <span>Em Edição</span>
            </div>
            <span className="bg-blue-200 text-blue-900 font-black text-xs px-2.5 py-0.5 rounded-full">
              {editando.length}
            </span>
          </div>

          <div className="space-y-3.5 flex-1">
            {editando.length === 0 ? (
              <div className="py-16 text-center text-blue-300 text-xs font-bold uppercase">
                Nenhuma retranca sendo editada agora
              </div>
            ) : (
              editando.map(r => (
                <RetrancaCard
                  key={r.id}
                  retranca={r}
                  editorName={getEditorName(r.editorId)}
                  onStatusChange={updateStatus}
                  onClaim={handleClaimRetranca}
                  onUnclaim={handleUnclaimRetranca}
                  onOpenUpdateModal={openUpdateModal}
                  onDelete={handleDelete}
                  isPauteiro={isPauteiro}
                  isImageEditorUser={isImageEditorUser}
                  currentUser={userData}
                  isTarget={isTargetOfRetranca(r)}
                />
              ))
            )}
          </div>
        </div>

        {/* COLUMN 3: CONCLUÍDOS (SIMPLIFICADO: SÓ A RETRANCA E QUEM FEZ) */}
        <div className="bg-emerald-50/40 rounded-2xl border border-emerald-200/70 p-4 flex flex-col min-h-[500px]">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-emerald-200">
            <div className="flex items-center gap-2 text-emerald-900 font-black text-sm uppercase">
              <CheckCircle2 className="text-emerald-600" size={18} />
              <span>Concluídas ({concluidos.length})</span>
            </div>
            <span className="bg-emerald-200 text-emerald-900 font-black text-xs px-2.5 py-0.5 rounded-full">
              {concluidos.length}
            </span>
          </div>

          <div className="space-y-2.5 flex-1">
            {concluidos.length === 0 ? (
              <div className="py-16 text-center text-emerald-400 text-xs font-bold uppercase">
                Nenhuma retranca concluída ainda hoje
              </div>
            ) : (
              concluidos.map(r => (
                <div
                  key={r.id}
                  className="bg-white rounded-xl border border-emerald-200/90 p-3 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Check size={16} strokeWidth={3} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-slate-900 text-xs uppercase truncate" title={r.title}>
                        {r.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-bold truncate">
                        Feito por: <span className="text-emerald-700 font-black">{getEditorName(r.editorId)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isPauteiro && (
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => updateStatus(r.id, 'editando')}
                      className="px-2 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                      title="Reabrir retranca para edição se necessário"
                    >
                      Reabrir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Adicionar Mais Coisas / Nova Mídia / Informações Adicionais */}
      {updateModalRetranca && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="bg-slate-900 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Film size={18} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">Adicionar Material / Nova Mídia</h3>
                  <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider truncate max-w-[280px]">
                    Retranca: {updateModalRetranca.title}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setUpdateModalRetranca(null)} 
                className="p-1 hover:bg-white/10 rounded-full cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddUpdateSubmit} className="p-6 space-y-4">
              {/* Type Selector */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-2">
                  Tipo de Complemento que Chegou:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'midia', label: '📹 Nova Imagem/Vídeo', desc: 'Vídeos ou fotos do local' },
                    { id: 'informacao', label: '📝 Novas Informações', desc: 'Dados apurados / Boletim' },
                    { id: 'sonora', label: '🎤 Nova Sonora/Áudio', desc: 'Entrevista ou fala' },
                    { id: 'urgente', label: '🚨 Fato Urgente', desc: 'Desdobramento ao vivo' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setUpdateType(t.id as any)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        updateType === t.id 
                          ? 'bg-blue-50 border-ric-blue ring-2 ring-ric-blue/20' 
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-xs font-black text-slate-900 block">{t.label}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note / Details */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                  Detalhes do Novo Material / Instruções para a Ilha <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={updateNote}
                  onChange={e => setUpdateNote(e.target.value)}
                  placeholder="Ex: Chegou vídeo gravado por moradores mostrando a perseguição. Inserir no VT aos 00:45..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none leading-relaxed"
                  required
                />
              </div>

              {/* Reopen editing toggle if completed or editing */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-black uppercase text-amber-950 block">
                    Reabrir Ilha de Edição
                  </span>
                  <span className="text-[10px] text-amber-800">
                    Alerta o editor e move o status para "Em Edição" para que ele ajuste o VT
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={reopenForEditing}
                  onChange={e => setReopenForEditing(e.target.checked)}
                  className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUpdateModalRetranca(null)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-slate-900 hover:bg-black text-white py-2.5 rounded-xl text-xs font-black uppercase shadow-md transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Bell size={14} /> Registrar & Notificar Editor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nova Retranca */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
            <div className="bg-ric-blue text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <Video size={18} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">Nova Retranca para Edição</h3>
                  <p className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">
                    Ilhas de Edição • Grupo RIC
                  </p>
                </div>
              </div>
              <button onClick={resetForm} className="p-1 hover:bg-white/10 rounded-full cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Urgent Toggle */}
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="text-red-600 animate-pulse" size={18} />
                  <div>
                    <span className="text-xs font-black uppercase text-red-900 block">🚨 URGENTE / PRIORIDADE MÁXIMA</span>
                    <span className="text-[10px] text-red-700">Notifica os editores com aviso prioritário</span>
                  </div>
                </div>
                <input 
                  type="checkbox"
                  checked={isUrgent}
                  onChange={e => setIsUrgent(e.target.checked)}
                  className="w-5 h-5 accent-red-600 rounded cursor-pointer"
                />
              </div>

              {/* Title / Retranca */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                  Retranca / Título da Matéria <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value.toUpperCase())}
                  placeholder="EX: ACIDENTE BR 277 OU CASO VACINACAO"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-black uppercase tracking-wide focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none"
                  required
                />
              </div>

              {/* Editor Assignment & Journal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                    Editor de Imagem
                  </label>
                  <select 
                    value={editorId}
                    onChange={e => setEditorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none cursor-pointer"
                  >
                    <option value="">Deixar na fila (Qualquer Editor assume)</option>
                    {editors.map(e => (
                      <option key={e.uid} value={e.uid}>{e.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                    Jornal de Exibição
                  </label>
                  <select 
                    value={journal}
                    onChange={e => setJournal(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none cursor-pointer"
                  >
                    <option value="BG">Balanço Geral (BG)</option>
                    <option value="Cidade Alerta">Cidade Alerta (CA)</option>
                    <option value="Geral">Geral / Ambos</option>
                  </select>
                </div>
              </div>

              {/* Deadline & Format */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                    Horário Limite (Deadline)
                  </label>
                  <div className="relative">
                    <Timer size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      placeholder="Ex: 11:45 ou 12:20"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                    Formato do Material
                  </label>
                  <select 
                    value={formatType}
                    onChange={e => setFormatType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none cursor-pointer"
                  >
                    <option value="VT">VT Completo (com OFF)</option>
                    <option value="Sonora">Sonora / Entrevista</option>
                    <option value="Compacto">Compacto de Imagens</option>
                    <option value="Ao Vivo">Cobertura Ao Vivo</option>
                    <option value="Bruto">Bruto Decupado</option>
                  </select>
                </div>
              </div>

              {/* Description & Instructions */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-ric-muted mb-1">
                  Orientações para o Editor
                </label>
                <textarea 
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Ex: Pegar sonoras do delegado no cartão 2, destacar o momento da batida aos 01:23..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none leading-relaxed"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-ric-blue hover:bg-[#002244] text-white py-2.5 rounded-xl text-xs font-black uppercase shadow-md shadow-ric-blue/20 transition-all active:scale-95 cursor-pointer"
                >
                  Criar e Notificar Ilha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Individual Retranca Card Component
function RetrancaCard({
  retranca,
  editorName,
  onStatusChange,
  onClaim,
  onUnclaim,
  onOpenUpdateModal,
  onDelete,
  isPauteiro,
  isImageEditorUser,
  currentUser,
  isTarget
}: {
  key?: React.Key;
  retranca: Retranca;
  editorName: string;
  onStatusChange: (id: string, status: Retranca['status']) => void;
  onClaim: (retranca: Retranca) => void;
  onUnclaim?: (retranca: Retranca) => void;
  onOpenUpdateModal: (retranca: Retranca) => void;
  onDelete: (id: string) => void;
  isPauteiro: boolean;
  isImageEditorUser: boolean;
  currentUser?: any;
  isTarget: boolean;
}) {
  const [showUpdates, setShowUpdates] = useState(false);
  const isMine = isTarget || (currentUser?.uid && retranca.editorId === currentUser.uid);
  const isUnassigned = !retranca.editorId || retranca.editorId.trim() === '';
  const hasUpdates = retranca.updates && retranca.updates.length > 0;

  return (
    <div 
      className={`bg-white rounded-2xl border p-4 shadow-xs hover:shadow-md transition-all flex flex-col relative overflow-hidden ${
        retranca.isUrgent ? 'border-red-400 ring-2 ring-red-400/30' : 'border-slate-200'
      } ${retranca.hasNewMedia && isMine ? 'ring-2 ring-amber-500 animate-pulse' : ''}`}
    >
      {/* Top Badges Row */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5">
          {retranca.journal && (
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-white ${
              retranca.journal === 'BG' ? 'bg-amber-500' : retranca.journal === 'Cidade Alerta' ? 'bg-red-600' : 'bg-slate-700'
            }`}>
              {retranca.journal}
            </span>
          )}

          {retranca.format && (
            <span className="text-[9px] font-bold uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
              {retranca.format}
            </span>
          )}

          {retranca.isUrgent && (
            <span className="text-[9px] font-black uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded-md flex items-center gap-0.5 animate-pulse">
              <Flame size={10} /> URGENTE
            </span>
          )}
        </div>

        {retranca.deadline && (
          <span className="text-[10px] font-black text-slate-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1">
            <Timer size={11} className="text-amber-600" /> {retranca.deadline}
          </span>
        )}
      </div>

      {/* Retranca Title & Trash Button */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide leading-tight line-clamp-2">
          {retranca.title}
        </h3>
        {isPauteiro && (
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(retranca.id);
            }}
            className="text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all p-1.5 rounded-lg cursor-pointer"
            title="Excluir retranca"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {/* Description */}
      {retranca.description && (
        <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-3 bg-slate-50/80 p-2 rounded-lg">
          {retranca.description}
        </p>
      )}

      {/* Target Notification Banner: If assigned to current user and pending */}
      {isMine && retranca.status === 'pendente' && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border-2 border-blue-400 rounded-xl flex items-center justify-between text-xs font-black uppercase text-blue-900 animate-pulse">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-blue-600" />
            <span>Atribuída a você!</span>
          </div>
          <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-md font-bold">
            Assumir Abaixo
          </span>
        </div>
      )}

      {/* New Media Alert Badge */}
      {retranca.hasNewMedia && (
        <div className="mb-3 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between text-[10px] font-black uppercase text-amber-800">
          <div className="flex items-center gap-1.5">
            <Bell size={12} className="text-amber-600 animate-bounce" />
            <span>Novo Material / Mídia Adicionada!</span>
          </div>
          {retranca.status === 'concluido' && (
            <span className="bg-amber-500 text-white px-1.5 py-0.5 rounded text-[8px]">
              Reabrir VT
            </span>
          )}
        </div>
      )}

      {/* Updates / Material Feed Section */}
      {hasUpdates && (
        <div className="mb-3 bg-slate-50 border border-slate-200/80 rounded-xl overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setShowUpdates(!showUpdates)}
            className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Film size={12} className="text-blue-600" />
              <span>Atualizações / Mídias ({retranca.updates?.length})</span>
            </span>
            {showUpdates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {showUpdates && (
            <div className="p-2.5 space-y-2 border-t border-slate-200 bg-white max-h-48 overflow-y-auto">
              {retranca.updates?.map(u => (
                <div key={u.id} className="p-2 bg-slate-50 rounded-lg border border-slate-100 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                      u.type === 'midia' ? 'bg-blue-100 text-blue-800' :
                      u.type === 'sonora' ? 'bg-purple-100 text-purple-800' :
                      u.type === 'urgente' ? 'bg-red-100 text-red-800' :
                      'bg-emerald-100 text-emerald-800'
                    }`}>
                      {u.type === 'midia' ? '📹 Vídeo/Foto' :
                       u.type === 'sonora' ? '🎤 Sonora' :
                       u.type === 'urgente' ? '🚨 Urgente' : '📝 Informação'}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold">
                      {format(u.createdAt, 'HH:mm')} • {u.authorName}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-700 leading-normal font-medium">
                    {u.note}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Editor Attribution */}
      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 mb-3">
        <div className="flex items-center gap-1.5">
          <Users size={12} className="text-slate-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase">Editor:</span>
          <span className={`text-[11px] font-black uppercase ${
            isMine ? 'text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md' : isUnassigned ? 'text-amber-600 font-extrabold' : 'text-slate-700'
          }`}>
            {isMine ? 'Você' : editorName}
          </span>
        </div>

        {retranca.createdByName && (
          <span className="text-[9px] font-medium text-slate-400 truncate max-w-[90px]">
            Por: {retranca.createdByName}
          </span>
        )}
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
        {/* If retranca is pending */}
        {retranca.status === 'pendente' && (
          <>
            {/* Case 1: Assigned to current user -> Assumir & Iniciar Edição */}
            {isMine && (
              <button
                type="button"
                onClick={() => onClaim(retranca)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase py-2.5 px-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ring-2 ring-blue-400"
              >
                <Play size={14} fill="white" /> Assumir & Iniciar Edição
              </button>
            )}

            {/* Case 2: Open in queue without editor -> Assumir Edição */}
            {isUnassigned && (
              <button
                type="button"
                onClick={() => onClaim(retranca)}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
              >
                <UserCheck size={14} /> Assumir Edição
              </button>
            )}

            {/* Case 3: Assigned to someone else, but still pending -> other image editors or pauteiro can assume */}
            {!isMine && !isUnassigned && (
              <button
                type="button"
                onClick={() => onClaim(retranca)}
                className="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                title={`Atribuída a ${editorName}. Clique para assumir.`}
              >
                <UserCheck size={14} /> Assumir Retranca
              </button>
            )}
          </>
        )}

        {/* Finish Button if editing */}
        {retranca.status === 'editando' && (
          <button
            type="button"
            onClick={() => onStatusChange(retranca.id, 'concluido')}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase py-2.5 px-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Check size={14} strokeWidth={3} /> Concluir VT
          </button>
        )}

        {/* Unclaim / Desassumir button */}
        {retranca.status === 'editando' && onUnclaim && (isMine || isPauteiro) && (
          <button
            type="button"
            onClick={() => onUnclaim(retranca)}
            className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black uppercase py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
            title="Desassumir e liberar retranca de volta para a fila aberta"
          >
            <UserX size={14} /> Desassumir
          </button>
        )}

        {/* Reopen Button if completed */}
        {retranca.status === 'concluido' && (
          <button
            type="button"
            onClick={() => onStatusChange(retranca.id, 'editando')}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase py-2 px-3 rounded-xl transition-all cursor-pointer"
          >
            Reabrir Edição
          </button>
        )}

        {/* Add More Media / Info Button (Always visible on all stages) */}
        <button
          type="button"
          onClick={() => onOpenUpdateModal(retranca)}
          className="text-xs font-black uppercase py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-slate-900 hover:bg-black text-white active:scale-95 shadow-xs"
          title="Adicionar novas imagens, sonoras ou informações que chegaram"
        >
          <Plus size={14} /> Nova Mídia / Info
        </button>
      </div>
    </div>
  );
}
