import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDocs, updateDoc, addDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserData, useAuth } from '../contexts/AuthContext';
import { format, parseISO, addDays, isWeekend } from 'date-fns';
import { getDisplayNames, isUserScaleOwner } from '../lib/userUtils';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';
import { RefreshCw, CheckCircle, XCircle, Trash2, CalendarPlus, X, Download, ClipboardList, Plus, ShieldCheck } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Scales() {
  const { userData, user, users } = useAuth();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [shiftTrades, setShiftTrades] = useState<any[]>([]);
  
  // Real data for all dates in view
  const [scales, setScales] = useState<any[]>([]);
  const [pauteiroScales, setPauteiroScales] = useState<any[]>([]);
  const [weekendChefiaId, setWeekendChefiaId] = useState('');
  const [weekendApresentadorId, setWeekendApresentadorId] = useState('');
  const [weekendEditorId, setWeekendEditorId] = useState('');
  
  // UI state
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [scaleToTrade, setScaleToTrade] = useState<any>(null);
  const [tradeTargetUserId, setTradeTargetUserId] = useState('');
  const [isTradingPauteiro, setIsTradingPauteiro] = useState(false);

  const [showReporterForm, setShowReporterForm] = useState<string | null>(null);
  const [showPauteiroForm, setShowPauteiroForm] = useState<string | null>(null);

  const [newScale, setNewScale] = useState({ shift: 'Manhã', time: '07:00 - 16:00', reporterId: '', cinegrafistaId: '', pauteiroId: '', dateTarget: '', observation: '' });
  const [newPauteiroScale, setNewPauteiroScale] = useState({ shift: 'Manhã', time: '07:00 - 16:00', pauteiroId: '', dateTarget: '' });
  
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [scaleToEdit, setScaleToEdit] = useState<any>(null);
  const [isEditingPauteiroScale, setIsEditingPauteiroScale] = useState(false);

  const dayOfWeek = parseISO(date).getDay();
  const isWeekendDay = isWeekend(parseISO(date));
  let satDate = date;
  let sunDate = '';
  
  if (isWeekendDay) {
    satDate = dayOfWeek === 6 ? date : format(addDays(parseISO(date), -1), 'yyyy-MM-dd');
    sunDate = dayOfWeek === 0 ? date : format(addDays(parseISO(date), 1), 'yyyy-MM-dd');
  }
  const viewDates = isWeekendDay ? [satDate, sunDate] : [date];

  useEffect(() => {
    const q3 = query(collection(db, 'shiftTrades'), where('status', 'in', ['pending_target', 'pending_admin']));
    const unsub3 = onSnapshot(q3, snap => {
      setShiftTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsub3(); };
  }, []);

  useEffect(() => {
    const q1 = query(collection(db, 'schedules'), where('date', 'in', viewDates));
    const unsub1 = onSnapshot(q1, snap => {
      setScales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const q2 = query(collection(db, 'pauteiroSchedules'), where('date', 'in', viewDates));
    const unsub2 = onSnapshot(q2, snap => {
      setPauteiroScales(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    let unsub3 = () => {};
    if (isWeekendDay) {
      unsub3 = onSnapshot(doc(db, 'scale_meta', satDate), docSnap => {
        if (docSnap.exists()) {
           const data = docSnap.data();
           setWeekendChefiaId(data.chefiaId || '');
           setWeekendApresentadorId(data.apresentadorId || '');
           setWeekendEditorId(data.editorId || '');
        } else {
           setWeekendChefiaId('');
           setWeekendApresentadorId('');
           setWeekendEditorId('');
        }
      });
    }

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [date, isWeekendDay, satDate]); // dependency on date to refetch when dates change

  const handleCreateTradeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scaleToTrade || !tradeTargetUserId) return toast.error('Selecione o substituto');
    try {
      await addDoc(collection(db, 'shiftTrades'), {
        scaleId: scaleToTrade.id,
        isPauteiroScale: isTradingPauteiro,
        requesterId: user?.uid,
        targetUserId: tradeTargetUserId,
        date: scaleToTrade.date,
        shift: scaleToTrade.shift,
        time: scaleToTrade.time,
        status: 'pending_target',
        createdAt: Date.now()
      });
      toast.success('Solicitação enviada para o seu colega!');
      setTradeModalOpen(false);
      setScaleToTrade(null);
      setTradeTargetUserId('');
    } catch (err: any) { toast.error('Erro ao solicitar troca'); }
  };

  const handleTargetApproveTrade = async (tradeId: string) => {
    confirmAction('Aceitar assumir este turno?', async () => {
      try {
        await updateDoc(doc(db, 'shiftTrades', tradeId), { status: 'pending_admin' });
        toast.success('Aceito! Agora aguarda aprovação da chefia.');
      } catch (error: any) {
        toast.error('Erro ao aceitar troca');
      }
    });
  };

  const getUserName = (id: string, role: string) => {
    if (!id) return '-';
    // Se for um ID de usuário, busca o nome
    const u = users.find(u => u.uid === id);
    if (u) return displayNames[u.uid] || u.name || id;
    
    // Fallback: se for um nome guardado diretamente
    return id;
  };

  const displayNames = getDisplayNames(users);

  const handleApproveTrade = async (trade: any) => {
    const targetUser = users.find(u => u.uid === trade.targetUserId);
    if (!targetUser) return toast.error('Usuário alvo não encontrado');

    const hasConflict = trade.isPauteiroScale 
      ? pauteiroScales.some(s => s.date === trade.date && isUserScaleOwner(s.pauteiroId, targetUser))
      : scales.some(s => s.date === trade.date && (isUserScaleOwner(s.reporterId, targetUser) || s.cinegrafistaId === targetUser.name));

    const confirmMsg = hasConflict 
      ? `${targetUser.name} já possui escala no dia ${format(parseISO(trade.date), 'dd/MM/yyyy')}. Aprovar troca mesmo assim (dobra)?`
      : 'Aprovar esta troca e atualizar a escala?';

    confirmAction(confirmMsg, async () => {
      try {
        const collName = trade.isPauteiroScale ? 'pauteiroSchedules' : 'schedules';
        
        const tradeInfoStr = `Trocado (Aut: ${userData?.name?.split(' ')[0] || 'Admin'})`;
        const payload: any = { 
          tradeInfo: tradeInfoStr,
          updatedAt: Date.now(),
          updatedBy: userData?.uid,
          updatedByName: userData?.name || 'Sistema'
        };
        
        if (trade.isPauteiroScale) {
          payload.pauteiroId = targetUser.name;
        } else {
          const scaleDocSnap = await getDoc(doc(db, collName, trade.scaleId));
          if (scaleDocSnap.exists()) {
             const scaleDoc = scaleDocSnap.data();
             if (scaleDoc.reporterId === getUserName(trade.requesterId, 'all')) {
               payload.reporterId = targetUser.name;
             } else if (scaleDoc.cinegrafistaId === getUserName(trade.requesterId, 'all')) {
               payload.cinegrafistaId = targetUser.name;
             } else {
               payload.reporterId = targetUser.name; // fallback
             }
          }
        }
        
        await updateDoc(doc(db, collName, trade.scaleId), payload);
        await updateDoc(doc(db, 'shiftTrades', trade.id), { status: 'approved', authorizedBy: user?.uid });
        toast.success('Troca aprovada!');
      } catch (error: any) {
        toast.error('Erro ao aprovar troca');
      }
    });
  };

  const handleRejectTrade = async (tradeId: string, isTarget: boolean = false) => {
    confirmAction('Rejeitar esta troca?', async () => {
      try {
        await updateDoc(doc(db, 'shiftTrades', tradeId), { status: 'rejected' });
        toast.success('Troca rejeitada!');
      } catch (error: any) {
        toast.error('Erro ao rejeitar troca');
      }
    });
  };

  const handleWeekendMetaChange = async (field: string, val: string) => {
    if (field === 'chefiaId') setWeekendChefiaId(val);
    if (field === 'apresentadorId') setWeekendApresentadorId(val);
    if (field === 'editorId') setWeekendEditorId(val);
    try {
      await setDoc(doc(db, 'scale_meta', satDate), { [field]: val }, { merge: true });
      toast.success('Atualizado com sucesso');
    } catch (err: any) { toast.error('Erro ao atualizar'); }
  };

  const isManager = () => {
    if (!userData) return false;
    const nameStr = (userData.name || '').toLowerCase();
    const managers = ['guilherme', 'luana', 'ivete', 'fabio', 'weslley'];
    return managers.some(m => nameStr.includes(m)) || ['admin', 'editor', 'pauteiro', 'pauteira'].includes(userData.role);
  };

  const reporters = users.filter(u => u.role === 'reporter').sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  const cinegrafistas = users.filter(u => u.role === 'cinegrafista').sort((a,b) => (a.name || '').localeCompare(b.name || ''));
  const allSystemUsers = users.sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  const handleAddScale = async (e: React.FormEvent, targetDate: string) => {
    e.preventDefault();
    if (!newScale.reporterId && !newScale.cinegrafistaId && !newScale.pauteiroId) return toast.error('Selecione ao menos um responsável');
    
    // Conflict detection
    if (newScale.reporterId) {
      const reporterIsAlreadyScheduled = scales.some(s => s.date === targetDate && isUserScaleOwner(s.reporterId, { name: newScale.reporterId, uid: '' } as any));
      if (reporterIsAlreadyScheduled) {
        confirmAction(`O repórter ${newScale.reporterId} já está escalado para este dia. Deseja prosseguir com a dobra?`, async () => {
          await performAddScale(targetDate);
        });
        return;
      }
    }
    
    await performAddScale(targetDate);
  };

  const performAddScale = async (targetDate: string) => {
    try {
      await addDoc(collection(db, 'schedules'), { 
        ...newScale, 
        date: targetDate, 
        createdAt: Date.now(), 
        updatedAt: Date.now(),
        updatedBy: userData?.uid,
        updatedByName: userData?.name || 'Sistema'
      });
      toast.success('Escala adicionada');
      setNewScale({ shift: 'Manhã', time: '07:00 - 16:00', reporterId: '', cinegrafistaId: '', pauteiroId: '', dateTarget: '', observation: '' });
      setShowReporterForm(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const loadDefaultScale = async (targetDate: string) => {
    try {
      const snap = await getDoc(doc(db, 'settings', 'defaultScale'));
      let defaultShifts: any[] = [];
      if (snap.exists() && snap.data().items && snap.data().items.length > 0) {
        defaultShifts = snap.data().items;
      } else {
        defaultShifts = [
          { shift: 'Manhã', time: '07:00 - 16:00', reporterId: '', cinegrafistaId: '', pauteiroId: '' },
          { shift: 'Tarde', time: '13:00 - 22:00', reporterId: '', cinegrafistaId: '', pauteiroId: '' },
          { shift: 'Noite', time: '16:00 - 01:00', reporterId: '', cinegrafistaId: '', pauteiroId: '' },
        ];
      }
      for (const sh of defaultShifts) {
        await addDoc(collection(db, 'schedules'), {
          shift: sh.shift || '', time: sh.time || '', reporterId: sh.reporterId || '', cinegrafistaId: sh.cinegrafistaId || '', pauteiroId: sh.pauteiroId || '', 
          observation: sh.observation || '',
          date: targetDate, createdAt: Date.now(), updatedAt: Date.now()
        });
      }
      
      toast.success('Escala padrão carregada com sucesso!');
    } catch (err: any) { toast.error('Erro ao carregar escala padrão'); }
  };

  const removeScale = async (id: string, isPauteiro: boolean = false) => {
    if (userData?.role !== 'admin') {
      return toast.error('Apenas administradores podem apagar escalas.');
    }
    confirmAction('Remover esta escala?', async () => {
      try {
        await deleteDoc(doc(db, isPauteiro ? 'pauteiroSchedules' : 'schedules', id));
        toast.success('Removido');
      } catch (err: any) { toast.error(err.message); }
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scaleToEdit) return;
    try {
      const coll = isEditingPauteiroScale ? 'pauteiroSchedules' : 'schedules';
      await updateDoc(doc(db, coll, scaleToEdit.id), { 
        ...scaleToEdit, 
        updatedAt: Date.now(),
        updatedBy: userData?.uid,
        updatedByName: userData?.name || 'Sistema'
      });
      toast.success('Escala atualizada!');
      setEditModalOpen(false);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAddPauteiroScale = async (e: React.FormEvent, targetDate: string) => {
    e.preventDefault();
    if (!newPauteiroScale.pauteiroId) return toast.error('Colaborador é obrigatório');
    
    // Conflict detection for internal staff
    const staffIsAlreadyScheduled = pauteiroScales.some(s => s.date === targetDate && s.pauteiroId === newPauteiroScale.pauteiroId);
    if (staffIsAlreadyScheduled) {
      confirmAction(`${newPauteiroScale.pauteiroId} já está escalado para este dia. Deseja prosseguir com a dobra?`, async () => {
        await performAddPauteiroScale(targetDate);
      });
      return;
    }

    await performAddPauteiroScale(targetDate);
  };

  const performAddPauteiroScale = async (targetDate: string) => {
    try {
      await addDoc(collection(db, 'pauteiroSchedules'), { 
        ...newPauteiroScale, 
        date: targetDate, 
        createdAt: Date.now(), 
        updatedAt: Date.now(),
        updatedBy: userData?.uid,
        updatedByName: userData?.name || 'Sistema'
      });
      toast.success('Escala de produção adicionada');
      setNewPauteiroScale({ shift: 'Manhã', time: '07:00 - 16:00', pauteiroId: '', dateTarget: '' });
      setShowPauteiroForm(null);
    } catch (err: any) { toast.error(err.message); }
  };

  const bindReporterToPauteiro = async (reporterScaleId: string, pauteiroName: string) => {
    if (!reporterScaleId) return;
    try { await updateDoc(doc(db, 'schedules', reporterScaleId), { pauteiroId: pauteiroName }); } 
    catch (error: any) { toast.error('Erro ao vincular repórter'); }
  };

  const unbindReporterFromPauteiro = async (reporterScaleId: string) => {
    try { await updateDoc(doc(db, 'schedules', reporterScaleId), { pauteiroId: '' }); } 
    catch (error: any) { toast.error('Erro ao desvincular repórter'); }
  };

  const formatDateDisplay = (dateStr: string) => {
    const d = parseISO(dateStr);
    return format(d, 'dd/MM/yyyy');
  };
  
  const getDayName = (dateStr: string) => {
    if (dayOfWeek === 6 && dateStr === date) return 'Sábado';
    if (dayOfWeek === 6 && dateStr !== date) return 'Domingo';
    if (dayOfWeek === 0 && dateStr === date) return 'Domingo';
    if (dayOfWeek === 0 && dateStr !== date) return 'Sábado';
    return '';
  };

  const groupAndSortScales = (scalesList: any[]) => {
    const shiftOrder = ['Manhã', 'Tarde', 'Noite', 'Madrugada', 'Plantão', 'Outros'];
    const groupedScales: Record<string, any[]> = {};

    scalesList.forEach(s => {
      let sc = (s.shift || '').trim();
      let cat = sc || 'Outros';
      
      const scLower = sc.toLowerCase();
      if (scLower === 'manhã' || scLower === 'manha') cat = 'Manhã';
      else if (scLower === 'tarde') cat = 'Tarde';
      else if (scLower === 'noite') cat = 'Noite';
      else if (scLower === 'madrugada') cat = 'Madrugada';
      else if (scLower === 'plantão' || scLower === 'plantao') cat = 'Plantão';
      
      if (!groupedScales[cat]) groupedScales[cat] = [];
      groupedScales[cat].push(s);
    });

    const result: { shift: string, items: any[] }[] = [];
    shiftOrder.forEach(shift => {
       if (groupedScales[shift] && groupedScales[shift].length > 0) {
          groupedScales[shift].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          result.push({ shift, items: groupedScales[shift] });
       }
    });

    Object.keys(groupedScales).forEach(k => {
       if (!shiftOrder.includes(k) && groupedScales[k].length > 0) {
          groupedScales[k].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
          result.push({ shift: k, items: groupedScales[k] });
       }
    });

    return result;
  };

  const updateScaleField = async (id: string, field: string, value: any, isPauteiro: boolean = false) => {
    try {
      const coll = isPauteiro ? 'pauteiroSchedules' : 'schedules';
      await updateDoc(doc(db, coll, id), {
        [field]: value,
        updatedAt: Date.now(),
        updatedBy: userData?.uid,
        updatedByName: userData?.name || 'Sistema'
      });
      toast.success('Atualizado');
    } catch (err: any) {
      toast.error('Erro ao atualizar');
    }
  };

  const exportReporterScale = (targetDate: string) => {
    const dayScales = scales.filter(s => s.date === targetDate);
    const groupedData = groupAndSortScales(dayScales);
    
    const doc = new jsPDF('portrait');
    const displayDate = formatDateDisplay(targetDate);
    const dayName = getDayName(targetDate);
    const dateLabel = isWeekendDay ? `${dayName} - ${displayDate}` : displayDate;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(227, 6, 19);
    doc.text(`Escala Externa - ${dateLabel}`, 14, 20);
    
    const tableData: any[] = [];
    
    groupedData.forEach(group => {
       tableData.push([{ content: group.shift, colSpan: isWeekendDay ? 5 : 4, styles: { fillColor: [243, 244, 246], fontStyle: 'bold', textColor: [0,0,0], halign: 'center' } }]);
       
       group.items.forEach(s => {
          const rowData = [
             s.time || '-',
             getUserName(s.reporterId, 'reporter'),
             s.cinegrafistaId || '-',
             s.observation || '-'
          ];
          if (isWeekendDay) {
             rowData.push(getUserName(s.pauteiroId, 'all'));
          }
          tableData.push(rowData);
       });
    });

    const head = isWeekendDay 
      ? [['Horário', 'Repórter', 'Cinegrafista', 'Observação/Detalhes', 'Pautado por']] 
      : [['Horário', 'Repórter', 'Cinegrafista', 'Observação/Detalhes']];

    autoTable(doc, {
      startY: 30,
      head: head,
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [227, 6, 19] },
    });
    
    doc.save(`Escala_Externa_${targetDate}.pdf`);
  };

  const exportInternalScale = (targetDate: string) => {
    const dayPauteiroScales = pauteiroScales.filter(s => s.date === targetDate);
    const groupedData = groupAndSortScales(dayPauteiroScales);
    const dayReporterScales = scales.filter(s => s.date === targetDate);

    const doc = new jsPDF('portrait');
    const displayDate = formatDateDisplay(targetDate);
    const dayName = getDayName(targetDate);
    const dateLabel = isWeekendDay ? `${dayName} - ${displayDate}` : displayDate;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102);
    doc.text(`Escala Interna - ${dateLabel}`, 14, 20);
    
    const tableData: any[] = [];
    
    groupedData.forEach(group => {
       tableData.push([{ content: group.shift, colSpan: isWeekendDay ? 3 : 2, styles: { fillColor: [243, 244, 246], fontStyle: 'bold', textColor: [0,0,0], halign: 'center' } }]);
       
       group.items.forEach(s => {
          const rowData = [
             s.time || '-',
             getUserName(s.pauteiroId, 'pauteiro')
          ];
          if (isWeekendDay) {
             if (s.shift && !s.shift.toLowerCase().includes('apresentador') && !s.shift.toLowerCase().includes('editor')) {
                const reporters = dayReporterScales
                  .filter(sc => (sc.pauteiroId || "").toLowerCase() === (s.pauteiroId || "").toLowerCase())
                  .map(sc => getUserName(sc.reporterId, 'reporter'))
                  .join(', ');
                rowData.push(reporters || 'Nenhum');
             } else {
                rowData.push('-');
             }
          }
          tableData.push(rowData);
       });
    });

    const head = isWeekendDay 
      ? [['Horário', 'Colaborador', 'Repórteres Pautados']] 
      : [['Horário', 'Colaborador']];

    autoTable(doc, {
      startY: 30,
      head: head,
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [0, 51, 102] },
    });
    
    doc.save(`Escala_Interna_${targetDate}.pdf`);
  };

  const renderReporterTable = (targetDate: string) => {
    const dayScales = scales.filter(s => s.date === targetDate);
    const groupedData = groupAndSortScales(dayScales);
    const dayLabel = isWeekendDay ? `${getDayName(targetDate)} - ${formatDateDisplay(targetDate)}` : formatDateDisplay(targetDate);

    return (
      <div key={`rep-${targetDate}`} className="bg-white rounded-xl shadow-lg border border-ric-border overflow-hidden mb-12">
        <div className="bg-[#003366] text-white px-6 py-4 flex justify-between items-center bg-gradient-to-r from-[#003366] to-[#004A8F]">
          <div className="flex items-center gap-3">
            <div className="bg-ric-red p-2 rounded-lg shadow-inner">
              <CalendarPlus size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Escala Externa {dayLabel}</h3>
              <p className="text-[11px] text-white/70 font-medium uppercase tracking-widest mt-0.5">Equipe Técnica / Reportagem</p>
            </div>
          </div>
          <div className="flex gap-2">
            {isManager() && (
              <button 
                onClick={() => loadDefaultScale(targetDate)}
                className="bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center border border-white/20 whitespace-nowrap"
              >
                <ClipboardList size={14} className="md:mr-2" /> <span className="hidden md:inline">Escala Padrão</span>
              </button>
            )}
            <button 
              onClick={() => exportReporterScale(targetDate)}
              className="bg-ric-red hover:bg-red-700 text-white px-3 py-2 rounded-lg text-xs font-bold uppercase transition-all flex items-center shadow-lg whitespace-nowrap"
            >
              <Download size={14} className="md:mr-2" /> <span className="hidden md:inline">Exportar PDF</span>
            </button>
          </div>
        </div>

        {/* Desktop View - Spreadsheet Style */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead className="bg-[#F8FAFC] border-b-2 border-ric-border">
              <tr>
                <th className="w-24 px-4 py-4 text-left text-[11px] font-black text-ric-muted uppercase border-r border-gray-100">Horário</th>
                <th className="w-1/4 px-4 py-4 text-left text-[11px] font-black text-ric-muted uppercase border-r border-gray-100">Repórter (Escolher na Lista)</th>
                <th className="w-1/4 px-4 py-4 text-left text-[11px] font-black text-ric-muted uppercase border-r border-gray-100">Cinegrafista (Escolher na Lista)</th>
                <th className="px-4 py-4 text-left text-[11px] font-black text-ric-muted uppercase border-r border-gray-100">Observações / Detalhes</th>
                <th className="w-24 px-4 py-4 text-right text-[11px] font-black text-ric-muted uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {groupedData.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-ric-muted italic text-sm bg-gray-50/30">
                    <div className="flex flex-col items-center gap-2">
                       <RefreshCw size={24} className="text-gray-300 animate-spin-slow" />
                       Nenhuma escala externa definida para este dia.
                    </div>
                  </td>
                </tr>
              )}
              {groupedData.map(group => (
                <React.Fragment key={group.shift}>
                  <tr className="bg-blue-50/40 border-y border-blue-100">
                    <td colSpan={5} className="px-4 py-2.5 text-[12px] font-black text-ric-blue uppercase">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-ric-blue rounded-full"></div>
                        TURNO: {group.shift}
                      </div>
                    </td>
                  </tr>
                  {group.items.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/80 transition-all group">
                      <td className="px-4 py-4 text-[13px] text-ric-muted font-bold border-r border-gray-100 whitespace-nowrap bg-gray-50/20">
                        {s.time || '-'}
                      </td>
                      <td className="px-4 py-3 border-r border-gray-100 p-1">
                        {isManager() ? (
                          <div className="relative">
                            <select 
                              className="w-full bg-white border-2 border-gray-100 hover:border-ric-blue/30 rounded-lg p-2 text-[13px] font-bold uppercase transition-all cursor-pointer outline-none focus:ring-2 focus:ring-ric-blue/20"
                              value={s.reporterId || ''}
                              onChange={(e) => updateScaleField(s.id, 'reporterId', e.target.value)}
                            >
                              <option value="">-- Selecione o Repórter --</option>
                              {reporters.map(u => (
                                <option key={u.uid} value={displayNames[u.uid] || u.name}>
                                  {displayNames[u.uid] || u.name}
                                </option>
                              ))}
                            </select>
                            {s.tradeInfo && <div className="absolute -top-2 right-2 bg-ric-red text-white px-2 py-0.5 rounded text-[8px] font-black uppercase shadow-sm">Trocado</div>}
                          </div>
                        ) : (
                          <div className="px-2 py-1 text-[13px] text-ric-text font-black uppercase flex flex-col">
                            {getUserName(s.reporterId, 'reporter')}
                            {s.tradeInfo && <span className="text-[10px] text-ric-red italic font-medium">{s.tradeInfo}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 border-r border-gray-100 p-1">
                        {isManager() ? (
                          <select 
                            className="w-full bg-white border-2 border-gray-100 hover:border-ric-blue/30 rounded-lg p-2 text-[13px] font-bold uppercase transition-all cursor-pointer outline-none focus:ring-2 focus:ring-ric-blue/20"
                            value={s.cinegrafistaId || ''}
                            onChange={(e) => updateScaleField(s.id, 'cinegrafistaId', e.target.value)}
                          >
                            <option value="">-- Selecione o Cinegrafista --</option>
                            {cinegrafistas.map(u => (
                              <option key={u.uid} value={u.name}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="px-2 py-1 text-[13px] text-ric-text font-bold uppercase">
                            {getUserName(s.cinegrafistaId, 'cinegrafista')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 border-r border-gray-100">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {s.observation ? <span className="text-[11px] text-ric-text font-medium">{s.observation}</span> : <span className="text-[11px] text-gray-400 italic">Sem observações</span>}
                          {isManager() && (
                            <button 
                              onClick={() => { setScaleToEdit(s); setIsEditingPauteiroScale(false); setEditModalOpen(true); }}
                              className="text-ric-blue p-1 rounded hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100 ml-2"
                              title="Editar Observações"
                            >
                              <Plus size={14} /> Editar
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {isUserScaleOwner(s.reporterId, userData) && (
                            <button 
                              onClick={() => { setScaleToTrade(s); setIsTradingPauteiro(false); setTradeModalOpen(true); }} 
                              className="text-ric-blue hover:text-ric-red text-[11px] font-black uppercase border border-ric-blue/20 px-2 py-1 rounded transition-all"
                            >
                              Trocar
                            </button>
                          )}
                          {userData?.role === 'admin' && (
                            <button 
                              onClick={() => removeScale(s.id)}
                              className="p-2 text-gray-300 hover:text-ric-red transition-all rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50"
                              title="Remover Registro"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View - Refined Cards */}
        <div className="lg:hidden p-4 space-y-4">
          {groupedData.length === 0 && <p className="text-center text-ric-muted text-sm py-4">Nenhuma escala definida.</p>}
          {groupedData.map(group => (
            <div key={`mob-${group.shift}`} className="space-y-3">
              <div className="text-[11px] font-black uppercase text-ric-muted bg-gray-100 px-3 py-2 rounded-lg flex items-center border border-gray-200">
                Turno: {group.shift}
              </div>
              {group.items.map(s => (
                <div key={s.id} className="bg-white border-2 border-ric-border rounded-xl p-4 shadow-sm relative active:scale-[0.98] transition-transform">
                  <div className="flex justify-between items-start border-b border-gray-100 pb-2 mb-3">
                    <div className="text-[14px] font-black text-ric-blue uppercase tracking-tight">{s.time}</div>
                    <div className="flex gap-2">
                      {isUserScaleOwner(s.reporterId, userData) && (
                        <button onClick={() => { setScaleToTrade(s); setTradeModalOpen(true); }} className="bg-ric-blue text-white px-2.5 py-1 rounded-lg text-[10px] font-black uppercase">Trocar</button>
                      )}
                      {isManager() && (
                        <button onClick={() => { setScaleToEdit(s); setEditModalOpen(true); }} className="bg-gray-100 text-ric-text px-2.5 py-1 rounded-lg text-[10px] font-black uppercase">Ficha</button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-[9px] font-black text-ric-muted uppercase mb-1">Repórter</div>
                      {isManager() ? (
                        <select 
                          className="w-full bg-gray-50 border border-gray-200 rounded p-1.5 text-[12px] font-bold uppercase"
                          value={s.reporterId || ''}
                          onChange={(e) => updateScaleField(s.id, 'reporterId', e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {reporters.map(u => <option key={u.uid} value={displayNames[u.uid] || u.name}>{displayNames[u.uid] || u.name}</option>)}
                        </select>
                      ) : (
                        <div className="text-[13px] font-black text-ric-text uppercase">{getUserName(s.reporterId, 'reporter')}</div>
                      )}
                    </div>
                    <div>
                      <div className="text-[9px] font-black text-ric-muted uppercase mb-1">Cinegrafista</div>
                      {isManager() ? (
                        <select 
                          className="w-full bg-gray-50 border border-gray-200 rounded p-1.5 text-[12px] font-bold uppercase"
                          value={s.cinegrafistaId || ''}
                          onChange={(e) => updateScaleField(s.id, 'cinegrafistaId', e.target.value)}
                        >
                          <option value="">Selecione...</option>
                          {cinegrafistas.map(u => <option key={u.uid} value={u.name}>{u.name}</option>)}
                        </select>
                      ) : (
                        <div className="text-[13px] font-bold text-ric-text uppercase">{getUserName(s.cinegrafistaId, 'cinegrafista')}</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {s.observation && <span className="text-[11px] text-ric-text font-medium bg-gray-50 p-2 rounded-lg border border-gray-100 w-full">{s.observation}</span>}
                  </div>
                  
                  {userData?.role === 'admin' && (
                    <button onClick={() => removeScale(s.id)} className="absolute bottom-2 right-2 text-gray-200 hover:text-ric-red transition-colors p-2">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Improved Add Form */}
        {isManager() && (
          <div className="p-6 bg-gray-50/50 border-t border-ric-border">
            <button 
              onClick={() => {
                setShowReporterForm(showReporterForm === targetDate ? null : targetDate);
                setNewScale(p => ({...p, targetDate}));
              }} 
              className="flex items-center gap-2 bg-white border border-ric-blue/20 px-4 py-2 rounded-lg text-ric-blue font-black text-xs uppercase tracking-wider hover:bg-ric-blue hover:text-white transition-all shadow-sm"
            >
              {showReporterForm === targetDate ? <X size={16} /> : <Plus size={16} />}
              {showReporterForm === targetDate ? 'Fechar' : 'Nova Linha de Trabalho'}
            </button>

            {showReporterForm === targetDate && (
              <div className="mt-6 p-6 bg-white border border-ric-border rounded-xl shadow-inner animate-in fade-in slide-in-from-top-4 duration-300">
                <form onSubmit={(e) => handleAddScale(e, targetDate)} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-ric-muted uppercase">Turno e Horário</label>
                    <div className="flex gap-2">
                       <input list="shift-options" value={newScale.shift} onChange={e => setNewScale({...newScale, shift: e.target.value})} className="w-1/2 rounded-lg border-2 border-gray-100 p-2.5 bg-gray-50 text-[13px] font-bold focus:border-ric-blue outline-none" placeholder="Manhã" />
                       <input type="text" value={newScale.time} onChange={e => setNewScale({...newScale, time: e.target.value})} className="w-1/2 rounded-lg border-2 border-gray-100 p-2.5 bg-gray-50 text-[13px] font-bold focus:border-ric-blue outline-none" placeholder="07:00 - 16:00" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-ric-muted uppercase">Repórter Inicial</label>
                    <input list="reporter-options" value={newScale.reporterId} onChange={e => setNewScale({...newScale, reporterId: e.target.value})} className="w-full rounded-lg border-2 border-gray-100 p-2.5 bg-gray-50 text-[13px] font-bold focus:border-ric-blue outline-none uppercase" placeholder="Escolha..." />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-ric-muted uppercase">Cinegrafista Inicial</label>
                    <input list="cinegrafista-options" value={newScale.cinegrafistaId} onChange={e => setNewScale({...newScale, cinegrafistaId: e.target.value})} className="w-full rounded-lg border-2 border-gray-100 p-2.5 bg-gray-50 text-[13px] font-bold focus:border-ric-blue outline-none uppercase" placeholder="Escolha..." />
                  </div>
                  <button type="submit" className="w-full bg-ric-blue text-white rounded-lg p-3 text-sm font-black uppercase hover:bg-[#002244] transition-all shadow-md active:scale-95">
                    Confirmar Registro
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderInternalTable = (targetDate: string) => {
    const dayPauteiroScales = pauteiroScales.filter(s => s.date === targetDate);
    const dayLabel = isWeekendDay ? `${getDayName(targetDate)} - ${formatDateDisplay(targetDate)}` : formatDateDisplay(targetDate);
    const dayReporterScales = scales.filter(s => s.date === targetDate);
    const groupedData = groupAndSortScales(dayPauteiroScales);

    return (
      <div key={`int-${targetDate}`} className="bg-white rounded-xl shadow-lg border border-ric-border overflow-hidden mb-12">
        <div className="bg-[#E0F2FE] text-[#0369A1] px-6 py-4 flex justify-between items-center border-b border-blue-100 bg-gradient-to-r from-blue-50 to-blue-100">
          <div className="flex items-center gap-3">
            <div className="bg-ric-blue p-2 rounded-lg shadow-sm">
              <ClipboardList size={20} className="text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Escala Interna (Pauta/Produção) {dayLabel}</h3>
              <p className="text-[11px] text-ric-blue/70 font-medium uppercase tracking-widest mt-0.5">Editores, Pauteiros e Chefia</p>
            </div>
          </div>
          <button 
            onClick={() => exportInternalScale(targetDate)}
            className="bg-ric-blue hover:bg-[#002244] text-white px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all shadow-md flex items-center"
          >
            <Download size={14} className="mr-2" /> PDF
          </button>
        </div>

        {/* Desktop View - Spreadsheet */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead className="bg-[#F8FAFC] border-b-2 border-ric-border">
              <tr>
                <th className="w-24 px-4 py-4 text-left text-[11px] font-black text-ric-muted uppercase border-r border-gray-100">Horário</th>
                <th className="w-1/3 px-4 py-4 text-left text-[11px] font-black text-ric-muted uppercase border-r border-gray-100">Responsável (Escolher)</th>
                {isWeekendDay && <th className="px-4 py-4 text-left text-[11px] font-black text-ric-muted uppercase border-r border-gray-100 bg-[#FFFBEB]/50">Vínculos de Pauta</th>}
                <th className="w-24 px-4 py-4 text-right text-[11px] font-black text-ric-muted uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {groupedData.length === 0 && (
                <tr>
                  <td colSpan={isWeekendDay ? 4 : 3} className="px-6 py-12 text-center text-ric-muted italic text-sm">
                    Nenhuma escala interna definida.
                  </td>
                </tr>
              )}
              {groupedData.map(group => (
                <React.Fragment key={group.shift}>
                  <tr className="bg-gray-50/50 border-y border-gray-200">
                    <td colSpan={isWeekendDay ? 4 : 3} className="px-4 py-2.5 text-[12px] font-black text-ric-muted uppercase border-l-4 border-ric-blue">
                      SETOR / FUNÇÃO: {group.shift}
                    </td>
                  </tr>
                  {group.items.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/80 transition-all group">
                      <td className="px-4 py-4 text-[13px] text-ric-muted font-bold border-r border-gray-100 whitespace-nowrap bg-gray-50/10">
                        {s.time || '-'}
                      </td>
                      <td className="px-4 py-3 border-r border-gray-100 p-1">
                        {isManager() ? (
                          <select 
                            className="w-full bg-white border-2 border-gray-100 hover:border-ric-blue/30 rounded-lg p-2 text-[13px] font-bold uppercase transition-all cursor-pointer outline-none focus:ring-2 focus:ring-ric-blue/10"
                            value={s.pauteiroId || ''}
                            onChange={(e) => updateScaleField(s.id, 'pauteiroId', e.target.value, true)}
                          >
                            <option value="">-- Escolher Colaborador --</option>
                            {allSystemUsers.map(u => (
                              <option key={u.uid} value={u.name}>
                                {u.name} ({u.role})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="px-2 py-1 text-[13px] text-ric-text font-black uppercase">
                            {getUserName(s.pauteiroId, 'pauteiro')}
                          </div>
                        )}
                      </td>
                      {isWeekendDay && (
                        <td className="px-4 py-3 border-r border-gray-100 bg-[#FFFBEB]/10">
                          {s.shift && !s.shift.toLowerCase().includes('apresentador') && !s.shift.toLowerCase().includes('editor') ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-1.5">
                                {dayReporterScales.filter(sc => String(sc.pauteiroId || "").toLowerCase() === String(s.pauteiroId || "").toLowerCase() && s.pauteiroId).map(sc => (
                                  <span key={sc.id} className="bg-white border-2 border-[#F59E0B]/20 text-[#B45309] px-2.5 py-1 rounded-lg text-[10px] font-black uppercase flex items-center shadow-sm">
                                    {getUserName(sc.reporterId, 'reporter')}
                                    {isManager() && (
                                      <button onClick={() => unbindReporterFromPauteiro(sc.id)} className="ml-2 bg-red-50 text-red-500 rounded p-0.5 hover:bg-red-500 hover:text-white transition-all"><X size={10} /></button>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {isManager() && (
                                <select 
                                  className="block w-full max-w-[240px] rounded-lg border-2 border-[#F59E0B]/20 p-2 bg-white text-[11px] font-black text-ric-text uppercase cursor-pointer"
                                  onChange={(e) => {
                                    bindReporterToPauteiro(e.target.value, s.pauteiroId);
                                    e.target.value = '';
                                  }}
                                  defaultValue=""
                                >
                                  <option value="" disabled>+ Vincular Repórter</option>
                                  {dayReporterScales.filter(sc => String(sc.pauteiroId || "").toLowerCase() !== String(s.pauteiroId || "").toLowerCase()).map(sc => (
                                    <option key={sc.id} value={sc.id}>{getUserName(sc.reporterId, 'reporter')} ({sc.time})</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          ) : <span className="text-[11px] text-gray-300 italic uppercase font-black">---</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {userData?.role === 'admin' && (
                            <button 
                              onClick={() => removeScale(s.id, true)}
                              className="p-2 text-gray-300 hover:text-ric-red transition-all rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View - Cards */}
        <div className="lg:hidden p-4 space-y-4">
           {groupedData.length === 0 && <p className="text-center text-ric-muted text-sm py-4">Nenhuma escala interna definida.</p>}
           {groupedData.map(group => (
              <div key={`mob-int-${group.shift}`} className="space-y-3">
                 <div className="text-[10px] font-black uppercase text-ric-muted bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                    Função: {group.shift}
                 </div>
                 {group.items.map(s => (
                    <div key={s.id} className="bg-white border-2 border-ric-border rounded-xl p-4 shadow-sm relative">
                       <div className="flex justify-between items-start border-b border-gray-100 pb-2 mb-3">
                          <div className="text-[14px] font-black text-ric-blue uppercase tracking-tight">{s.time}</div>
                          <div className="flex gap-2">
                             {isManager() && (
                               <button onClick={() => { setScaleToEdit(s); setIsEditingPauteiroScale(true); setEditModalOpen(true); }} className="bg-gray-100 text-ric-text px-2.5 py-1 rounded-lg text-[10px] font-black uppercase">Edit</button>
                             )}
                          </div>
                       </div>
                       <div>
                          <div className="text-[9px] font-black text-ric-muted uppercase mb-1">Colaborador</div>
                          {isManager() ? (
                            <select 
                              className="w-full bg-gray-50 border border-gray-200 rounded p-1.5 text-[12px] font-bold uppercase"
                              value={s.pauteiroId || ''}
                              onChange={(e) => updateScaleField(s.id, 'pauteiroId', e.target.value, true)}
                            >
                              <option value="">Selecione...</option>
                              {allSystemUsers.map(u => <option key={u.uid} value={u.name}>{u.name}</option>)}
                            </select>
                          ) : (
                            <div className="text-[13px] font-black text-ric-text uppercase">{getUserName(s.pauteiroId, 'pauteiro')}</div>
                          )}
                       </div>
                       {isWeekendDay && s.shift && !s.shift.toLowerCase().includes('apresentador') && !s.shift.toLowerCase().includes('editor') && (
                          <div className="mt-4 bg-[#FFFBEB] p-3 rounded-xl border border-[#F59E0B]/20">
                             <div className="text-[9px] font-black text-[#B45309] uppercase mb-2">Equipe Pautada</div>
                             <div className="flex flex-wrap gap-1.5">
                                {dayReporterScales.filter(sc => String(sc.pauteiroId || "").toLowerCase() === String(s.pauteiroId || "").toLowerCase() && s.pauteiroId).map(sc => (
                                   <span key={sc.id} className="bg-white border border-[#F59E0B]/30 px-2 py-0.5 rounded-lg text-[10px] font-black text-[#B45309] uppercase shadow-sm">
                                      {getUserName(sc.reporterId, 'reporter')}
                                   </span>
                                ))}
                             </div>
                          </div>
                       )}
                       {userData?.role === 'admin' && (
                         <button onClick={() => removeScale(s.id, true)} className="absolute bottom-2 right-2 text-gray-200 hover:text-ric-red p-2">
                            <Trash2 size={14} />
                         </button>
                       )}
                    </div>
                 ))}
              </div>
           ))}
        </div>
        
        {/* Improved Add Form Pauteiro */}
        {isManager() && (
          <div className="p-6 bg-gray-50/50 border-t border-ric-border">
            <button 
              onClick={() => {
                setShowPauteiroForm(showPauteiroForm === targetDate ? null : targetDate);
                setNewPauteiroScale({ shift: 'Manhã', time: '07:00 - 16:00', pauteiroId: '', dateTarget: targetDate });
              }} 
              className="flex items-center gap-2 bg-white border border-ric-blue/20 px-4 py-2 rounded-lg text-ric-blue font-black text-xs uppercase tracking-wider hover:bg-ric-blue hover:text-white transition-all shadow-sm"
            >
              {showPauteiroForm === targetDate ? <X size={16} /> : <Plus size={16} />}
              {showPauteiroForm === targetDate ? 'Fechar' : 'Nova Linha de Produção'}
            </button>

            {showPauteiroForm === targetDate && (
              <div className="mt-6 p-6 bg-white border border-ric-border rounded-xl shadow-inner animate-in fade-in slide-in-from-top-4 duration-300">
                <form onSubmit={(e) => handleAddPauteiroScale(e, targetDate)} className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-ric-muted uppercase">Setor / Função</label>
                    <input type="text" list="shift-options" value={newPauteiroScale.shift} onChange={e => setNewPauteiroScale({...newPauteiroScale, shift: e.target.value})} className="w-full rounded-lg border-2 border-gray-100 p-2.5 bg-gray-50 text-[13px] font-bold focus:border-ric-blue outline-none" placeholder="Ex: Pauteiro Tarde" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-ric-muted uppercase">Horário</label>
                    <div className="flex gap-2">
                      <input type="time" value={newPauteiroScale.time.split(' - ')[0] || ''} onChange={e => setNewPauteiroScale({...newPauteiroScale, time: `${e.target.value} - ${newPauteiroScale.time.split(' - ')[1] || ''}`})} className="w-1/2 rounded-lg border-2 border-gray-100 p-2 bg-gray-50 text-[13px] font-bold" />
                      <input type="time" value={newPauteiroScale.time.split(' - ')[1] || ''} onChange={e => setNewPauteiroScale({...newPauteiroScale, time: `${newPauteiroScale.time.split(' - ')[0] || ''} - ${e.target.value}`})} className="w-1/2 rounded-lg border-2 border-gray-100 p-2 bg-gray-50 text-[13px] font-bold" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-ric-muted uppercase">Colaborador Inicial</label>
                    <input type="text" list="user-options" value={newPauteiroScale.pauteiroId} onChange={e => setNewPauteiroScale({...newPauteiroScale, pauteiroId: e.target.value})} className="w-full rounded-lg border-2 border-gray-100 p-2.5 bg-gray-50 text-[13px] font-bold focus:border-ric-blue outline-none uppercase" placeholder="Escolha..." />
                  </div>
                  <button type="submit" className="w-full bg-ric-blue text-white rounded-lg p-3 text-sm font-black uppercase hover:bg-[#002244] shadow-md transition-all active:scale-95">
                    Confirmar Produção
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-[15px]">
      <datalist id="shift-options">
        <option value="Manhã" />
        <option value="Tarde" />
        <option value="Noite" />
        <option value="Madrugada" />
        <option value="Plantão" />
      </datalist>
      <datalist id="reporter-options">
        {users.map(u => <option key={u.uid} value={displayNames[u.uid] || u.name} />)}
      </datalist>
      <datalist id="cinegrafista-options">
        {users.map(u => <option key={u.uid} value={displayNames[u.uid] || u.name} />)}
      </datalist>
      <datalist id="user-options">
        {allSystemUsers.map(r => <option key={r.uid} value={r.name} />)}
      </datalist>

      <div className="flex justify-between items-center bg-ric-card border border-ric-border shadow-[0_1px_3px_rgba(0,0,0,0.1)] rounded-[8px] p-[15px] flex-wrap gap-4 mb-6">
        <div className="flex items-center flex-wrap gap-4">
          <h2 className="text-[16px] font-bold text-ric-text uppercase">Selecione a Data</h2>
          <input 
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-[4px] border-ric-border shadow-sm px-3 py-[6px] bg-ric-bg text-[14px] focus:ring-ric-red focus:border-ric-red"
          />
        </div>
      </div>
        
      {isWeekendDay && (
        <div className="bg-[#FFFBEB]/80 rounded-2xl p-6 border-2 border-[#F59E0B]/10 shadow-sm mb-10 flex flex-col gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <ShieldCheck size={80} className="text-[#D97706]" />
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-[#F59E0B] p-1.5 rounded-lg">
              <ShieldCheck size={18} className="text-white" />
            </div>
            <h2 className="font-black text-[#B45309] uppercase text-[15px] tracking-tight">Equipe Fixa do Final de Semana</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
            <div className="bg-white/60 p-4 rounded-xl border border-[#F59E0B]/10">
                <span className="text-[10px] font-black text-[#D97706] uppercase block mb-2 tracking-widest">Chefia Geral</span>
                <input 
                   list="user-options"
                   value={weekendChefiaId} 
                   onChange={e => handleWeekendMetaChange('chefiaId', e.target.value)}
                   disabled={!isManager()}
                   placeholder={isManager() ? "Selecione ou digite..." : "Não definido"}
                   className={`w-full rounded-lg border-2 border-[#F59E0B]/20 shadow-sm px-3 py-2 bg-white text-[13px] font-bold text-ric-text focus:ring-[#D97706] focus:border-[#D97706] transition-all ${!isManager() && 'opacity-70 cursor-not-allowed border-dashed'}`}
                />
            </div>
            <div className="bg-white/60 p-4 rounded-xl border border-[#F59E0B]/10">
                <span className="text-[10px] font-black text-[#D97706] uppercase block mb-2 tracking-widest">Apresentador BG</span>
                <input 
                   list="user-options"
                   value={weekendApresentadorId} 
                   onChange={e => handleWeekendMetaChange('apresentadorId', e.target.value)}
                   disabled={!isManager()}
                   placeholder={isManager() ? "Selecione ou digite..." : "Não definido"}
                   className={`w-full rounded-lg border-2 border-[#F59E0B]/20 shadow-sm px-3 py-2 bg-white text-[13px] font-bold text-ric-text focus:ring-[#D97706] focus:border-[#D97706] transition-all ${!isManager() && 'opacity-70 cursor-not-allowed border-dashed'}`}
                />
            </div>
            <div className="bg-white/60 p-4 rounded-xl border border-[#F59E0B]/10">
                <span className="text-[10px] font-black text-[#D97706] uppercase block mb-2 tracking-widest">Editor-Chefe BG</span>
                <input 
                   list="user-options"
                   value={weekendEditorId} 
                   onChange={e => handleWeekendMetaChange('editorId', e.target.value)}
                   disabled={!isManager()}
                   placeholder={isManager() ? "Selecione ou digite..." : "Não definido"}
                   className={`w-full rounded-lg border-2 border-[#F59E0B]/20 shadow-sm px-3 py-2 bg-white text-[13px] font-bold text-ric-text focus:ring-[#D97706] focus:border-[#D97706] transition-all ${!isManager() && 'opacity-70 cursor-not-allowed border-dashed'}`}
                />
            </div>
          </div>
        </div>
      )}

      {shiftTrades.filter(t => t.status === 'pending_target' && t.targetUserId === user?.uid).length > 0 && (
        <div className="bg-[#FFFBEB] rounded-[8px] p-4 border border-[#F59E0B]/50 mb-4 shadow-sm mt-4">
          <h3 className="text-[14px] font-bold text-[#D97706] mb-3 flex items-center uppercase"><RefreshCw size={16} className="mr-2" /> Colegas querem trocar de turno com você</h3>
          <div className="space-y-2">
            {shiftTrades.filter(t => t.status === 'pending_target' && t.targetUserId === user?.uid).map(trade => (
              <div key={trade.id} className="bg-white rounded-[6px] border border-[#F59E0B]/30 p-3 flex justify-between items-center text-[13px]">
                <div>
                  <span className="font-bold text-ric-text">{getUserName(trade.requesterId, 'all')}</span> solicitou repassar para você o turno <span className="font-bold">{trade.shift} ({trade.time})</span> do dia <span className="font-bold">{format(parseISO(trade.date), 'dd/MM/yyyy')}</span>.
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleTargetApproveTrade(trade.id)} className="bg-green-600 text-white px-3 py-1 text-[12px] font-bold rounded hover:bg-green-700" title="Aceitar">Aceitar</button>
                  <button onClick={() => handleRejectTrade(trade.id, true)} className="bg-red-600 text-white px-3 py-1 text-[12px] font-bold rounded hover:bg-red-700" title="Rejeitar">Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {shiftTrades.filter(t => t.status === 'pending_admin').length > 0 && isManager() && (
        <div className="bg-[#FFFBEB] rounded-[8px] p-4 border border-[#F59E0B]/50 mb-4 shadow-sm mt-4">
          <h3 className="text-[14px] font-bold text-[#D97706] mb-3 flex items-center uppercase"><RefreshCw size={16} className="mr-2" /> Solicitações de Troca Pendentes da Chefia</h3>
          <div className="space-y-2">
            {shiftTrades.filter(t => t.status === 'pending_admin').map(trade => (
              <div key={trade.id} className="bg-white rounded-[6px] border border-[#F59E0B]/30 p-3 flex justify-between items-center text-[13px]">
                <div>
                  <span className="font-bold text-ric-text">{getUserName(trade.requesterId, 'all')}</span> repassou o turno de <span className="font-bold">{trade.shift} ({trade.time})</span> do dia <span className="font-bold">{format(parseISO(trade.date), 'dd/MM/yyyy')}</span> para <span className="font-bold text-ric-blue">{getUserName(trade.targetUserId, 'all')}</span> (Já aceito).
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApproveTrade(trade)} className="bg-green-600 text-white p-1 rounded hover:bg-green-700" title="Aprovar"><CheckCircle size={18}/></button>
                  <button onClick={() => handleRejectTrade(trade.id)} className="bg-red-600 text-white p-1 rounded hover:bg-red-700" title="Rejeitar"><XCircle size={18}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        {/* Render ALL grouped external scales first */}
        <div className="mb-8">
          {viewDates.map(d => renderReporterTable(d))}
        </div>
        
        {/* Render ALL grouped internal scales next */}
        <div className="mb-8">
          {viewDates.map(d => renderInternalTable(d))}
        </div>
      </div>

      {tradeModalOpen && scaleToTrade && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[8px] shadow-lg w-full max-w-md p-6">
            <h3 className="text-[18px] font-bold text-ric-text mb-4">Solicitar Troca de Turno</h3>
            <p className="text-[14px] text-ric-muted mb-4">
              Você está solicitando repassar o turno <strong>{scaleToTrade.shift} ({scaleToTrade.time})</strong> do dia <strong>{format(parseISO(scaleToTrade.date), 'dd/MM/yyyy')}</strong>.
            </p>
            <form onSubmit={handleCreateTradeRequest}>
              <div className="mb-4">
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Para quem você deseja repassar?</label>
                <select 
                  value={tradeTargetUserId} 
                  onChange={e => setTradeTargetUserId(e.target.value)}
                  className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue"
                  required
                >
                  <option value="" disabled>Selecione o substituto</option>
                  {isTradingPauteiro 
                    ? allSystemUsers.filter(u => u.uid !== user?.uid).map(u => <option key={u.uid} value={u.uid}>{displayNames[u.uid] || u.name}</option>)
                    : isUserScaleOwner(scaleToTrade.reporterId, userData) 
                      ? reporters.filter(u => u.uid !== user?.uid).map(u => <option key={u.uid} value={u.uid}>{displayNames[u.uid] || u.name}</option>)
                      : cinegrafistas.filter(u => u.uid !== user?.uid).map(u => <option key={u.uid} value={u.uid}>{displayNames[u.uid] || u.name}</option>)
                  }
                </select>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button 
                  type="button" 
                  onClick={() => { setTradeModalOpen(false); setScaleToTrade(null); }}
                  className="px-4 py-2 text-[13px] font-bold text-ric-muted hover:bg-gray-100 rounded-[4px]"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-[13px] font-bold text-white bg-ric-blue hover:bg-[#002244] rounded-[4px]"
                >
                  Solicitar Aprovação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editModalOpen && scaleToEdit && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-[8px] shadow-lg w-full max-w-2xl p-6">
            <h3 className="text-[18px] font-bold text-ric-text mb-4">Editar Escala de {format(parseISO(scaleToEdit.date), 'dd/MM/yyyy')}</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Turno / Função</label>
                  <input type="text" value={scaleToEdit.shift} onChange={e => setScaleToEdit({...scaleToEdit, shift: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" required />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Horário</label>
                  <div className="flex gap-2">
                    <input type="time" value={(scaleToEdit.time || '').split(' - ')[0] || ''} onChange={e => setScaleToEdit({...scaleToEdit, time: `${e.target.value} - ${(scaleToEdit.time || '').split(' - ')[1] || ''}`})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" required />
                    <span className="self-center">às</span>
                    <input type="time" value={(scaleToEdit.time || '').split(' - ')[1] || ''} onChange={e => setScaleToEdit({...scaleToEdit, time: `${(scaleToEdit.time || '').split(' - ')[0] || ''} - ${e.target.value}`})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" required />
                  </div>
                </div>
              </div>
              
              {!isEditingPauteiroScale ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Repórter</label>
                      <input type="text" list="reporter-options" value={scaleToEdit.reporterId || ''} onChange={e => setScaleToEdit({...scaleToEdit, reporterId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" />
                    </div>
                    <div>
                      <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Cinegrafista</label>
                      <input type="text" list="cinegrafista-options" value={scaleToEdit.cinegrafistaId || ''} onChange={e => setScaleToEdit({...scaleToEdit, cinegrafistaId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Colaborador (Interno)</label>
                  <input type="text" list="user-options" value={scaleToEdit.pauteiroId || ''} onChange={e => setScaleToEdit({...scaleToEdit, pauteiroId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" required />
                </div>
              )}
              
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Observações e Detalhes</label>
                <textarea rows={3} value={scaleToEdit.observation || ''} onChange={e => setScaleToEdit({...scaleToEdit, observation: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-3 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue resize-y leading-relaxed" placeholder="Adicione equipamentos, jornais ou outras orientações aqui..." />
              </div>

              <div className="flex gap-3 justify-end mt-6">
                <button 
                  type="button" 
                  onClick={() => { setEditModalOpen(false); setScaleToEdit(null); }}
                  className="px-4 py-2 text-[13px] font-bold text-ric-muted hover:bg-gray-100 rounded-[4px]"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 text-[13px] font-bold text-white bg-ric-blue hover:bg-[#002244] rounded-[4px]"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
