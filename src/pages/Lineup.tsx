import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format } from 'date-fns';
import { useAuth, UserData } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import { Plus, Trash2, Calendar as CalendarIcon, ListPlus, CornerDownRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';

const baseInputClass = "w-full border border-transparent hover:border-ric-border focus:border-ric-red focus:bg-white bg-transparent rounded-[4px] px-2 py-2.5 text-[14px] md:text-[13px] outline-none transition-colors cursor-pointer focus:cursor-text min-h-[44px]";

const LineupRow = ({ item, index, previousItem, reporters, updateItem, removeItem, displayNames }: any) => {
  const [details, setDetails] = useState(item.details || '');
  const [retranca, setRetranca] = useState(item.retranca || item.agendaId || '');

  useEffect(() => {
    setDetails(item.details || '');
  }, [item.details]);

  useEffect(() => {
    setRetranca(item.retranca || item.agendaId || '');
  }, [item.retranca, item.agendaId]);

  const isDuplicateTime = index > 0 && previousItem?.time === item.time;
  const is1130 = item.time === '11:30';

  return (
    <tr className={`transition-colors border-b border-gray-100 group ${is1130 ? 'bg-[#FFF8E7] hover:bg-[#FFF2D0]' : 'bg-white hover:bg-gray-50'}`}>
      <td className="px-2 py-1.5 align-top">
        {isDuplicateTime ? (
           <div className="flex items-center justify-end pr-4 text-gray-300 h-[44px]">
             <CornerDownRight size={16} />
           </div>
        ) : (
          <input type="time" value={item.time} onChange={(e) => updateItem(item.id, 'time', e.target.value)} className={`${baseInputClass} font-bold font-mono text-[14px]`} />
        )}
      </td>
      <td className="px-2 py-1.5">
        <input 
          type="text" 
          value={retranca} 
          onChange={e => setRetranca(e.target.value)} 
          onBlur={() => { if(retranca !== (item.retranca || item.agendaId)) updateItem(item.id, 'retranca', retranca) }} 
          className={`${baseInputClass} font-bold text-ric-text`} 
          placeholder="Ex: Assalto no Centro..." 
        />
      </td>
      <td className="px-2 py-1.5">
        <select value={item.reporterId || ''} onChange={(e) => updateItem(item.id, 'reporterId', e.target.value)} className={`${baseInputClass} ${!item.reporterId ? 'text-ric-muted' : 'text-ric-text'}`}>
            <option value="" className="text-ric-muted">(Nenhum)</option>
            {reporters.map((r: any) => <option key={r.uid} value={r.uid} className="text-ric-text">{displayNames[r.uid] || r.name}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select value={item.type || 'VT'} onChange={(e) => updateItem(item.id, 'type', e.target.value)} className={`${baseInputClass} text-ric-blue font-bold`}>
            <option value="VT">VT</option>
            <option value="Mochilink">Mochilink</option>
            <option value="VT + MOCHI">VT + MOCHI</option>
            <option value="Estúdio">Estúdio</option>
            <option value="Passagem">Passagem</option>
            <option value="Off">Off</option>
            <option value="Sonora">Sonora</option>
            <option value="Arte">Arte</option>
            <option value="CA / Nota">CA / Nota</option>
            <option value="Frio">Frio</option>
        </select>
      </td>
      <td className="px-2 py-1.5">
        <input type="text" value={details} onChange={e => setDetails(e.target.value)} onBlur={() => { if(details !== item.details) updateItem(item.id, 'details', details) }} className={baseInputClass} placeholder="Digite alguma observação..." />
      </td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">
        <button onClick={() => removeItem(item.id)} className="p-1.5 text-ric-muted hover:text-ric-red hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"><Trash2 size={16}/></button>
      </td>
    </tr>
  );
};

export default function Lineup() {
  const { userData, users } = useAuth();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [lineupItems, setLineupItems] = useState<any[]>([]);
  const displayNames = getDisplayNames(users);
  const hasImported = useRef(false);
  
  useEffect(() => {
    let isMounted = true;
    let unsubLineup = () => {};
    hasImported.current = false; // Reset when date changes

    const loadData = async () => {
      const qLineup = query(collection(db, 'lineup'), where('date', '==', date));
      const initialSnap = await getDocs(qLineup);

      if (initialSnap.empty && isMounted && !hasImported.current) {
        hasImported.current = true;
        
        let times = [
          { time: '11:30' },
          { time: '11:30' },
          { time: '11:30' },
          { time: '11:30' },
          { time: '12:00' },
          { time: '12:20' }
        ];

        try {
          const defaultSnap = await getDoc(doc(db, 'settings', 'defaultLineup'));
          if (defaultSnap.exists() && defaultSnap.data().times && defaultSnap.data().times.length > 0) {
            times = defaultSnap.data().times;
          }
        } catch (e) {
          console.error('Failed to fetch default lineup settings', e);
        }

        const uniqueTimes = Array.from(new Set(times.map((t: any) => t.time)));
        let finalTimes: any[] = [];
        uniqueTimes.forEach(t => {
           if (t === '11:30') {
             finalTimes.push({ time: t }, { time: t }, { time: t }, { time: t });
           } else {
             finalTimes.push({ time: t });
           }
        });
        finalTimes.sort((a,b) => a.time.localeCompare(b.time));

        const batch = writeBatch(db);
        finalTimes.forEach((t: any) => {
          const newRef = doc(collection(db, 'lineup'));
          batch.set(newRef, {
            date,
            time: t.time || '12:00',
            retranca: '',
            reporterId: '',
            type: 'VT',
            details: '',
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        });
        await batch.commit();
      }

      if (!isMounted) return;

      unsubLineup = onSnapshot(qLineup, (snap) => {
        let items = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        if (isMounted) {
           setLineupItems(items.sort((a,b) => a.time.localeCompare(b.time)));
        }
      });
    };

    loadData();

    return () => { isMounted = false; unsubLineup(); };
  }, [date]);

  const updateItem = async (id: string, field: string, value: any) => {
    try {
      await updateDoc(doc(db, 'lineup', id), { [field]: value, updatedAt: Date.now() });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const addItem = async () => {
    try {
      const lastTime = lineupItems.length > 0 ? lineupItems[lineupItems.length - 1].time : '12:00';
      await addDoc(collection(db, 'lineup'), {
        date,
        time: lastTime,
        retranca: '',
        reporterId: '',
        type: 'VT',
        details: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const importDefaultsManual = async () => {
    confirmAction('Gostaria de recarregar os horários padrões para o dia atual? Isto irá apagar todos os itens atuais desta data e recarregar o formato original.', async () => {
      try {
        let times = [
          { time: '11:30' },
          { time: '11:30' },
          { time: '11:30' },
          { time: '11:30' },
          { time: '12:00' },
          { time: '12:20' }
        ];

        const defaultSnap = await getDoc(doc(db, 'settings', 'defaultLineup'));
        if (defaultSnap.exists() && defaultSnap.data().times && defaultSnap.data().times.length > 0) {
          times = defaultSnap.data().times;
        }

        const uniqueTimes = Array.from(new Set(times.map((t: any) => t.time)));
        let finalTimes: any[] = [];
        uniqueTimes.forEach(t => {
           if (t === '11:30') {
             finalTimes.push({ time: t }, { time: t }, { time: t }, { time: t });
           } else {
             finalTimes.push({ time: t });
           }
        });
        finalTimes.sort((a,b) => a.time.localeCompare(b.time));

        const batch = writeBatch(db);
        
        // Remove existing items for this date to avoid duplication
        const qLineup = query(collection(db, 'lineup'), where('date', '==', date));
        const existingSnap = await getDocs(qLineup);
        existingSnap.docs.forEach(doc => {
          batch.delete(doc.ref);
        });

        finalTimes.forEach((t: any) => {
          const newRef = doc(collection(db, 'lineup'));
          batch.set(newRef, {
            date,
            time: t.time || '12:00',
            retranca: '',
            reporterId: '',
            type: 'VT',
            details: '',
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        });
        await batch.commit();
        toast.success('Horários importados!');
      } catch(err: any) {
        toast.error('Erro na importação: ' + err.message);
      }
    });
  };

  const removeItem = async (id: string) => {
    if (userData?.role !== 'admin') {
      return toast.error('Apenas administradores podem apagar itens do espelho.');
    }
    confirmAction('Remover esta linha do espelho?', async () => {
      try {
        await deleteDoc(doc(db, 'lineup', id));
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const isManager = userData?.role === 'admin' || userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira';
  const reporters = users.filter(u => u.role === 'reporter');

  if (!isManager && userData) {
    return <div className="p-4 text-center">Acesso negado. Apenas editores e administradores podem ver a Reunião de Pauta.</div>;
  }

  return (
    <div className="space-y-[15px] pb-10">
      <div className="bg-white rounded-[8px] p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-ric-text uppercase tracking-wider">Reunião de Pauta (Espelho)</h1>
          <p className="text-[13px] text-ric-muted mt-1">Previsão e organização do conteúdo que vai ao ar</p>
        </div>
        <div className="flex gap-3 items-center flex-wrap">
          <div className="flex items-center gap-2 bg-[#F8F9FA] px-3 py-1.5 rounded-[4px] border border-ric-border">
            <CalendarIcon size={16} className="text-ric-muted" />
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none text-[14px] font-bold text-ric-text outline-none cursor-pointer"
            />
          </div>
          <button onClick={importDefaultsManual} className="bg-white border border-ric-border text-ric-text px-[15px] py-[8px] rounded-[4px] font-bold text-[12px] uppercase transition-colors hover:bg-gray-50 flex items-center shadow-sm cursor-pointer">
            <ListPlus size={14} className="mr-2" /> Importar Padrões
          </button>
          <button onClick={addItem} className="bg-ric-blue text-white px-[15px] py-[8px] rounded-[4px] font-bold flex items-center hover:bg-[#002244] text-[12px] uppercase transition-colors shadow-sm cursor-pointer">
            <Plus size={14} className="mr-2" /> Adicionar Linha
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden">
        {lineupItems.length === 0 ? (
          <div className="p-12 text-center bg-[#F8F9FA]">
            <p className="text-ric-muted text-[14px] font-medium animate-pulse">Carregando espelho ou base vazia...</p>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[400px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-[#F8F9FA]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider w-[120px]">Horário</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider w-[220px]">Retranca (Pauta)</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider w-[180px]">Repórter</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider w-[160px]">Formato</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider min-w-[200px]">Detalhes / Obs (Sai e Salva)</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-ric-muted uppercase tracking-wider w-[60px]"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {lineupItems.map((item, index) => (
                  <LineupRow 
                    key={item.id} 
                    item={item} 
                    index={index}
                    previousItem={index > 0 ? lineupItems[index - 1] : null}
                    reporters={reporters} 
                    updateItem={updateItem} 
                    removeItem={removeItem} 
                    displayNames={displayNames}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
