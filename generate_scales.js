const fs = require('fs');

const fileContent = `import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDocs, updateDoc, addDoc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserData, useAuth } from '../contexts/AuthContext';
import { format, parseISO, addDays, isWeekend } from 'date-fns';
import toast from 'react-hot-toast';
import { RefreshCw, CheckCircle, XCircle, Trash2, CalendarPlus, X } from 'lucide-react';

export default function Scales() {
  const { userData, user } = useAuth();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [shiftTrades, setShiftTrades] = useState<any[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  
  // Real data for all dates in view
  const [scales, setScales] = useState<any[]>([]);
  const [pauteiroScales, setPauteiroScales] = useState<any[]>([]);
  const [weekendChefiaId, setWeekendChefiaId] = useState('');
  
  // UI state
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [scaleToTrade, setScaleToTrade] = useState<any>(null);
  const [tradeTargetUserId, setTradeTargetUserId] = useState('');
  const [isTradingPauteiro, setIsTradingPauteiro] = useState(false);

  const [showReporterForm, setShowReporterForm] = useState<string | null>(null);
  const [showPauteiroForm, setShowPauteiroForm] = useState<string | null>(null);

  const [newScale, setNewScale] = useState({ shift: 'Manhã', time: '07:00 - 16:00', reporterId: '', cinegrafistaId: '', pauteiroId: '', dateTarget: '' });
  const [newPauteiroScale, setNewPauteiroScale] = useState({ shift: 'Manhã', time: '07:00 - 16:00', pauteiroId: '', dateTarget: '' });
  
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
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)));
    });
  }, []);

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
        if (docSnap.exists()) setWeekendChefiaId(docSnap.data().chefiaId || '');
        else setWeekendChefiaId('');
      });
    }

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [date, isWeekendDay]); // dependency on date to refetch when dates change

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
    if (!confirm('Aceitar assumir este turno?')) return;
    try {
      await updateDoc(doc(db, 'shiftTrades', tradeId), { status: 'pending_admin' });
      toast.success('Aceito! Agora aguarda aprovação da chefia.');
    } catch (error: any) {
      toast.error('Erro ao aceitar troca');
    }
  };

  const getUserName = (id: string, role: string) => {
    if (!id) return '-';
    const u = users.find(u => u.uid === id);
    return u ? u.name : id;
  };

  const handleApproveTrade = async (trade: any) => {
    if (!confirm('Aprovar esta troca e atualizar a escala?')) return;
    try {
      const collName = trade.isPauteiroScale ? 'pauteiroSchedules' : 'schedules';
      const targetUser = users.find(u => u.uid === trade.targetUserId);
      if (!targetUser) return toast.error('Usuário alvo não encontrado');
      
      const tradeInfoStr = \`Trocado (Aut: \${userData?.name?.split(' ')[0] || 'Admin'})\`;
      const payload: any = { tradeInfo: tradeInfoStr };
      
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
  };

  const handleRejectTrade = async (tradeId: string, isTarget: boolean = false) => {
    if (!confirm('Rejeitar esta troca?')) return;
    try {
      await updateDoc(doc(db, 'shiftTrades', tradeId), { status: 'rejected' });
      toast.success('Troca rejeitada!');
    } catch (error: any) {
      toast.error('Erro ao rejeitar troca');
    }
  };

  const handleChefiaChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setWeekendChefiaId(val);
    try {
      // Use satDate as the reference key for the weekend
      await setDoc(doc(db, 'scale_meta', satDate), { chefiaId: val }, { merge: true });
      toast.success('Chefia do final de semana atualizada');
    } catch (err: any) { toast.error('Erro ao atualizar chefia'); }
  };

  const isManager = () => {
    if (!userData) return false;
    const managers = ['guilherme', 'luana', 'ivete', 'fabio', 'weslley'];
    return managers.includes(userData.name.toLowerCase()) || userData.role === 'admin' || userData.role === 'editor';
  };

  const reporters = users.filter(u => u.role === 'reporter');
  const cinegrafistas = users.filter(u => u.role === 'cinegrafista');
  const allSystemUsers = users;

  const handleAddScale = async (e: React.FormEvent, targetDate: string) => {
    e.preventDefault();
    if (!newScale.reporterId && !newScale.cinegrafistaId && !newScale.pauteiroId) return toast.error('Selecione ao menos um responsável');
    try {
      await addDoc(collection(db, 'schedules'), { ...newScale, date: targetDate, createdAt: Date.now(), updatedAt: Date.now() });
      toast.success('Escala adicionada');
      setNewScale({ shift: 'Manhã', time: '07:00 - 16:00', reporterId: '', cinegrafistaId: '', pauteiroId: '', dateTarget: '' });
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
          shift: sh.shift || '', time: sh.time || '', reporterId: sh.reporterId || '', cinegrafistaId: sh.cinegrafistaId || '', pauteiroId: sh.pauteiroId || '', date: targetDate, createdAt: Date.now(), updatedAt: Date.now()
        });
      }
      
      // Also add Apresentador and Editor Chief defaults on weekends
      if (isWeekendDay) {
         await addDoc(collection(db, 'pauteiroSchedules'), { shift: 'Apresentador Balanço Geral', time: '11:50 - 15:30', pauteiroId: '', date: targetDate, createdAt: Date.now(), updatedAt: Date.now() });
         await addDoc(collection(db, 'pauteiroSchedules'), { shift: 'Editor-chefe Balanço Geral', time: '08:00 - 17:00', pauteiroId: '', date: targetDate, createdAt: Date.now(), updatedAt: Date.now() });
      }
      
      toast.success('Escala padrão carregada com sucesso!');
    } catch (err: any) { toast.error('Erro ao carregar escala padrão'); }
  };

  const removeScale = async (id: string, isPauteiro: boolean = false) => {
    if (!confirm('Remover esta escala?')) return;
    try {
      await deleteDoc(doc(db, isPauteiro ? 'pauteiroSchedules' : 'schedules', id));
      toast.success('Removido');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAddPauteiroScale = async (e: React.FormEvent, targetDate: string) => {
    e.preventDefault();
    if (!newPauteiroScale.pauteiroId) return toast.error('Colaborador é obrigatório');
    try {
      await addDoc(collection(db, 'pauteiroSchedules'), { ...newPauteiroScale, date: targetDate, createdAt: Date.now(), updatedAt: Date.now() });
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

  const renderReporterTable = (targetDate: string) => {
    const dayScales = scales.filter(s => s.date === targetDate);
    const dayLabel = isWeekendDay ? \` (\${getDayName(targetDate)} - \${formatDateDisplay(targetDate)})\` : \` (\${formatDateDisplay(targetDate)})\`;
    
    return (
      <div key={\`rep-\${targetDate}\`} className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden mb-6">
        <div className="bg-[#FEF2F2] px-[20px] py-[15px] border-b border-ric-border border-t-[4px] border-t-ric-red flex justify-between items-center">
          <h2 className="text-[16px] font-bold text-ric-red uppercase tracking-wider">Escala Externa (Repórteres e Cinegrafistas){dayLabel}</h2>
          {dayScales.length === 0 && (
            <button 
              onClick={() => loadDefaultScale(targetDate)}
              className="bg-white text-ric-blue px-3 py-1.5 rounded-[4px] font-bold shadow-sm flex items-center border border-ric-border hover:bg-gray-50 text-[11px] uppercase transition-colors"
            >
              <CalendarPlus size={14} className="mr-2" /> Carregar Escala Padrão
            </button>
          )}
        </div>
        <table className="min-w-full divide-y divide-ric-border">
          <thead className="bg-[#F8F9FA]">
            <tr>
              <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider">Turno</th>
              <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider">Horário</th>
              <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider">Repórter</th>
              <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider">Cinegrafista</th>
              {isWeekendDay && <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider border-l border-ric-border bg-[#FFFBEB]">Pautado por...</th>}
              <th className="px-5 py-3 text-right text-[12px] font-bold text-ric-muted uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-ric-card divide-y divide-gray-100">
            {dayScales.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text font-bold">{s.shift}</td>
                <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-muted">{s.time}</td>
                <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text">
                  {getUserName(s.reporterId, 'reporter')}
                  {s.tradeInfo && <div className="text-[10px] text-ric-red mt-1 font-medium">{s.tradeInfo}</div>}
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text">
                  {s.cinegrafistaId || '-'}
                  {s.tradeInfo && s.cinegrafistaId !== '' && !s.reporterId && <div className="text-[10px] text-ric-red mt-1 font-medium">{s.tradeInfo}</div>}
                </td>
                {isWeekendDay && (
                  <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text font-medium border-l border-ric-border bg-[#FFFBEB]/30">
                    {getUserName(s.pauteiroId, 'all')}
                  </td>
                )}
                <td className="px-5 py-3 whitespace-nowrap text-right text-sm">
                  {(userData?.name === getUserName(s.reporterId, 'reporter') || userData?.name === s.cinegrafistaId) && (
                    <button 
                      onClick={() => { setScaleToTrade(s); setIsTradingPauteiro(false); setTradeModalOpen(true); }} 
                      className="text-ric-blue hover:underline text-[12px] font-bold mr-3"
                    >
                      Solicitar Troca
                    </button>
                  )}
                  <button onClick={() => removeScale(s.id)} className="text-ric-muted hover:text-ric-red ml-3"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
            {dayScales.length === 0 && (
              <tr><td colSpan={isWeekendDay ? 6 : 5} className="px-5 py-4 text-center text-[13px] text-ric-muted">Nenhuma escala definida.</td></tr>
            )}
            <tr>
              <td colSpan={isWeekendDay ? 6 : 5} className="bg-[#F8F9FA] px-5 py-2">
                <button 
                  onClick={() => {
                    setShowReporterForm(showReporterForm === targetDate ? null : targetDate);
                    setNewScale(p => ({...p, targetDate}));
                  }} 
                  className="text-ric-blue text-[12px] font-bold hover:underline"
                >
                  {showReporterForm === targetDate ? '- Cancelar adição' : '+ Adicionar linha de repórter'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {showReporterForm === targetDate && (
          <div className="p-4 bg-[#F8F9FA] border-t border-ric-border">
            <h3 className="text-[14px] font-bold mb-[15px] uppercase text-ric-text">Adicionar Escala Manual</h3>
            <form onSubmit={(e) => handleAddScale(e, targetDate)} className={\`grid grid-cols-1 \${isWeekendDay ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-[15px] items-end\`}>
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Turno</label>
                <input type="text" list="shift-options" value={newScale.shift} onChange={e => setNewScale({...newScale, shift: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-red focus:border-ric-red" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Horário</label>
                <input type="text" value={newScale.time} onChange={e => setNewScale({...newScale, time: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-red focus:border-ric-red" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Repórter</label>
                <input type="text" list="reporter-options" value={newScale.reporterId} onChange={e => setNewScale({...newScale, reporterId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-red focus:border-ric-red" placeholder="Selecione ou digite" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Cinegrafista</label>
                <input type="text" list="cinegrafista-options" value={newScale.cinegrafistaId} onChange={e => setNewScale({...newScale, cinegrafistaId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-red focus:border-ric-red" placeholder="Selecione ou digite" />
              </div>
              {isWeekendDay && (
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase text-[#D97706]">Pautado por...</label>
                  <input type="text" list="user-options" value={newScale.pauteiroId} onChange={e => setNewScale({...newScale, pauteiroId: e.target.value})} className="block w-full rounded-[4px] border-[#F59E0B] shadow-sm p-2 bg-[#FFFBEB] text-[14px] focus:ring-[#D97706] focus:border-[#D97706]" placeholder="Selecione ou digite" />
                </div>
              )}
              <button type="submit" className="w-full bg-ric-blue text-white rounded-[4px] p-2 text-[13px] font-bold hover:bg-[#002244] uppercase cursor-pointer">
                Adicionar
              </button>
            </form>
          </div>
        )}
      </div>
    );
  };

  const renderInternalTable = (targetDate: string) => {
    const dayPauteiroScales = pauteiroScales.filter(s => s.date === targetDate);
    const dayLabel = isWeekendDay ? \` (\${getDayName(targetDate)} - \${formatDateDisplay(targetDate)})\` : \` (\${formatDateDisplay(targetDate)})\`;
    const dayReporterScales = scales.filter(s => s.date === targetDate);

    return (
      <div key={\`int-\${targetDate}\`} className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border overflow-hidden mb-6">
        <div className="bg-[#EFF6FF] px-[20px] py-[15px] border-b border-ric-border border-t-[4px] border-t-ric-blue">
          <h2 className="text-[16px] font-bold text-ric-blue uppercase tracking-wider">Escala Interna (Produção / Editoria){dayLabel}</h2>
        </div>
        <table className="min-w-full divide-y divide-ric-border">
          <thead className="bg-[#F8F9FA]">
            <tr>
              <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider">Turno / Função</th>
              <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider">Horário</th>
              <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider">Colaborador</th>
              {isWeekendDay && <th className="px-5 py-3 text-left text-[12px] font-bold text-ric-muted uppercase tracking-wider bg-[#FFFBEB] border-l border-ric-border">Repórteres Pautados</th>}
              <th className="px-5 py-3 text-right text-[12px] font-bold text-ric-muted uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-ric-card divide-y divide-gray-100">
            {dayPauteiroScales.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text font-bold text-ric-blue">{s.shift}</td>
                <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-muted">{s.time}</td>
                <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text">
                  {getUserName(s.pauteiroId, 'pauteiro')}
                  {s.tradeInfo && <div className="text-[10px] text-ric-blue mt-1 font-medium">{s.tradeInfo}</div>}
                </td>
                {isWeekendDay && (
                  <td className="px-5 py-3 text-[13px] border-l border-ric-border bg-[#FFFBEB]/30">
                    {/* Somente exibe filtro e associação para pauteiros, não para apresentadores */}
                    {s.shift && !s.shift.toLowerCase().includes('apresentador') && !s.shift.toLowerCase().includes('editor') ? (
                      <>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {dayReporterScales.filter(sc => sc.pauteiroId && sc.pauteiroId.toLowerCase() === s.pauteiroId.toLowerCase()).map(sc => (
                            <span key={sc.id} className="bg-[#FFFBEB] text-[#D97706] border border-[#F59E0B]/50 px-2 py-1 rounded-[4px] text-[11px] font-bold flex items-center">
                              {getUserName(sc.reporterId, 'reporter')}
                              <button onClick={() => unbindReporterFromPauteiro(sc.id)} className="ml-1 text-[#D97706] hover:text-red-600"><X size={12}/></button>
                            </span>
                          ))}
                          {dayReporterScales.filter(sc => sc.pauteiroId && sc.pauteiroId.toLowerCase() === s.pauteiroId.toLowerCase()).length === 0 && (
                            <span className="text-[#D97706]/60 text-[11px] italic">Nenhum</span>
                          )}
                        </div>
                        <select 
                          className="block w-full max-w-[200px] rounded-[4px] border border-[#F59E0B]/30 shadow-sm p-1 bg-white text-[11px] font-medium text-ric-text focus:ring-[#D97706] focus:border-[#D97706] cursor-pointer"
                          onChange={(e) => {
                            bindReporterToPauteiro(e.target.value, s.pauteiroId);
                            e.target.value = '';
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>+ Adicionar repórter...</option>
                          {dayReporterScales.filter(sc => !sc.pauteiroId || sc.pauteiroId.toLowerCase() !== s.pauteiroId.toLowerCase()).map(sc => (
                            <option key={sc.id} value={sc.id}>{getUserName(sc.reporterId, 'reporter')} ({sc.time})</option>
                          ))}
                        </select>
                      </>
                    ) : <span className="text-gray-400 italic text-[11px]">- (Não aplica)</span>}
                  </td>
                )}
                <td className="px-5 py-3 whitespace-nowrap text-right text-sm">
                  {(userData?.name === getUserName(s.pauteiroId, 'pauteiro')) && (
                    <button 
                      onClick={() => { setScaleToTrade(s); setIsTradingPauteiro(true); setTradeModalOpen(true); }} 
                      className="text-ric-blue hover:underline text-[12px] font-bold mr-3"
                    >
                      Solicitar Troca
                    </button>
                  )}
                  <button onClick={() => removeScale(s.id, true)} className="text-ric-muted hover:text-ric-red ml-3"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
            {dayPauteiroScales.length === 0 && (
              <tr><td colSpan={isWeekendDay ? 5 : 4} className="px-5 py-4 text-center text-[13px] text-ric-muted">Nenhuma escala definida.</td></tr>
            )}
            <tr>
              <td colSpan={isWeekendDay ? 5 : 4} className="bg-[#F8F9FA] px-5 py-2 border-t border-ric-border">
                <button 
                  onClick={() => {
                    setShowPauteiroForm(showPauteiroForm === targetDate ? null : targetDate);
                    setNewPauteiroScale(p => ({...p, targetDate}));
                  }} 
                  className="text-ric-blue text-[12px] font-bold hover:underline"
                >
                  {showPauteiroForm === targetDate ? '- Cancelar adição' : '+ Adicionar linha (Pauteiro/Produtor/Apresentador)'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        
        {showPauteiroForm === targetDate && (
          <div className="p-4 bg-[#F8F9FA] border-t border-ric-border">
            <h3 className="text-[14px] font-bold mb-[15px] uppercase text-ric-text">Adicionar Escala Manual</h3>
            <form onSubmit={(e) => handleAddPauteiroScale(e, targetDate)} className="grid grid-cols-1 md:grid-cols-4 gap-[15px] items-end">
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Turno / Função</label>
                <input type="text" list="production-roles-options" value={newPauteiroScale.shift} onChange={e => setNewPauteiroScale({...newPauteiroScale, shift: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" placeholder="Ex: Pauteiro, Apresentador BG" />
                <datalist id="production-roles-options">
                  <option value="Manhã" />
                  <option value="Tarde" />
                  <option value="Noite" />
                  <option value="Apresentador Balanço Geral" />
                  <option value="Editor-chefe Balanço Geral" />
                </datalist>
              </div>
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Horário</label>
                <input type="text" value={newPauteiroScale.time} onChange={e => setNewPauteiroScale({...newPauteiroScale, time: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" />
              </div>
              <div>
                <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Colaborador</label>
                <input type="text" list="user-options" value={newPauteiroScale.pauteiroId} onChange={e => setNewPauteiroScale({...newPauteiroScale, pauteiroId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[14px] focus:ring-ric-blue focus:border-ric-blue" placeholder="Selecione ou digite" />
              </div>
              <button type="submit" className="w-full bg-ric-blue text-white rounded-[4px] p-2 text-[13px] font-bold hover:bg-[#002244] uppercase cursor-pointer">
                Adicionar Colaborador
              </button>
            </form>
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
        {reporters.map(r => <option key={r.uid} value={r.name} />)}
      </datalist>
      <datalist id="cinegrafista-options">
        {cinegrafistas.map(r => <option key={r.uid} value={r.name} />)}
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
        
        {isWeekendDay && (
          <div className="flex items-center ml-0 md:ml-4 bg-[#FFFBEB] px-4 py-2 rounded-[6px] border border-[#F59E0B]/50 shadow-sm">
            <span className="text-[13px] font-bold text-[#D97706] mr-2 uppercase">CHEFIA GERAL DO FINAL DE SEMANA:</span>
            <input 
               list="user-options"
               value={weekendChefiaId} 
               onChange={handleChefiaChange}
               placeholder="Selecione ou digite"
               className="rounded-[4px] border border-[#F59E0B]/30 shadow-sm px-2 py-[4px] bg-white text-[13px] font-medium text-ric-text focus:ring-[#D97706] focus:border-[#D97706] ml-2 w-48"
            />
          </div>
        )}
      </div>

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
        <div className="mb-4">
          {viewDates.map(d => renderReporterTable(d))}
        </div>
        
        {/* Render ALL grouped internal scales next */}
        <div className="mb-4">
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
                    ? allSystemUsers.filter(u => u.uid !== user?.uid).map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)
                    : scaleToTrade.reporterId === userData?.name 
                      ? reporters.filter(u => u.uid !== user?.uid).map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)
                      : cinegrafistas.filter(u => u.uid !== user?.uid).map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)
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
    </div>
  );
}
`;

fs.writeFileSync('src/pages/Scales.tsx', fileContent);
console.log('Scales successfully written');
