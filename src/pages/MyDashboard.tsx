import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { Flame, TrendingUp, CheckSquare, Check } from 'lucide-react';

export default function MyDashboard() {
  const { userData } = useAuth();
  const [agendas, setAgendas] = useState<any[]>([]);
  const [dateFilter, setDateFilter] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [checklistTemplate, setChecklistTemplate] = useState<string[]>([]);
  const [checklistCompleted, setChecklistCompleted] = useState<string[]>([]);

  useEffect(() => {
    if(!userData) return;
    const qAgendas = query(
      collection(db, 'agendas'),
      where('date', '==', dateFilter),
      where('reporterId', '==', userData.uid)
    );

    const unsub = onSnapshot(qAgendas, snapshot => {
      setAgendas(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => b.createdAt - a.createdAt));
    });

    // Checklists fetch
    const fetchTpl = onSnapshot(doc(db, 'checklistTemplates', userData.uid), snap => {
       setChecklistTemplate(snap.exists() ? snap.data().items || [] : ["Verificar emails", "Checar pautas pendentes", "Confirmar equipamentos"]);
    });
    
    const fetchRun = onSnapshot(doc(db, 'checklistRuns', `${userData.uid}_${dateFilter}`), snap => {
       setChecklistCompleted(snap.exists() ? snap.data().completedItems || [] : []);
    });

    return () => { unsub(); fetchTpl(); fetchRun(); };
  }, [dateFilter, userData]);

  const mochilinks = agendas.filter(a => a.isMochilink && (a.status === 'approved' || a.status === 'in_progress'));
  const vts = agendas.filter(a => !a.isMochilink && (a.status === 'approved' || a.status === 'in_progress'));
  const pendings = agendas.filter(a => a.status === 'pending');

  const toggleChecklistItem = async (item: string) => {
    if (!userData) return;
    const isCompleted = checklistCompleted.includes(item);
    const updated = isCompleted ? checklistCompleted.filter(i => i !== item) : [...checklistCompleted, item];
    
    setChecklistCompleted(updated);
    
    const runRefId = `${userData.uid}_${dateFilter}`;
    try {
      await updateDoc(doc(db, 'checklistRuns', runRefId), {
        completedItems: updated,
        updatedAt: Date.now()
      });
    } catch(e: any) {
      if (e.code === 'not-found') {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(doc(db, 'checklistRuns', runRefId), {
          userId: userData.uid,
          date: dateFilter,
          completedItems: updated,
          updatedAt: Date.now()
        });
      }
    }
  };

  const toggleTaskStatus = async (id: string, currentStatus: string) => {
    try {
      await updateDoc(doc(db, 'agendas', id), { taskStatus: currentStatus === 'completed' ? 'pending' : 'completed', updatedAt: Date.now() });
    } catch (e) {}
  };

  const renderCard = (a: any) => (
    <div key={a.id} className={`${a.taskStatus === 'completed' ? 'bg-[#D1FAE5] border-[#059669]' : 'bg-[#FFEDD5] border-[#EA580C]'} p-[15px] border flex flex-col gap-2 relative group hover:opacity-90 transition-opacity rounded-[6px] mb-3 mx-3 mt-1 shadow-sm`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`font-mono text-[11px] px-2 py-[2px] rounded-[3px] font-bold text-center uppercase ${a.taskStatus === 'completed' ? 'bg-[#059669] text-white' : 'bg-white/70 text-[#9A3412]'}`}>{a.slug}</span>
        <div className="flex items-center space-x-2">
          {a.continuing && <span className="text-[9px] bg-ric-red text-white px-1 py-[1px] rounded-[2px] uppercase ml-1" title="Matéria em continuidade">Continuidade</span>}
          {a.audienceSuccess && <span className="text-[11px] text-[#D48806] font-medium" title="Marcado como sucesso de audiência!">Destaque 📈</span>}
        </div>
      </div>
      <h4 className={`text-[14px] font-bold leading-tight mb-1 ${a.taskStatus === 'completed' ? 'text-[#065F46] line-through opacity-70' : 'text-[#9A3412]'}`}>{a.title}</h4>
      <p className={`text-[12px] line-clamp-2 mb-2 ${a.taskStatus === 'completed' ? 'text-[#065F46]/80' : 'text-[#9A3412]/80'}`}>{a.description}</p>
      
      <div className={`mt-1 pt-3 border-t ${a.taskStatus === 'completed' ? 'border-[#065F46]/20' : 'border-[#9A3412]/20'} flex items-center justify-between text-[12px] font-medium`}>
        <div className={a.taskStatus === 'completed' ? 'text-[#065F46]/90' : 'text-[#9A3412]/90'}>
          Cinegrafista: {a.cinegrafistaId || 'A definir'}
        </div>
        <button 
          onClick={() => toggleTaskStatus(a.id, a.taskStatus)}
          className={`px-3 py-1 text-[11px] font-bold rounded-[4px] uppercase transition-colors ${a.taskStatus === 'completed' ? 'bg-white text-[#059669] hover:bg-gray-50' : 'bg-[#EA580C] text-white hover:bg-[#C2410C]'}`}
        >
          {a.taskStatus === 'completed' ? '✓ Concluído' : 'Marcar como Concluído'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-[15px]">
      <div className="flex flex-col sm:flex-row justify-between items-center bg-ric-card border border-ric-border shadow-[0_1px_3px_rgba(0,0,0,0.1)] rounded-[8px] p-[20px]">
        <div>
          <h2 className="text-[20px] font-bold text-ric-text">Olá, {userData?.name ? userData.name.split(' ')[0] : (userData?.email ? userData.email.split('@')[0] : 'Colaborador')}</h2>
          <p className="text-[14px] text-ric-muted mt-1">Veja suas pautas escaladas para o dia</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <input 
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-[4px] border-ric-border shadow-sm text-[14px] px-4 py-2 bg-ric-bg"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px]">
        {checklistTemplate.length > 0 && (
          <div className="bg-ric-card border border-ric-border rounded-[8px] overflow-hidden md:col-span-2">
             <div className="flex items-center justify-between p-[15px] border-b border-ric-border bg-[#FEF2F2]">
               <h3 className="text-[16px] font-bold text-ric-red flex items-center"><CheckSquare size={16} className="mr-2" /> Tarefas de Hoje (Checklist)</h3>
             </div>
             <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
               {checklistTemplate.map((item, idx) => {
                 const isCompleted = checklistCompleted.includes(item);
                 return (
                   <div key={`chk-${idx}`} className={`flex items-center justify-between p-3 rounded-[6px] border ${isCompleted ? 'bg-[#F0FDF4] border-[#86EFAC]' : 'bg-[#FEF2F2] border-[#FECACA]'} shadow-sm transition-colors`}>
                     <div className="flex items-center gap-3 w-full">
                       <button onClick={() => toggleChecklistItem(item)} className={`flex-shrink-0 w-10 h-10 rounded border-2 flex items-center justify-center transition-colors ${isCompleted ? 'bg-[#059669] border-[#059669] text-white' : 'border-[#EF4444] bg-white hover:bg-red-50 text-transparent'}`}>
                         <Check size={20} />
                       </button>
                       <div className={`flex-1 font-bold text-[13px] ${isCompleted ? 'opacity-70 line-through text-[#065F46]' : 'text-[#B91C1C]'}`}>
                         {item}
                       </div>
                     </div>
                   </div>
                 );
               })}
             </div>
          </div>
        )}

        <div className="bg-ric-card border border-ric-border rounded-[8px] overflow-hidden">
           <div className="flex items-center justify-between p-[15px] border-b border-ric-border bg-ric-card">
             <div className="flex items-center space-x-2">
               <h3 className="text-[16px] font-bold text-ric-blue">Seus Mochilinks (Ao vivo)</h3>
             </div>
             <span className="bg-[#E3F2FD] text-[#1976D2] text-[11px] font-bold px-[8px] py-[2px] rounded-full">{mochilinks.length}</span>
           </div>
           
           {mochilinks.length > 0 ? (
             <div className="flex flex-col py-3">
               {mochilinks.map(renderCard)}
             </div>
           ) : (
             <div className="p-[20px] text-center text-ric-muted text-[13px]">
               Nenhum mochilink aprovado para hoje.
             </div>
           )}
        </div>

        <div className="bg-ric-card border border-ric-border rounded-[8px] overflow-hidden">
           <div className="flex items-center justify-between p-[15px] border-b border-ric-border bg-ric-card">
             <div className="flex items-center space-x-2">
               <h3 className="text-[16px] font-bold text-ric-text">Seus VTs (Gravadas)</h3>
             </div>
             <span className="bg-ric-bg text-ric-muted text-[11px] font-bold px-[8px] py-[2px] rounded-full">{vts.length}</span>
           </div>
           
           {vts.length > 0 ? (
             <div className="flex flex-col py-3">
               {vts.map(renderCard)}
             </div>
           ) : (
             <div className="p-[20px] text-center text-ric-muted text-[13px]">
               Nenhum VT aprovado para hoje.
             </div>
           )}
        </div>

        {pendings.length > 0 && (
          <div className="bg-ric-card border border-ric-border rounded-[8px] overflow-hidden md:col-span-2 mt-4">
             <div className="flex items-center justify-between p-[15px] border-b border-ric-border bg-orange-50">
               <div className="flex items-center space-x-2">
                 <h3 className="text-[16px] font-bold text-orange-700">⏳ Aguardando Aprovação</h3>
               </div>
               <span className="bg-orange-200 text-orange-800 text-[11px] font-bold px-[8px] py-[2px] rounded-full">{pendings.length}</span>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2">
               {pendings.map(renderCard)}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
