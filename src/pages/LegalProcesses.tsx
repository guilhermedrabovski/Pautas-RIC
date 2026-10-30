import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { LegalProcess, CourtSystem } from '../types/legalProcess';
import { 
  Scale, 
  Plus, 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  Trash2, 
  Edit3, 
  X, 
  Users, 
  AlertCircle,
  FileText,
  Bookmark
} from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';

const COURT_OPTIONS: CourtSystem[] = [
  'TJPR Projudi',
  'TJPR Eproc',
  'PCPR (Inquérito)',
  'TRF4',
  'Justiça Federal',
  'Outro'
];

export default function LegalProcesses() {
  const { userData } = useAuth();
  const [processes, setProcesses] = useState<LegalProcess[]>([]);
  const [availableStories, setAvailableStories] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'tjpr' | 'pcpr' | 'preso'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<LegalProcess | null>(null);

  // Simplified Form Fields
  const [formCaseName, setFormCaseName] = useState('');
  const [formStoryId, setFormStoryId] = useState('');
  const [formProcessNumber, setFormProcessNumber] = useState('');
  const [formDefendants, setFormDefendants] = useState('');
  const [formCourt, setFormCourt] = useState<CourtSystem>('TJPR Projudi');
  const [formDefendantStatus, setFormDefendantStatus] = useState<string>('Em Liberdade');
  const [formVara, setFormVara] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Copy tracking
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load processes in real-time
  useEffect(() => {
    const q = query(collection(db, 'legal_processes'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<LegalProcess, 'id'>)
      }));
      setProcesses(list);
      setIsLoading(false);
    }, (err) => {
      console.warn('Erro ao carregar processos:', err);
      setIsLoading(false);
    });

    return () => unsub();
  }, []);

  // Load existing stories for quick case link
  useEffect(() => {
    getDocs(collection(db, 'stories')).then(snap => {
      const list = snap.docs.map(d => ({
        id: d.id,
        title: d.data().title || 'Caso sem título'
      }));
      setAvailableStories(list);
    }).catch(err => console.warn('Erro ao carregar matérias:', err));
  }, []);

  const resetForm = () => {
    setEditingProcess(null);
    setFormCaseName('');
    setFormStoryId('');
    setFormProcessNumber('');
    setFormDefendants('');
    setFormCourt('TJPR Projudi');
    setFormDefendantStatus('Em Liberdade');
    setFormVara('');
    setFormNotes('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (proc: LegalProcess) => {
    setEditingProcess(proc);
    setFormCaseName(proc.caseName || proc.storyTitle || '');
    setFormStoryId(proc.storyId || '');
    setFormProcessNumber(proc.processNumber || '');
    setFormDefendants(proc.defendants || '');
    setFormCourt(proc.court || 'TJPR Projudi');
    setFormDefendantStatus(proc.defendantStatus || 'Em Liberdade');
    setFormVara(proc.vara || (proc.comarca ? `${proc.vara ? proc.vara + ' - ' : ''}${proc.comarca}` : ''));
    setFormNotes(proc.notes || proc.summary || '');
    setIsModalOpen(true);
  };

  const handleSelectStory = (storyId: string) => {
    setFormStoryId(storyId);
    if (!storyId) return;
    const found = availableStories.find(s => s.id === storyId);
    if (found && !formCaseName.trim()) {
      setFormCaseName(found.title);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProcessNumber.trim()) {
      return toast.error('Informe o número do processo ou do inquérito.');
    }

    const finalCaseName = formCaseName.trim() || 
      (formStoryId ? availableStories.find(s => s.id === formStoryId)?.title : '') || 
      'Caso sem título';

    setIsSaving(true);
    try {
      const now = Date.now();
      const payload: Partial<LegalProcess> = {
        processNumber: formProcessNumber.trim(),
        caseName: finalCaseName,
        storyTitle: finalCaseName,
        storyId: formStoryId || undefined,
        defendants: formDefendants.trim() || undefined,
        court: formCourt,
        defendantStatus: formDefendantStatus || undefined,
        vara: formVara.trim() || undefined,
        notes: formNotes.trim() || undefined,
        createdBy: editingProcess?.createdBy || userData?.uid || 'anon',
        createdByName: editingProcess?.createdByName || userData?.name || 'Redação',
        updatedAt: now
      };

      if (!editingProcess) {
        payload.createdAt = now;
        await addDoc(collection(db, 'legal_processes'), payload);
        toast.success('Número de processo cadastrado!');
      } else {
        await updateDoc(doc(db, 'legal_processes', editingProcess.id), payload);
        toast.success('Processo atualizado!');
      }

      setIsModalOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error('Erro ao salvar processo: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (proc: LegalProcess) => {
    const label = proc.caseName || proc.storyTitle || proc.processNumber;
    confirmAction(`Deseja remover o processo do caso "${label}"?`, async () => {
      try {
        await deleteDoc(doc(db, 'legal_processes', proc.id));
        toast.success('Processo removido.');
      } catch (err: any) {
        toast.error('Erro ao excluir: ' + err.message);
      }
    });
  };

  const handleCopyProcess = (proc: LegalProcess) => {
    navigator.clipboard.writeText(proc.processNumber);
    setCopiedId(proc.id);
    toast.success(`Número ${proc.processNumber} copiado!`);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // Filtered list
  const filteredProcesses = useMemo(() => {
    return processes.filter(proc => {
      // Text search
      const term = searchTerm.toLowerCase().trim();
      const caseName = (proc.caseName || proc.storyTitle || '').toLowerCase();
      const num = (proc.processNumber || '').toLowerCase();
      const defs = (proc.defendants || '').toLowerCase();
      const court = (proc.court || '').toLowerCase();
      const notes = (proc.notes || proc.summary || '').toLowerCase();
      const vara = (proc.vara || proc.comarca || '').toLowerCase();

      const matchesSearch = !term || 
        caseName.includes(term) || 
        num.includes(term) || 
        defs.includes(term) || 
        court.includes(term) || 
        notes.includes(term) ||
        vara.includes(term);

      if (!matchesSearch) return false;

      // Quick filter
      if (quickFilter === 'tjpr') {
        return (proc.court || '').toLowerCase().includes('tjpr');
      }
      if (quickFilter === 'pcpr') {
        return (proc.court || '').toLowerCase().includes('pcpr') || (proc.court || '').toLowerCase().includes('inquérito');
      }
      if (quickFilter === 'preso') {
        return (proc.defendantStatus || '').toLowerCase().includes('pres');
      }

      return true;
    });
  }, [processes, searchTerm, quickFilter]);

  return (
    <div className="space-y-5 pb-16 max-w-6xl mx-auto">
      {/* Header Bar Simplificado */}
      <div className="bg-white rounded-xl p-5 shadow-xs border border-ric-border flex flex-col md:flex-row md:items-center justify-between gap-4 border-t-4 border-t-amber-600">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <Scale size={22} />
            </span>
            <h1 className="text-xl font-black text-ric-blue uppercase tracking-tight">
              Processos dos Casos da TV
            </h1>
          </div>
          <p className="text-xs text-ric-muted">
            Consulta rápida de números de processos (CNJ), inquéritos e réus dos casos cobertos na programação.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="https://projudi.tjpr.jus.br/projudi/consulta/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-colors"
            title="Abrir Consulta Pública do Projudi TJPR"
          >
            <span>Projudi TJPR</span>
            <ExternalLink size={13} />
          </a>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="bg-amber-600 hover:bg-amber-700 active:scale-95 text-white px-4 py-2 rounded-lg text-xs font-black uppercase shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Plus size={16} strokeWidth={3} /> Cadastrar Processo
          </button>
        </div>
      </div>

      {/* Busca Rápida & Filtros Simples */}
      <div className="bg-white rounded-xl p-4 shadow-xs border border-ric-border space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Digite o nome do caso, número do CNJ ou nome do réu para consultar na hora..."
            className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl pl-10 pr-10 py-2.5 text-xs md:text-sm text-ric-text outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all font-medium"
            autoFocus
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
              title="Limpar busca"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Botões Rápidos */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold text-gray-400 uppercase mr-1">Filtro:</span>
            <button
              type="button"
              onClick={() => setQuickFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                quickFilter === 'all'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Todos ({processes.length})
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter('tjpr')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                quickFilter === 'tjpr'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              TJPR (Projudi / Eproc)
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter('pcpr')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                quickFilter === 'pcpr'
                  ? 'bg-slate-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Inquéritos / PCPR
            </button>
            <button
              type="button"
              onClick={() => setQuickFilter('preso')}
              className={`px-3 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                quickFilter === 'preso'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Réus Presos
            </button>
          </div>

          <span className="text-[11px] text-gray-400 font-medium">
            Exibindo {filteredProcesses.length} {filteredProcesses.length === 1 ? 'caso' : 'casos'}
          </span>
        </div>
      </div>

      {/* Lista de Casos e Números de Processo */}
      {isLoading ? (
        <div className="bg-white rounded-xl p-8 border border-ric-border text-center text-xs text-gray-500">
          Carregando processos dos casos...
        </div>
      ) : filteredProcesses.length === 0 ? (
        <div className="bg-white rounded-xl p-10 border border-dashed border-gray-300 text-center space-y-3">
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
            <Scale size={24} />
          </div>
          <h3 className="font-bold text-ric-text text-sm">
            {searchTerm ? 'Nenhum processo encontrado para esta busca.' : 'Nenhum número de processo cadastrado ainda.'}
          </h3>
          <p className="text-xs text-ric-muted max-w-md mx-auto">
            {searchTerm
              ? 'Tente buscar com outro nome de caso, número de processo ou réu.'
              : 'Cadastre os números de processos dos casos acompanhados pela TV para consulta rápida da equipe.'}
          </p>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer"
          >
            <Plus size={14} strokeWidth={3} /> Cadastrar Processo do Caso
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProcesses.map(proc => {
            const caseTitle = proc.caseName || proc.storyTitle || 'Caso Sem Nome';
            const isCopied = copiedId === proc.id;
            const isPreso = (proc.defendantStatus || '').toLowerCase().includes('pres');

            return (
              <div 
                key={proc.id}
                className="bg-white rounded-xl border border-ric-border p-4 shadow-xs hover:border-amber-400 transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Top Bar: Court badge & status */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                      {proc.court || 'TJPR Projudi'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isPreso && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                          Preso
                        </span>
                      )}
                      {proc.vara && (
                        <span className="text-[11px] text-gray-500 font-medium truncate max-w-[180px]">
                          {proc.vara}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Nome do Caso */}
                  <h3 className="font-black text-base text-ric-text leading-tight group-hover:text-amber-800 transition-colors">
                    {caseTitle}
                  </h3>

                  {/* Número do Processo Destacado + Botão Copiar */}
                  <div className="mt-3 bg-[#F8F9FA] border border-gray-200 rounded-lg p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        Número do Processo / CNJ
                      </span>
                      <span className="font-mono font-black text-xs sm:text-sm text-ric-blue select-all truncate block">
                        {proc.processNumber}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyProcess(proc)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                        isCopied 
                          ? 'bg-emerald-600 text-white shadow-xs' 
                          : 'bg-white hover:bg-amber-50 hover:text-amber-700 text-gray-700 border border-gray-200 shadow-2xs'
                      }`}
                      title="Copiar número do processo"
                    >
                      {isCopied ? (
                        <>
                          <Check size={14} strokeWidth={3} />
                          <span>Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Réus / Investigados */}
                  {proc.defendants && (
                    <div className="mt-3 flex items-start gap-1.5 text-xs text-gray-700">
                      <Users size={14} className="text-gray-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-gray-500 text-[11px]">Réu(s) / Investigado(s): </span>
                        <span className="font-semibold text-ric-text">{proc.defendants}</span>
                      </div>
                    </div>
                  )}

                  {/* Observação rápida da TV */}
                  {proc.notes && (
                    <div className="mt-2 text-xs text-amber-900 bg-amber-50/70 border border-amber-100 rounded-lg p-2 leading-relaxed">
                      <span className="font-bold text-[10px] uppercase tracking-wider text-amber-800 block mb-0.5">
                        Anotação da TV:
                      </span>
                      {proc.notes}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-gray-400">
                    Cadastrado por {proc.createdByName || 'Redação'}
                  </span>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(proc)}
                      className="p-1.5 text-gray-400 hover:text-amber-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      title="Editar informações"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(proc)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir processo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Simples de Cadastro & Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-ric-border overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-[#F8F9FA] px-5 py-3.5 border-b border-ric-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                  <Scale size={18} />
                </span>
                <h3 className="font-black text-sm text-ric-blue uppercase">
                  {editingProcess ? 'Editar Processo do Caso' : 'Cadastrar Processo do Caso da TV'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Nome do Caso */}
              <div>
                <label className="block text-xs font-black uppercase text-ric-text mb-1">
                  Nome do Caso / Matéria da TV <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formCaseName}
                  onChange={e => setFormCaseName(e.target.value)}
                  placeholder="Ex: Caso Daniel, Homicídio no Boqueirão, Golpe do Pix..."
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs text-ric-text outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white font-medium"
                  required
                />

                {availableStories.length > 0 && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                    <Bookmark size={12} className="text-amber-600 shrink-0" />
                    <span>Ou vincular a uma matéria:</span>
                    <select
                      value={formStoryId}
                      onChange={e => handleSelectStory(e.target.value)}
                      className="bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[11px] text-gray-700 outline-none cursor-pointer max-w-[240px] truncate"
                    >
                      <option value="">Nenhuma matéria vinculada</option>
                      {availableStories.map(s => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Número do Processo */}
              <div>
                <label className="block text-xs font-black uppercase text-ric-text mb-1">
                  Número do Processo (CNJ ou Inquérito) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formProcessNumber}
                  onChange={e => setFormProcessNumber(e.target.value)}
                  placeholder="Ex: 0001234-56.2024.8.16.0013 ou IP 1234/2024"
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-ric-blue outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                  required
                />
              </div>

              {/* Réus / Investigados */}
              <div>
                <label className="block text-xs font-black uppercase text-ric-text mb-1">
                  Réu(s) / Investigado(s) / Envolvidos
                </label>
                <input
                  type="text"
                  value={formDefendants}
                  onChange={e => setFormDefendants(e.target.value)}
                  placeholder="Ex: Fulano de Tal, Ciclano da Silva..."
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs text-ric-text outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              {/* Tribunal & Situação */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-ric-text mb-1">
                    Tribunal / Sistema
                  </label>
                  <select
                    value={formCourt}
                    onChange={e => setFormCourt(e.target.value as CourtSystem)}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-ric-text outline-none cursor-pointer"
                  >
                    {COURT_OPTIONS.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-ric-text mb-1">
                    Situação do Réu
                  </label>
                  <select
                    value={formDefendantStatus}
                    onChange={e => setFormDefendantStatus(e.target.value)}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-ric-text outline-none cursor-pointer"
                  >
                    <option value="Em Liberdade">Em Liberdade</option>
                    <option value="Preso Preventivo">Preso Preventivo</option>
                    <option value="Prisão Temporária">Prisão Temporária</option>
                    <option value="Tornozeleira Eletrônica">Tornozeleira Eletrônica</option>
                    <option value="Foragido">Foragido</option>
                    <option value="Condenado Cumprindo">Condenado Cumprindo</option>
                    <option value="N/A">N/A</option>
                  </select>
                </div>
              </div>

              {/* Vara / Comarca */}
              <div>
                <label className="block text-xs font-black uppercase text-ric-text mb-1">
                  Vara / Comarca (Opcional)
                </label>
                <input
                  type="text"
                  value={formVara}
                  onChange={e => setFormVara(e.target.value)}
                  placeholder="Ex: 1ª Vara do Júri de Curitiba, Comarca de Colombo..."
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs text-ric-text outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
                />
              </div>

              {/* Anotação rápida da TV */}
              <div>
                <label className="block text-xs font-black uppercase text-ric-text mb-1">
                  Anotação Rápida da TV (Opcional)
                </label>
                <textarea
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Ex: Audiência marcada para 20/11; aguardando laudo do IML; réu pediu habeas corpus..."
                  rows={2}
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 text-xs text-ric-text outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white resize-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-black uppercase rounded-lg shadow-xs disabled:opacity-50 cursor-pointer transition-all"
                >
                  {isSaving ? 'Salvando...' : editingProcess ? 'Atualizar' : 'Salvar Processo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
