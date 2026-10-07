import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isUserScaleOwner, getDisplayNames } from '../lib/userUtils';
import { useAuth, UserData } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Bell, CheckSquare, Calendar, ChevronRight, Check, ListTodo, Plus, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';
import EditorWorkloadWidget from '../components/EditorWorkloadWidget';

export default function Dashboard() {
  const { userData, users } = useAuth();
  const [latestHandover, setLatestHandover] = useState<any>(null);
  const [unreadReminders, setUnreadReminders] = useState<any[]>([]);
  const [myChecklistStats, setMyChecklistStats] = useState({ total: 0, checked: 0 });
  const [checklistTemplate, setChecklistTemplate] = useState<string[]>([]);
  const [checklistCompleted, setChecklistCompleted] = useState<string[]>([]);
  
  // Tasks state
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [myScaleToday, setMyScaleToday] = useState<any>(null);
  const [pendingTrades, setPendingTrades] = useState<any[]>([]);
  const [newTask, setNewTask] = useState({ title: '', type: 'Reportagem', time: '', assignedTo: '' });
  
  const today = format(new Date(), 'yyyy-MM-dd');
  const isManager = userData?.role === 'admin' || userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira';
  const displayNames = getDisplayNames(users);

  useEffect(() => {
    if (!userData) return;
    
    // Reminders
    const qReminders = query(collection(db, 'reminders'), where('toId', '==', userData.uid), where('read', '==', false));
    const unsubR = onSnapshot(qReminders, snap => {
      setUnreadReminders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    
    // Handovers (last 1)
    const qHandover = query(collection(db, 'handovers'), orderBy('createdAt', 'desc'), limit(1));
    const unsubH = onSnapshot(qHandover, snap => {
      if (!snap.empty) {
         setLatestHandover({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
         setLatestHandover(null);
      }
    });
    
    // Checklists stats
    const unsubTpl = onSnapshot(doc(db, 'checklistTemplates', userData.uid), snap => {
       const templateItems = snap.exists() ? snap.data().items || [] : ["Verificar emails", "Checar pautas pendentes", "Confirmar equipamentos"];
       setChecklistTemplate(templateItems);
       setMyChecklistStats(prev => ({ ...prev, total: templateItems.length }));
    });
    
    const unsubRun = onSnapshot(doc(db, 'checklistRuns', `${userData.uid}_${today}`), snap => {
       const completedItems = snap.exists() ? snap.data().completedItems || [] : [];
       setChecklistCompleted(completedItems);
       setMyChecklistStats(prev => ({ ...prev, checked: completedItems.length }));
    });

    // My Tasks
    const qMyTasks = query(collection(db, 'tasks'), where('assignedTo', '==', userData.uid), where('date', '==', today));
    const unsubT = onSnapshot(qMyTasks, snap => {
       setMyTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    let unsubAllT = () => {};
    if (isManager) {
      const qAllTasks = query(collection(db, 'tasks'), where('date', '==', today));
      unsubAllT = onSnapshot(qAllTasks, snap => {
         setAllTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });
    }

    // My Scale Today
    const qMyScale = query(collection(db, 'schedules'), where('date', '==', today));
    const unsubScale = onSnapshot(qMyScale, snap => {
      const myScale = snap.docs.find(d => isUserScaleOwner(d.data().reporterId, userData));
      if (myScale) {
        setMyScaleToday(myScale.data());
      } else {
        setMyScaleToday(null);
      }
    });

    // Handle trade request notifications
    const qTrades = query(collection(db, 'shiftTrades'), where('status', 'in', ['pending_target', 'pending_admin']));
    const unsubTrades = onSnapshot(qTrades, snap => {
      const allTrades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const relevantTrades = allTrades.filter((t: any) => {
        if (t.status === 'pending_target' && t.targetUserId === userData.uid) return true;
        if (t.status === 'pending_admin' && isManager) return true;
        return false;
      });
      setPendingTrades(relevantTrades);
    });

    return () => { unsubR(); unsubH(); unsubTpl(); unsubRun(); unsubT(); unsubAllT(); unsubScale(); unsubTrades(); };
  }, [userData, today, isManager]);

  const getUserName = (id: string) => {
    const u = users.find(u => u.uid === id);
    if (!u) return id;
    return displayNames[u.uid] || u.name || u.email?.split('@')[0] || id;
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title || !newTask.assignedTo) return toast.error('Preencha título e destinatário');
    try {
      await addDoc(collection(db, 'tasks'), {
        ...newTask,
        status: 'pending',
        date: today,
        createdBy: userData?.uid,
        createdAt: Date.now()
      });
      toast.success('Tarefa criada!');
      setNewTask({ title: '', type: 'Reportagem', time: '', assignedTo: '' });
    } catch (err: any) { 
      toast.error('Erro ao criar tarefa: ' + err.message); 
    }
  };

  const toggleTaskStatus = async (taskId: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: currentStatus === 'pending' ? 'completed' : 'pending' });
    } catch(err) {}
  };

  const toggleChecklistItem = async (item: string) => {
    if (!userData) return;
    const isCompleted = checklistCompleted.includes(item);
    const updated = isCompleted ? checklistCompleted.filter(i => i !== item) : [...checklistCompleted, item];
    
    // Optimistic update
    setChecklistCompleted(updated);
    
    // Firestore update
    const runRefId = `${userData.uid}_${today}`;
    await updateDoc(doc(db, 'checklistRuns', runRefId), {
      userId: userData.uid,
      date: today,
      completedItems: updated,
      updatedAt: Date.now()
    }).catch(async (e) => {
      // If document doesn't exist, set it
      if (e.code === 'not-found') {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'checklistRuns', runRefId), {
          userId: userData.uid,
          date: today,
          completedItems: updated,
          updatedAt: Date.now()
        });
      }
    });
  };

  const deleteTask = async (taskId: string) => {
    confirmAction('Remover esta tarefa?', async () => {
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
        toast.success('Tarefa removida!');
      } catch(err) {}
    });
  };

  const checklistProgress = myChecklistStats.total > 0 ? Math.round((myChecklistStats.checked / myChecklistStats.total) * 100) : 0;

  return (
     <div className="space-y-[15px]">
        <div className="bg-white rounded-[8px] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border">
          <h1 className="text-2xl font-bold text-ric-text">Olá, {userData?.name ? userData.name.split(' ')[0] : (userData?.email ? userData.email.split('@')[0] : 'Colaborador')}!</h1>
          <p className="text-[14px] text-ric-muted mt-1">Bem-vindo(a) ao Início do Painel Geral. Aqui está o seu resumo do plantão.</p>
        </div>

        {/* STATUS DA ILHA DE EDIÇÃO (OCUPAÇÃO, PORCENTAGEM & ALERTA LIVRE) */}
        <EditorWorkloadWidget showLinkToDashboard={true} />

        {/* SUAS TAREFAS DE HOJE */}
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden">
          <div className="bg-ric-card px-4 py-3 border-b border-ric-border flex justify-between items-center border-t-[4px] border-t-ric-blue">
            <h2 className="font-bold text-ric-text uppercase tracking-wider text-[14px] flex items-center"><ListTodo size={16} className="mr-2 text-ric-blue" /> Suas Tarefas de Hoje ({format(parseISO(today), 'dd/MM/yyyy')})</h2>
          </div>
          <div className="p-5">
            {checklistTemplate.length > 0 && (
               <div className="space-y-3 mb-6">
                 {checklistTemplate.map((item, idx) => {
                   const isCompleted = checklistCompleted.includes(item);
                   return (
                     <div key={`chk-${idx}`} className={`flex items-center justify-between p-3 rounded-[6px] border ${isCompleted ? 'bg-[#F0FDF4] border-[#86EFAC]' : 'bg-[#FEF2F2] border-[#FECACA]'} shadow-sm transition-colors`}>
                       <div className="flex items-center gap-3 w-full">
                       <button onClick={() => toggleChecklistItem(item)} className={`flex-shrink-0 w-10 h-10 rounded border-2 flex items-center justify-center transition-colors ${isCompleted ? 'bg-[#059669] border-[#059669] text-white' : 'border-[#EF4444] bg-white hover:bg-red-50 text-transparent'}`}>
                           <Check size={20} />
                         </button>
                         <div className={`flex-1 ${isCompleted ? 'opacity-70 line-through' : ''}`}>
                           <div className={`font-bold text-[14px] flex items-center gap-2 ${isCompleted ? 'text-[#065F46]' : 'text-[#B91C1C]'}`}>
                             {item} <span className="text-[10px] bg-white/50 border border-black/10 px-2 py-0.5 rounded-full font-medium">Checklist</span>
                           </div>
                         </div>
                       </div>
                     </div>
                   );
                 })}
               </div>
            )}
            
            {myTasks.length > 0 ? (
              <div className="space-y-3">
                {myTasks.map(t => (
                  <div key={t.id} className={`flex items-center justify-between p-3 rounded-[6px] border ${t.status === 'completed' ? 'bg-[#D1FAE5] border-[#059669]' : 'bg-[#FFEDD5] border-[#EA580C]'} shadow-sm transition-colors`}>
                    <div className="flex items-center gap-3 w-full">
                      <button onClick={() => toggleTaskStatus(t.id, t.status)} className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${t.status === 'completed' ? 'bg-[#059669] border-[#059669] text-white' : 'border-[#EA580C] bg-white hover:bg-orange-50 text-transparent'}`}>
                        <Check size={20} />
                      </button>
                      <div className={`flex-1 ${t.status === 'completed' ? 'opacity-70 line-through' : ''}`}>
                        <div className={`font-bold text-[14px] flex items-center gap-2 ${t.status === 'completed' ? 'text-[#065F46]' : 'text-[#9A3412]'}`}>
                          {t.title} <span className="text-[10px] bg-white/50 border border-black/10 px-2 py-0.5 rounded-full font-medium">{t.type}</span>
                        </div>
                        {t.time && <div className={`text-[12px] mt-0.5 font-bold ${t.status === 'completed' ? 'text-[#065F46]/80' : 'text-[#9A3412]/80'}`}>Horário: {t.time}</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-ric-muted text-center py-4">Nenhuma tarefa atribuída a você para hoje.</p>
            )}
          </div>
          
          {isManager && (
            <div className="bg-gray-50 border-t border-ric-border p-4">
              <h3 className="text-[13px] font-bold text-ric-muted uppercase mb-3 flex items-center"><Plus size={14} className="mr-1"/> Atribuir Nova Tarefa</h3>
              <form onSubmit={handleCreateTask} className="flex gap-3 flex-wrap md:flex-nowrap items-end">
                <div className="w-full md:w-1/3">
                   <label className="block text-[11px] font-bold uppercase text-ric-muted mb-1">Colaborador</label>
                   <select value={newTask.assignedTo} onChange={e => setNewTask({...newTask, assignedTo: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 text-[13px] bg-white">
                      <option value="" disabled>Selecione...</option>
                      {users.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(u => <option key={u.uid} value={u.uid}>{displayNames[u.uid] || u.name}</option>)}
                   </select>
                </div>
                <div className="w-full md:w-1/4">
                   <label className="block text-[11px] font-bold uppercase text-ric-muted mb-1">Assunto / Retranca</label>
                   <input type="text" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="Ex: Acidente BR" className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 text-[13px] bg-white" />
                </div>
                <div className="w-full md:w-1/4">
                   <label className="block text-[11px] font-bold uppercase text-ric-muted mb-1">Tipo</label>
                   <select value={newTask.type} onChange={e => setNewTask({...newTask, type: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 text-[13px] bg-white">
                     <option>VT</option>
                     <option>Mochilink</option>
                     <option>VT + MOCHI</option>
                     <option>Reportagem</option>
                     <option>Externa / Produção</option>
                     <option>Interna / Edição</option>
                     <option>Outro</option>
                   </select>
                </div>
                <div className="w-full md:w-1/6">
                   <label className="block text-[11px] font-bold uppercase text-ric-muted mb-1">Horário (Opcional)</label>
                   <input type="time" value={newTask.time} onChange={e => setNewTask({...newTask, time: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 text-[13px] bg-white h-[38px] cursor-pointer" />
                </div>
                <button type="submit" className="w-full md:w-auto bg-ric-blue text-white px-4 py-2 rounded-[4px] text-[13px] font-bold hover:bg-[#002244] shrink-0">Criar Tarefa</button>
              </form>

              {allTasks.length > 0 && (
                <div className="mt-6 border-t border-gray-200 pt-4">
                  <h3 className="text-[13px] font-bold text-ric-muted uppercase mb-3">Visão Geral de Tarefas Distribuídas Hoje</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {allTasks.map(t => (
                      <div key={t.id} className={`border rounded-[6px] p-3 flex flex-col justify-between ${t.status === 'completed' ? 'bg-[#D1FAE5] border-[#059669]' : 'bg-[#FFEDD5] border-[#EA580C]'} shadow-sm transition-colors`}>
                         <div className="flex justify-between items-start w-full">
                            <div className="flex-1 mr-2">
                               <div className={`text-[11px] font-black uppercase mb-1 ${t.status === 'completed' ? 'text-[#065F46]/70' : 'text-[#9A3412]'} flex items-center justify-between`}>
                                 <select 
                                   value={t.assignedTo} 
                                   onChange={e => updateDoc(doc(db, 'tasks', t.id), { assignedTo: e.target.value })} 
                                   className="bg-white/50 border border-black/10 rounded px-1 py-0.5 text-[10px] font-bold uppercase outline-none max-w-[120px]"
                                 >
                                    {users.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(u => <option key={u.uid} value={u.uid}>{displayNames[u.uid] || u.name}</option>)}
                                 </select>
                               </div>
                               <div className={`font-bold text-[14px] leading-tight ${t.status === 'completed' ? 'text-[#065F46] line-through opacity-70' : 'text-[#9A3412]'}`}>{t.title}</div>
                               <div className={`text-[11px] font-semibold mt-1 flex items-center gap-2 ${t.status === 'completed' ? 'text-[#065F46]/80' : 'text-[#9A3412]/80'}`}>
                                 <span>{t.type}</span>
                                 <input 
                                   type="time" 
                                   value={t.time || ''} 
                                   onChange={e => updateDoc(doc(db, 'tasks', t.id), { time: e.target.value })} 
                                   className="bg-white/50 border border-black/10 rounded px-1 outline-none text-[10px] uppercase cursor-pointer py-0.5"
                                 />
                               </div>
                            </div>
                            <div className="flex items-center gap-1">
                               <button onClick={() => toggleTaskStatus(t.id, t.status)} title="Marcar status" className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-colors ${t.status === 'completed' ? 'bg-[#059669] border-[#059669] text-white' : 'border-[#EA580C] bg-white hover:bg-orange-50 text-transparent'}`}>
                                  <Check size={20} />
                               </button>
                               <button onClick={() => deleteTask(t.id)} title="Excluir tarefa" className="text-black/30 hover:text-red-600 bg-white/50 hover:bg-white rounded p-1 transition-colors"><Trash2 size={14}/></button>
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>



        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px]">
            {/* Lembretes */}
            <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden flex flex-col">
               <div className="bg-[#EFF6FF] px-4 py-3 border-b border-ric-border flex justify-between items-center">
                 <h2 className="font-bold text-ric-blue uppercase tracking-wider text-[14px] flex items-center"><Bell size={16} className="mr-2" /> Lembretes Pendentes</h2>
                 <Link to="/reminders" className="text-[12px] font-bold text-ric-blue hover:underline flex items-center">Abrir aba <ChevronRight size={14}/></Link>
               </div>
               <div className="p-4 flex-1">
                 {unreadReminders.length > 0 ? (
                    <div className="space-y-3">
                       {unreadReminders.slice(0, 3).map(rem => (
                          <div key={rem.id} className="bg-gray-50 border border-gray-200 rounded-[6px] p-3 shadow-sm text-[13px]">
                             <p className="text-ric-text mb-1 font-medium">{rem.text}</p>
                             <div className="flex justify-between text-[11px] text-ric-muted">
                               <span>De: {getUserName(rem.fromId)}</span>
                               <span>{rem.createdAt ? format(rem.createdAt, 'dd/MM/yyyy HH:mm') : ''}</span>
                             </div>
                          </div>
                       ))}
                       {unreadReminders.length > 3 && (
                          <p className="text-[12px] text-center text-ric-muted mt-2 font-medium">+{unreadReminders.length - 3} lembretes ocultos...</p>
                       )}
                    </div>
                 ) : (
                    <p className="text-[13px] text-ric-muted text-center py-4">Nenhum lembrete pendente.</p>
                 )}
               </div>
            </div>

            {/* Checklist Shortcut */}
            <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden flex flex-col">
               <div className="bg-[#FEF2F2] px-4 py-3 border-b border-ric-border flex justify-between items-center">
                 <h2 className="font-bold text-ric-red uppercase tracking-wider text-[14px] flex items-center"><CheckSquare size={16} className="mr-2" /> Checklist Diário</h2>
               </div>
               <div className="p-6 flex-1 flex flex-col justify-center items-center text-center">
                  <div className="relative mb-4">
                     <div className="w-20 h-20 rounded-full border-4 border-gray-100 flex items-center justify-center">
                        <span className="text-xl font-bold text-ric-text">{checklistProgress}%</span>
                     </div>
                     <div className="absolute inset-0">
                        <svg className="w-20 h-20 transform -rotate-90">
                           <circle cx="40" cy="40" r="38" stroke="currentColor" strokeWidth="4" fill="transparent"
                                   className="text-ric-red opacity-100"
                                   strokeDasharray={238.76}
                                   strokeDashoffset={238.76 - (238.76 * checklistProgress) / 100}
                                   strokeLinecap="round" />
                        </svg>
                     </div>
                  </div>
                  
                  <p className="text-[14px] text-ric-text mb-4">
                    Você completou {myChecklistStats.checked} de {myChecklistStats.total} tarefas essenciais hoje.
                  </p>
                  <Link to="/checklist" className="bg-ric-red text-white font-bold py-2 px-6 rounded-[4px] uppercase text-[12px] hover:bg-[#CC0000] transition-colors">
                    Acessar e Marcar Checklist
                  </Link>
               </div>
            </div>
        </div>


     </div>
  );
}
