import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, getDocs, updateDoc, doc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { confirmAction } from '../lib/confirmHelper';
import AgendaForm from '../components/AgendaForm';
import { Edit2, Flame, Plus, TrendingUp, Download } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function Agendas() {
  const { userData, users } = useAuth();
  const [agendas, setAgendas] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'sugestoes' | 'em_andamento'>('em_andamento');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAgenda, setEditingAgenda] = useState<any>(null);
  const displayNames = getDisplayNames(users);

  useEffect(() => {
    const qAgendas = query(
      collection(db, 'agendas'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );

    const unsub = onSnapshot(qAgendas, snapshot => {
      setAgendas(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any)));
    });

    return () => unsub();
  }, []);

  const filteredAgendas = agendas.filter(a => {
    const matchesSearch = 
      (a.title || "").toLowerCase().includes((searchTerm || "").toLowerCase()) || 
      (a.slug || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
      getUserName(a.suggestedBy).toLowerCase().includes((searchTerm || "").toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchesDate = !dateFilter || a.date === dateFilter;

    return matchesSearch && matchesStatus && matchesDate;
  });

  const continuings = filteredAgendas.filter(a => a.continuing);
  const byStatus = {
    pending: filteredAgendas.filter(a => a.status === 'pending'),
    approved: filteredAgendas.filter(a => a.status === 'approved'),
    rejected: filteredAgendas.filter(a => a.status === 'rejected'),
    in_progress_bg: filteredAgendas.filter(a => a.status === 'in_progress' && a.journal === 'BG'),
    in_progress_ca: filteredAgendas.filter(a => a.status === 'in_progress' && a.journal === 'CA'),
    in_progress_other: filteredAgendas.filter(a => a.status === 'in_progress' && a.journal !== 'BG' && a.journal !== 'CA'),
  };

  const getUserName = (id: string) => {
    if (!id) return '';
    return displayNames[id] || users.find(u => u.uid === id)?.name || id;
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await updateDoc(doc(db, 'agendas', id), { 
        status, 
        updatedAt: Date.now(),
        updatedBy: userData?.uid,
        updatedByName: userData?.name || 'Sistema'
      });
      toast.success('Status atualizado');
    } catch(err:any){ toast.error(err.message); }
  }

  const handleDelete = async (id: string) => {
    if (userData?.role !== 'admin') {
      return toast.error('Apenas administradores podem apagar pautas.');
    }
    confirmAction('Deseja realmente apagar esta pauta?', async () => {
      try {
        await deleteDoc(doc(db, 'agendas', id));
        toast.success('Pauta apagada com sucesso');
      } catch(err:any){ toast.error(err.message); }
    });
  }

  const exportMochilinksXLSX = () => {
    const mochilinks = agendas.filter(a => a.isMochilink && (a.status === 'approved' || a.status === 'in_progress'));
    if(mochilinks.length === 0) return toast.error('Não há mochilinks para exportar');
    
    const data = mochilinks.map(m => ({
      'Retranca': m.slug,
      'Título': m.title,
      'Repórter': getUserName(m.reporterId),
      'Cinegrafista': m.cinegrafistaId || '-',
      'Sucesso Audiência': m.audienceSuccess ? 'Sim' : 'Não'
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mochilinks");
    XLSX.writeFile(wb, `mochilinks-todas-pautas.xlsx`);
  }

  const renderCard = (a: any) => {
    const isUrgent = a.priority === 'alta';
    return (
    <div key={a.id} className={`border-b px-[15px] py-[12px] flex flex-col gap-2 relative group transition-all ${
      isUrgent ? 'bg-red-50/90 border-l-4 border-l-red-600 border-red-200 ring-2 ring-red-500/20 shadow-xs' :
      a.continuing ? 'bg-[#FFF5F5] border-l-4 border-l-ric-red border-ric-border' : 
      a.audienceSuccess ? 'bg-[#FFF8E1] border-l-4 border-l-ric-yellow border-ric-border' : 
      'bg-ric-card border-l-4 border-l-transparent border-ric-border'
    }`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-1.5 mb-1">
             <span className="font-mono text-[11px] bg-ric-bg text-ric-blue px-1.5 py-[2px] rounded-[3px] font-bold text-center">{a.slug}</span>
             {isUrgent && (
               <span className="text-[10px] bg-red-600 text-white font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1 shadow-xs animate-pulse ring-2 ring-red-400">
                 <Flame size={12} fill="white" /> URGENTE
               </span>
             )}
             {a.continuing && <span className="text-[9px] bg-ric-red text-white px-1.5 py-[1px] rounded-[2px] uppercase">Continuidade</span>}
             {a.isMochilink && <span className="text-[10px] bg-[#E3F2FD] text-[#1976D2] px-[6px] py-[2px] rounded-[10px] font-bold inline-block">Mochilink</span>}
          </div>
          <h4 className={`text-[14px] font-bold leading-tight mb-1 ${isUrgent ? 'text-red-950 font-black' : 'text-ric-text'}`}>
            {a.title}
          </h4>
          <p className="text-[12px] text-ric-muted mt-1 line-clamp-2">Criado por: {getUserName(a.suggestedBy) || 'N/A'}</p>
          {a.updatedByName && (
            <p className="text-[10px] text-ric-muted/70 italic">Última alteração por: {a.updatedByName}</p>
          )}
        </div>
        <div className="flex flex-col items-end pl-2">
          {isUrgent ? (
            <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-black uppercase flex items-center gap-1 shadow-xs">
              <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
              Prioridade Máxima
            </span>
          ) : null}
          {a.audienceSuccess && <div className="text-[11px] text-[#D48806] font-medium mt-1">Destaque 📈</div>}
          {(userData?.role === 'admin' || userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira' || a.suggestedBy === userData?.uid) && (
            <button onClick={() => { setEditingAgenda(a); setIsFormOpen(true); }} className="text-ric-muted hover:text-ric-red opacity-0 group-hover:opacity-100 transition-opacity p-1 mt-2">
              <Edit2 size={14} />
            </button>
          )}
        </div>
      </div>
      
      <div className="mt-1 pt-2 border-t border-transparent flex flex-col sm:flex-row sm:items-center justify-between text-[12px] text-ric-muted">
        <div>
          {a.reporterId && <span><strong>Repórter:</strong> {getUserName(a.reporterId)}</span>}
          {a.cinegrafistaId && <span> &bull; <strong>Cine:</strong> {a.cinegrafistaId}</span>}
        </div>
        {(userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira' || userData?.role === 'admin') && (
           <div className="flex gap-2">
             {a.status !== 'approved' && <button onClick={()=>updateStatus(a.id, 'approved')} className="text-ric-green hover:underline">Aprovar</button>}
             {a.status !== 'in_progress' && <button onClick={()=>updateStatus(a.id, 'in_progress')} className="text-ric-blue hover:underline">Andamento</button>}
             {a.status !== 'rejected' && <button onClick={()=>updateStatus(a.id, 'rejected')} className="text-ric-red hover:underline">Recusar</button>}
             {a.status !== 'pending' && <button onClick={()=>updateStatus(a.id, 'pending')} className="text-[#D48806] hover:underline">Pendente</button>}
             {userData?.role === 'admin' && (
               <button onClick={() => handleDelete(a.id)} className="text-gray-500 hover:text-ric-red hover:underline ml-2">Excluir</button>
             )}
           </div>
        )}
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-[15px]">
      <div className="flex justify-between items-center bg-ric-card p-[15px] rounded-[8px] border border-ric-border shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
        <h2 className="text-[16px] font-bold text-ric-text">Painel Geral de Pautas</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Buscar pauta..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 border border-ric-border rounded-[4px] text-[13px] bg-white outline-none focus:border-ric-red w-[180px]"
            />
            <select 
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-2 py-1.5 border border-ric-border rounded-[4px] text-[13px] bg-white outline-none focus:border-ric-red"
            >
              <option value="all">Todos Status</option>
              <option value="pending">Pendentes</option>
              <option value="approved">Aprovadas</option>
              <option value="in_progress">Em Andamento</option>
              <option value="rejected">Recusadas</option>
            </select>
            <input 
              type="date" 
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="px-2 py-1.5 border border-ric-border rounded-[4px] text-[13px] bg-white outline-none focus:border-ric-red"
            />
          </div>
          <button onClick={exportMochilinksXLSX} className="bg-white text-ric-text px-3 py-[10px] rounded border border-ric-border shadow-[0_1px_3px_rgba(0,0,0,0.1)] text-[12px] hover:bg-gray-50 flex items-center font-bold">
             <Download size={14} className="mr-1.5" /> Excel Mochilinks
          </button>
          <button 
            onClick={() => { setEditingAgenda(null); setIsFormOpen(true); }}
            className="bg-ric-red text-white px-[15px] py-[10px] rounded-[4px] text-[13px] font-bold hover:bg-[#c90000] border-none flex items-center cursor-pointer"
          >
            <Plus size={14} className="mr-1"/> Nova {activeTab === 'sugestoes' ? 'Sugestão' : 'Pauta'}
          </button>
        </div>
      </div>

      {continuings.length > 0 && (
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 border-l-4 border-orange-500 p-4 rounded-r-lg shadow-sm">
          <h3 className="text-lg font-bold text-orange-800 mb-3 flex items-center"><Flame className="mr-2"/> MATÉRIAS COM CONTINUIDADE (Acompanhar!)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {continuings.map(a => renderCard(a))}
          </div>
        </div>
      )}

      <div className="flex space-x-6 border-b border-ric-border mb-[15px]">
        <button 
          onClick={() => setActiveTab('sugestoes')} 
          className={`pb-2 text-[14px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'sugestoes' ? 'border-ric-red text-ric-red' : 'border-transparent text-ric-muted hover:text-ric-text'}`}
        >
          Sugestões
        </button>
        <button 
          onClick={() => setActiveTab('em_andamento')} 
          className={`pb-2 text-[14px] font-bold uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'em_andamento' ? 'border-ric-red text-ric-red' : 'border-transparent text-ric-muted hover:text-ric-text'}`}
        >
          Em Andamento
        </button>
      </div>

      {activeTab === 'sugestoes' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[15px] mb-[15px]">
          <div className="bg-ric-card border border-ric-border rounded-[8px] flex flex-col overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
             <div className="p-[15px] border-b border-ric-border flex justify-between items-center bg-ric-card">
                <h3 className="text-[16px] font-bold text-ric-text">⏳ Pendentes ({byStatus.pending.length})</h3>
             </div>
             <div className="flex-1 overflow-y-auto bg-ric-card">
               {byStatus.pending.map(renderCard)}
             </div>
          </div>
          <div className="bg-ric-card border border-ric-border rounded-[8px] flex flex-col overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
             <div className="p-[15px] border-b border-ric-border flex justify-between items-center bg-ric-card">
                <h3 className="text-[16px] font-bold text-ric-green">✅ Aprovadas ({byStatus.approved.length})</h3>
             </div>
             <div className="flex-1 overflow-y-auto bg-ric-card">
               {byStatus.approved.map(renderCard)}
             </div>
          </div>
          <div className="bg-ric-card border border-ric-border rounded-[8px] flex flex-col overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
             <div className="p-[15px] border-b border-ric-border flex justify-between items-center bg-ric-card">
                <h3 className="text-[16px] font-bold text-ric-muted">❌ Recusadas ({byStatus.rejected.length})</h3>
             </div>
             <div className="flex-1 overflow-y-auto bg-ric-card">
               {byStatus.rejected.map(renderCard)}
             </div>
          </div>
        </div>
      )}

      {activeTab === 'em_andamento' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-[15px]">
          <div className="bg-ric-card border border-ric-border rounded-[8px] flex flex-col overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
            <div className="p-[15px] border-b border-[#004e9a] flex justify-between items-center bg-[#004e9a]/5">
                <h3 className="text-[16px] font-bold text-[#004e9a]">🎬 Balanço Geral ({byStatus.in_progress_bg.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto bg-ric-card">
              {byStatus.in_progress_bg.map(renderCard)}
            </div>
          </div>
          
          <div className="bg-ric-card border border-ric-border rounded-[8px] flex flex-col overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
             <div className="p-[15px] border-b border-[#cc0000] flex justify-between items-center bg-[#cc0000]/5">
                <h3 className="text-[16px] font-bold text-[#cc0000]">🚨 Cidade Alerta ({byStatus.in_progress_ca.length})</h3>
             </div>
            <div className="flex-1 overflow-y-auto bg-ric-card">
              {byStatus.in_progress_ca.map(renderCard)}
            </div>
          </div>

          <div className="bg-ric-card border border-ric-border rounded-[8px] flex flex-col overflow-hidden h-[calc(100vh-280px)] min-h-[500px]">
            <div className="p-[15px] border-b border-gray-400 flex justify-between items-center bg-gray-50">
                <h3 className="text-[16px] font-bold text-gray-700">📺 Outros Jornalísticos ({byStatus.in_progress_other.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto bg-ric-card">
              {byStatus.in_progress_other.map(renderCard)}
            </div>
          </div>
        </div>
      )}

      {isFormOpen && <AgendaForm users={users} editData={editingAgenda} onClose={() => setIsFormOpen(false)} />}
    </div>
  );
}
