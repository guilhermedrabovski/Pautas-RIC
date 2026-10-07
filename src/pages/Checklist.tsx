import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Trash2, Plus, Save, CalendarPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Checklist() {
  const { userData } = useAuth();
  const dateStr = format(new Date(), 'yyyy-MM-dd');
  
  // Custom checklist items config
  const [template, setTemplate] = useState<string[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  
  // Handover specific tasks
  const [handoverTasks, setHandoverTasks] = useState<any[]>([]);
  const navigate = useNavigate();

  const templateRefId = userData?.uid || 'default';
  const runRefId = `${userData?.uid}_${dateStr}`;

  useEffect(() => {
    if (!userData) return;
    
    // Load template
    getDoc(doc(db, 'checklistTemplates', templateRefId)).then(snap => {
      if (snap.exists()) {
        setTemplate(snap.data().items || []);
      } else {
        const initial = ["Verificar emails", "Checar pautas pendentes", "Confirmar equipamentos"];
        setTemplate(initial);
        setDoc(doc(db, 'checklistTemplates', templateRefId), { userId: userData.uid, items: initial, updatedAt: Date.now() });
      }
    });

    // Load run
    getDoc(doc(db, 'checklistRuns', runRefId)).then(snap => {
      if (snap.exists()) {
        setCompleted(snap.data().completedItems || []);
      }
    });

    // Subscribe to Handovers for tagged tasks
    const q = query(collection(db, 'handovers'), orderBy('createdAt', 'desc'), limit(15));
    const unsub = onSnapshot(q, snap => {
      const allTasks: any[] = [];
      snap.docs.forEach(d => {
        const hData = d.data();
        if (hData.tasks) {
          hData.tasks.forEach((t: any) => {
            if (t.markedUser === userData.uid) {
              allTasks.push({
                handoverId: d.id,
                ...t,
                handoverDate: hData.date,
                handoverShift: hData.shift
              });
            }
          });
        }
      });
      setHandoverTasks(allTasks);
    });

    return () => unsub();
  }, [userData, dateStr]);

  const toggleItem = async (item: string) => {
    const isCompleted = completed.includes(item);
    const updated = isCompleted ? completed.filter(i => i !== item) : [...completed, item];
    setCompleted(updated);
    
    await setDoc(doc(db, 'checklistRuns', runRefId), {
      userId: userData?.uid,
      date: dateStr,
      completedItems: updated,
      updatedAt: Date.now()
    });
  };

  const addTemplateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.trim()) return;
    
    const updated = [...template, newItem.trim()];
    setTemplate(updated);
    setNewItem('');
    
    await setDoc(doc(db, 'checklistTemplates', templateRefId), {
      userId: userData?.uid,
      items: updated,
      updatedAt: Date.now()
    });
  };

  const removeTemplateItem = async (itemToRemove: string) => {
    const updated = template.filter(i => i !== itemToRemove);
    setTemplate(updated);
    const updatedCompleted = completed.filter(i => i !== itemToRemove);
    setCompleted(updatedCompleted);
    
    await setDoc(doc(db, 'checklistTemplates', templateRefId), {
        userId: userData?.uid,
        items: updated,
        updatedAt: Date.now()
    });
    await setDoc(doc(db, 'checklistRuns', runRefId), {
        userId: userData?.uid,
        date: dateStr,
        completedItems: updatedCompleted,
        updatedAt: Date.now()
    });
  };

  const toggleHandoverTask = async (task: any) => {
    try {
      const newStatus = task.status === 'pendente' || task.status === 'urgente' ? 'finalizado' : 'pendente';
      const snap = await getDoc(doc(db, 'handovers', task.handoverId));
      if (!snap.exists()) return;
      
      const hData = snap.data();
      const updatedTasks = (hData.tasks || []).map((t: any) => {
        if (t.id === task.id) {
          return { ...t, status: newStatus, statusUpdatedBy: userData?.uid, statusUpdatedAt: Date.now() };
        }
        return t;
      });
      
      await updateDoc(doc(db, 'handovers', task.handoverId), { tasks: updatedTasks });
      toast.success('Status da tarefa atualizado!');
    } catch (e: any) {
      toast.error('Erro ao atualizar: ' + e.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-[15px]">
      {handoverTasks.length > 0 && (
        <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-[20px] border border-ric-border border-t-[4px] border-t-amber-500 mb-6">
          <h2 className="text-[18px] font-bold text-ric-text mb-1 uppercase tracking-wider flex items-center gap-2">
            <CalendarPlus size={20} className="text-amber-500" />
            Tarefas de Plantões
          </h2>
          <p className="text-[13px] text-ric-muted mb-6">Tarefas onde você foi marcado no Relatório de Plantão.</p>
          
          <div className="space-y-[8px]">
            {handoverTasks.map((task, idx) => {
              const isFinished = task.status === 'finalizado';
              return (
              <div key={idx} className={`flex items-center justify-between p-[12px] border rounded-[6px] transition-colors ${
                isFinished ? 'bg-[#DCFCE7] border-ric-green' : 'bg-white border-[#F0F2F5] hover:bg-gray-50'
              }`}>
                <label className="flex items-center flex-1 cursor-pointer pr-4">
                  <input 
                    type="checkbox" 
                    checked={isFinished}
                    onChange={() => toggleHandoverTask(task)}
                    className="w-[16px] h-[16px] text-ric-green rounded-[3px] border-ric-border focus:ring-ric-green bg-ric-bg"
                  />
                  <div className="ml-[10px]">
                    <span className={`block text-[13px] font-medium ${isFinished ? 'line-through text-ric-green opacity-80 font-bold' : 'text-ric-text'}`}>
                      {task.subject || 'Sem Assunto'}
                    </span>
                    {task.description && (
                      <span className="block text-[11px] text-ric-muted mt-1 leading-tight">{task.description}</span>
                    )}
                  </div>
                </label>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase">
                    {format(new Date(task.handoverDate + 'T12:00:00'), 'dd/MM/yyyy')} - {task.handoverShift}
                  </span>
                  <button 
                    onClick={() => navigate('/handovers')}
                    className="text-[11px] text-ric-blue hover:underline uppercase font-bold"
                  >
                    Ver Relatório
                  </button>
                </div>
              </div>
            )})}
          </div>
        </div>
      )}

      <div className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-[20px] border border-ric-border border-t-[4px] border-t-ric-red">
        <h2 className="text-[18px] font-bold text-ric-text mb-1 uppercase tracking-wider">Checklist de Rotina ({format(new Date(), 'dd/MM/yyyy')})</h2>
        <p className="text-[13px] text-ric-muted mb-6">O que deve ser feito ao chegar na TV</p>
        
        <div className="space-y-[8px] mb-[20px]">
          {template.map((item, idx) => {
            const isFinished = completed.includes(item);
            return (
            <div key={idx} className={`flex items-center justify-between p-[12px] border rounded-[6px] transition-colors ${
              isFinished ? 'bg-[#DCFCE7] border-ric-green' : 'bg-ric-card border-[#F0F2F5] hover:bg-gray-50'
            }`}>
              <label className="flex items-center flex-1 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isFinished}
                  onChange={() => toggleItem(item)}
                  className="w-[16px] h-[16px] text-ric-green rounded-[3px] border-ric-border focus:ring-ric-green bg-ric-bg"
                />
                <span className={`ml-[10px] text-[13px] font-medium ${isFinished ? 'line-through text-ric-green opacity-80 font-bold' : 'text-ric-text'}`}>
                  {item}
                </span>
              </label>
              <button onClick={() => removeTemplateItem(item)} className={`${isFinished ? 'text-ric-green hover:text-ric-red' : 'text-ric-border hover:text-ric-red'} p-1`}>
                <Trash2 size={16} />
              </button>
            </div>
          )})}
          {template.length === 0 && <p className="text-ric-muted italic text-[13px]">Sua lista está vazia.</p>}
        </div>

        <form onSubmit={addTemplateItem} className="flex gap-[10px]">
          <input 
            type="text" 
            value={newItem} 
            onChange={e => setNewItem(e.target.value)}
            className="flex-1 rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[10px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]"
            placeholder="Adicionar novo item de rotina..."
          />
          <button type="submit" className="bg-ric-blue text-white px-[20px] py-[10px] rounded-[4px] font-bold hover:bg-[#002244] flex items-center text-[13px] uppercase cursor-pointer">
            <Plus size={16} className="mr-2"/> Adicionar
          </button>
        </form>
      </div>
    </div>
  );
}
