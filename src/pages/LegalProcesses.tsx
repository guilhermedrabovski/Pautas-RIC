import React, { useState, useEffect } from 'react';
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
import { 
  LegalProcess, 
  CourtSystem, 
  ProcessStage, 
  DefendantStatus 
} from '../types/legalProcess';
import { 
  Scale, 
  Plus, 
  Search, 
  Copy, 
  Check, 
  ExternalLink, 
  Calendar, 
  Clock, 
  ShieldAlert, 
  Lock, 
  Phone, 
  FileText, 
  Trash2, 
  Edit3, 
  X, 
  Filter, 
  BookOpen, 
  AlertTriangle,
  Gavel,
  User,
  Users,
  CheckCircle2
} from 'lucide-react';
import { format, parseISO, isAfter, isBefore, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';

const COURT_OPTIONS: CourtSystem[] = [
  'TJPR Projudi',
  'TJPR Eproc',
  'TRF4',
  'STJ',
  'STF',
  'Inquérito Policial (PCPR)',
  'Boletim de Ocorrência (SESP)',
  'Vara de Execuções (SEEU)',
  'Outro'
];

const STAGE_OPTIONS: ProcessStage[] = [
  'Inquérito Policial',
  'Denúncia Oferecida',
  'Audiência de Custódia',
  'Instrução e Julgamento',
  'Pronúncia (Júri Marcado)',
  'Sentença / Condenação',
  'Recurso em Andamento',
  'Execução da Pena',
  'Arquivado / Extinto'
];

const DEFENDANT_STATUS_OPTIONS: DefendantStatus[] = [
  'Preso Preventivo',
  'Prisão Temporária',
  'Prisão Domiciliar',
  'Tornozeleira Eletrônica',
  'Foragido',
  'Em Liberdade',
  'Condenado Cumprindo',
  'N/A'
];

export default function LegalProcesses() {
  const { userData } = useAuth();
  const [processes, setProcesses] = useState<LegalProcess[]>([]);
  const [availableStories, setAvailableStories] = useState<{ id: string; title: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourt, setSelectedCourt] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [filterSecretOnly, setFilterSecretOnly] = useState(false);
  const [filterHearingsOnly, setFilterHearingsOnly] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProcess, setEditingProcess] = useState<LegalProcess | null>(null);

  // Form Fields
  const [formProcessNumber, setFormProcessNumber] = useState('');
  const [formCourt, setFormCourt] = useState<CourtSystem>('TJPR Projudi');
  const [formComarca, setFormComarca] = useState('');
  const [formVara, setFormVara] = useState('');
  const [formStoryId, setFormStoryId] = useState('');
  const [formStoryTitle, setFormStoryTitle] = useState('');
  const [formDefendants, setFormDefendants] = useState('');
  const [formDefendantStatus, setFormDefendantStatus] = useState<DefendantStatus>('Em Liberdade');
  const [formVictims, setFormVictims] = useState('');
  const [formDefenseLawyer, setFormDefenseLawyer] = useState('');
  const [formDefenseLawyerPhone, setFormDefenseLawyerPhone] = useState('');
  const [formProsecutor, setFormProsecutor] = useState('');
  const [formJudge, setFormJudge] = useState('');
  const [formStage, setFormStage] = useState<ProcessStage>('Instrução e Julgamento');
  const [formIsSecret, setFormIsSecret] = useState(false);
  const [formNextHearingDate, setFormNextHearingDate] = useState('');
  const [formNextHearingTime, setFormNextHearingTime] = useState('');
  const [formNextHearingNotes, setFormNextHearingNotes] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formDocumentLink, setFormDocumentLink] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isManager = userData?.role === 'admin' || userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira';

  // Load processes
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

  // Load stories for linking
  useEffect(() => {
    getDocs(collection(db, 'stories')).then(snap => {
      const list = snap.docs.map(d => ({
        id: d.id,
        title: d.data().title || 'Caso sem título'
      }));
      setAvailableStories(list);
    }).catch(err => console.warn('Erro ao carregar histórias:', err));
  }, []);

  const resetForm = () => {
    setEditingProcess(null);
    setFormProcessNumber('');
    setFormCourt('TJPR Projudi');
    setFormComarca('');
    setFormVara('');
    setFormStoryId('');
    setFormStoryTitle('');
    setFormDefendants('');
    setFormDefendantStatus('Em Liberdade');
    setFormVictims('');
    setFormDefenseLawyer('');
    setFormDefenseLawyerPhone('');
    setFormProsecutor('');
    setFormJudge('');
    setFormStage('Instrução e Julgamento');
    setFormIsSecret(false);
    setFormNextHearingDate('');
    setFormNextHearingTime('');
    setFormNextHearingNotes('');
    setFormSummary('');
    setFormDocumentLink('');
    setFormNotes('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (proc: LegalProcess) => {
    setEditingProcess(proc);
    setFormProcessNumber(proc.processNumber || '');
    setFormCourt(proc.court || 'TJPR Projudi');
    setFormComarca(proc.comarca || '');
    setFormVara(proc.vara || '');
    setFormStoryId(proc.storyId || '');
    setFormStoryTitle(proc.storyTitle || '');
    setFormDefendants(proc.defendants || '');
    setFormDefendantStatus(proc.defendantStatus || 'Em Liberdade');
    setFormVictims(proc.victims || '');
    setFormDefenseLawyer(proc.defenseLawyer || '');
    setFormDefenseLawyerPhone(proc.defenseLawyerPhone || '');
    setFormProsecutor(proc.prosecutor || '');
    setFormJudge(proc.judge || '');
    setFormStage(proc.stage || 'Instrução e Julgamento');
    setFormIsSecret(proc.isSecret || false);
    setFormNextHearingDate(proc.nextHearingDate || '');
    setFormNextHearingTime(proc.nextHearingTime || '');
    setFormNextHearingNotes(proc.nextHearingNotes || '');
    setFormSummary(proc.summary || '');
    setFormDocumentLink(proc.documentLink || '');
    setFormNotes(proc.notes || '');
    setIsModalOpen(true);
  };

  const handleStorySelection = (storyId: string) => {
    setFormStoryId(storyId);
    if (!storyId) {
      setFormStoryTitle('');
      return;
    }
    const found = availableStories.find(s => s.id === storyId);
    if (found) {
      setFormStoryTitle(found.title);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formProcessNumber.trim()) {
      return toast.error('Informe o número do processo ou do inquérito.');
    }
    if (!formDefendants.trim()) {
      return toast.error('Informe ao menos o nome do(s) réu(s) ou investigado(s).');
    }

    setIsSaving(true);
    try {
      const now = Date.now();
      const payload: Omit<LegalProcess, 'id'> = {
        processNumber: formProcessNumber.trim(),
        court: formCourt,
        comarca: formComarca.trim() || undefined,
        vara: formVara.trim() || undefined,
        storyId: formStoryId || undefined,
        storyTitle: formStoryTitle.trim() || undefined,
        defendants: formDefendants.trim(),
        defendantStatus: formDefendantStatus,
        victims: formVictims.trim() || undefined,
        defenseLawyer: formDefenseLawyer.trim() || undefined,
        defenseLawyerPhone: formDefenseLawyerPhone.trim() || undefined,
        prosecutor: formProsecutor.trim() || undefined,
        judge: formJudge.trim() || undefined,
        stage: formStage,
        isSecret: formIsSecret,
        nextHearingDate: formNextHearingDate.trim() || undefined,
        nextHearingTime: formNextHearingTime.trim() || undefined,
        nextHearingNotes: formNextHearingNotes.trim() || undefined,
        summary: formSummary.trim() || undefined,
        documentLink: formDocumentLink.trim() || undefined,
        notes: formNotes.trim() || undefined,
        createdBy: editingProcess?.createdBy || userData?.uid || 'anon',
        createdByName: editingProcess?.createdByName || userData?.name || 'Redação',
        createdAt: editingProcess?.createdAt || now,
        updatedAt: now
      };

      if (editingProcess) {
        await updateDoc(doc(db, 'legal_processes', editingProcess.id), payload);
        toast.success('Processo atualizado com sucesso!');
      } else {
        await addDoc(collection(db, 'legal_processes'), payload);
        toast.success('Processo judicial cadastrado!');
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
    confirmAction(`Deseja excluir o processo "${proc.processNumber}"?`, async () => {
      try {
        await deleteDoc(doc(db, 'legal_processes', proc.id));
        toast.success('Processo removido.');
      } catch (err: any) {
        toast.error('Erro ao remover processo: ' + err.message);
      }
    });
  };

  const handleCopyProcess = (proc: LegalProcess) => {
    navigator.clipboard.writeText(proc.processNumber);
    setCopiedId(proc.id);
    toast.success(`CNJ ${proc.processNumber} copiado!`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openCourtLookup = (proc: LegalProcess) => {
    let url = `https://www.google.com/search?q=${encodeURIComponent(proc.processNumber + ' ' + proc.court)}`;
    if (proc.court.includes('Projudi') || proc.court.includes('TJPR')) {
      url = `https://consulta.tjpr.jus.br/projudi_consulta/`;
    } else if (proc.court.includes('Eproc')) {
      url = `https://eproc1g.tjpr.jus.br/eproc/`;
    } else if (proc.court.includes('TRF4')) {
      url = `https://consulta.trf4.jus.br/trf4/`;
    }
    window.open(url, '_blank');
  };

  // Filter calculations
  const filteredProcesses = processes.filter(p => {
    const term = searchTerm.toLowerCase().trim();
    if (term) {
      const matchNumber = p.processNumber.toLowerCase().includes(term);
      const matchDef = p.defendants.toLowerCase().includes(term);
      const matchVictim = p.victims?.toLowerCase().includes(term);
      const matchStory = p.storyTitle?.toLowerCase().includes(term);
      const matchComarca = p.comarca?.toLowerCase().includes(term);
      const matchLawyer = p.defenseLawyer?.toLowerCase().includes(term);
      if (!matchNumber && !matchDef && !matchVictim && !matchStory && !matchComarca && !matchLawyer) {
        return false;
      }
    }

    if (selectedCourt !== 'all' && p.court !== selectedCourt) {
      return false;
    }

    if (selectedStatus !== 'all' && p.defendantStatus !== selectedStatus) {
      return false;
    }

    if (filterSecretOnly && !p.isSecret) {
      return false;
    }

    if (filterHearingsOnly && !p.nextHearingDate) {
      return false;
    }

    return true;
  });

  // Statistics
  const totalCount = processes.length;
  const inPrisonCount = processes.filter(p => 
    p.defendantStatus === 'Preso Preventivo' || p.defendantStatus === 'Prisão Temporária' || p.defendantStatus === 'Condenado Cumprindo'
  ).length;
  const fugitivesCount = processes.filter(p => p.defendantStatus === 'Foragido').length;
  const secretCount = processes.filter(p => p.isSecret).length;
  const upcomingHearingsCount = processes.filter(p => {
    if (!p.nextHearingDate) return false;
    try {
      const d = parseISO(p.nextHearingDate);
      return !isBefore(d, startOfToday());
    } catch {
      return false;
    }
  }).length;

  return (
    <div className="space-y-[20px] pb-16">
      {/* Header Bar */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-ric-border flex flex-col md:flex-row md:items-center justify-between gap-4 border-t-4 border-t-amber-600">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-lg">
              <Scale size={24} />
            </span>
            <h1 className="text-2xl font-black text-ric-blue uppercase tracking-tight">
              Processos Judiciais & Inquéritos
            </h1>
          </div>
          <p className="text-xs text-ric-muted max-w-2xl leading-relaxed">
            Central jurídica da redação para acompanhar números CNJ, varas, réus presos/foragidos, promotores, advogados e datas de audiências e sessões do Tribunal do Júri.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="bg-amber-600 hover:bg-amber-700 active:scale-95 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase shadow-md flex items-center gap-2 cursor-pointer transition-all shrink-0"
        >
          <Plus size={16} strokeWidth={3} /> Cadastrar Processo
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-ric-border shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-ric-blue flex items-center justify-center shrink-0">
            <Scale size={20} />
          </div>
          <div>
            <span className="block text-xl font-black text-ric-text tabular-nums">{totalCount}</span>
            <span className="text-[11px] text-ric-muted font-bold uppercase">Total de Processos</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-ric-border shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center shrink-0">
            <ShieldAlert size={20} />
          </div>
          <div>
            <span className="block text-xl font-black text-red-700 tabular-nums">
              {inPrisonCount} <span className="text-xs font-normal text-slate-400">({fugitivesCount} foragidos)</span>
            </span>
            <span className="text-[11px] text-ric-muted font-bold uppercase">Réus Presos / Custódia</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-ric-border shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Calendar size={20} />
          </div>
          <div>
            <span className="block text-xl font-black text-emerald-700 tabular-nums">{upcomingHearingsCount}</span>
            <span className="text-[11px] text-ric-muted font-bold uppercase">Audiências Marcadas</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-ric-border shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Lock size={20} />
          </div>
          <div>
            <span className="block text-xl font-black text-purple-700 tabular-nums">{secretCount}</span>
            <span className="text-[11px] text-ric-muted font-bold uppercase">Segredo de Justiça</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-ric-border space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Buscar por CNJ, réu, vítima, caso, comarca ou advogado..."
              className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-xs text-ric-text outline-none focus:ring-1 focus:ring-amber-500 focus:bg-white transition-all font-medium"
            />
          </div>

          {/* Tribunal Filter */}
          <div className="w-full md:w-52">
            <select
              value={selectedCourt}
              onChange={e => setSelectedCourt(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-ric-text outline-none cursor-pointer"
            >
              <option value="all">Tribunal: Todos</option>
              {COURT_OPTIONS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Situação do Réu Filter */}
          <div className="w-full md:w-52">
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-ric-text outline-none cursor-pointer"
            >
              <option value="all">Situação do Réu: Todas</option>
              {DEFENDANT_STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100 flex-wrap">
          <span className="text-[11px] font-bold text-gray-400 uppercase flex items-center gap-1">
            <Filter size={12} /> Filtros rápidos:
          </span>

          <button
            type="button"
            onClick={() => setFilterHearingsOnly(!filterHearingsOnly)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterHearingsOnly
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Calendar size={13} />
            <span>Com Audiência Marcada</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterSecretOnly(!filterSecretOnly)}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              filterSecretOnly
                ? 'bg-purple-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Lock size={13} />
            <span>Apenas Segredo de Justiça</span>
          </button>

          {(searchTerm || selectedCourt !== 'all' || selectedStatus !== 'all' || filterSecretOnly || filterHearingsOnly) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedCourt('all');
                setSelectedStatus('all');
                setFilterSecretOnly(false);
                setFilterHearingsOnly(false);
              }}
              className="text-xs text-red-600 hover:underline font-bold ml-auto cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Process Cards List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white rounded-xl p-12 text-center text-xs font-bold text-ric-muted border border-gray-200">
            Carregando processos jurídicos...
          </div>
        ) : filteredProcesses.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center border border-dashed border-gray-300">
            <Scale size={36} className="mx-auto mb-2 text-gray-300" />
            <h3 className="font-bold text-sm text-ric-text">Nenhum processo judicial encontrado.</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Cadastre novos números de processos do Projudi, Eproc ou Inquéritos Policiais para centralizar a cobertura jurídica da equipe.
            </p>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="mt-4 bg-amber-600 text-white text-xs font-bold uppercase px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors"
            >
              Cadastrar Primeiro Processo
            </button>
          </div>
        ) : (
          filteredProcesses.map(proc => {
            const isSecret = proc.isSecret;
            const isPrisoner = proc.defendantStatus === 'Preso Preventivo' || proc.defendantStatus === 'Prisão Temporária';
            const isFugitive = proc.defendantStatus === 'Foragido';

            return (
              <div
                key={proc.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-gray-300 transition-all"
              >
                {/* Card Top Strip */}
                <div className="bg-[#F8F9FA] px-5 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Court Badge */}
                    <span className="font-black text-xs text-ric-blue bg-blue-100/70 border border-blue-200 px-2 py-0.5 rounded-md">
                      {proc.court}
                    </span>

                    {/* Stage Badge */}
                    <span className="text-[11px] font-bold text-slate-700 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-md">
                      {proc.stage}
                    </span>

                    {/* Secret Notice */}
                    {isSecret && (
                      <span className="font-black text-[11px] text-purple-800 bg-purple-100 border border-purple-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Lock size={12} /> Segredo de Justiça
                      </span>
                    )}

                    {/* Defendant Status Badge */}
                    {isPrisoner && (
                      <span className="font-black text-[11px] text-red-800 bg-red-100 border border-red-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <ShieldAlert size={12} /> {proc.defendantStatus}
                      </span>
                    )}
                    {isFugitive && (
                      <span className="font-black text-[11px] text-amber-900 bg-amber-200 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 animate-pulse">
                        <AlertTriangle size={12} /> FORAGIDO
                      </span>
                    )}
                    {!isPrisoner && !isFugitive && proc.defendantStatus && (
                      <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
                        {proc.defendantStatus}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(proc)}
                      className="p-1.5 text-gray-500 hover:text-ric-blue hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                      title="Editar dados do processo"
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

                {/* Card Body */}
                <div className="p-5 space-y-4">
                  {/* Process CNJ Number & Case Name */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      {proc.storyTitle && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 uppercase mb-1">
                          <BookOpen size={13} />
                          <span>Caso / Repercussão: {proc.storyTitle}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-lg md:text-xl font-mono font-black text-ric-text tracking-wide select-all">
                          {proc.processNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyProcess(proc)}
                          className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            copiedId === proc.id
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                          }`}
                          title="Copiar número do processo"
                        >
                          {copiedId === proc.id ? <Check size={14} /> : <Copy size={14} />}
                          <span>{copiedId === proc.id ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                      {(proc.comarca || proc.vara) && (
                        <p className="text-xs text-ric-muted mt-1 font-medium">
                          {proc.comarca && <strong>Comarca de {proc.comarca}</strong>}
                          {proc.comarca && proc.vara && ' • '}
                          {proc.vara}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openCourtLookup(proc)}
                        className="bg-ric-blue/10 hover:bg-ric-blue text-ric-blue hover:text-white px-3.5 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        title="Abrir página do tribunal para consulta"
                      >
                        <ExternalLink size={14} />
                        <span>Consultar no Tribunal</span>
                      </button>
                    </div>
                  </div>

                  {/* Upcoming Hearing Banner (se houver) */}
                  {proc.nextHearingDate && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-3">
                      <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0 mt-0.5">
                        <Calendar size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-xs uppercase text-emerald-900">
                            📅 Próxima Audiência / Sessão do Júri:
                          </span>
                          <span className="text-xs font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200 font-mono">
                            {format(parseISO(proc.nextHearingDate), 'dd/MM/yyyy')}
                            {proc.nextHearingTime && ` às ${proc.nextHearingTime}h`}
                          </span>
                        </div>
                        {proc.nextHearingNotes && (
                          <p className="text-xs text-emerald-950 mt-1 font-medium leading-relaxed">
                            {proc.nextHearingNotes}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Case Actors (Réus, Defesa, Acusação, Juiz) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#F8F9FA] p-3.5 rounded-xl border border-gray-100 text-xs">
                    {/* Réus */}
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-0.5">
                        Réu(s) / Investigado(s):
                      </span>
                      <p className="font-bold text-ric-text leading-snug">{proc.defendants}</p>
                      {proc.victims && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          Vítima: <strong>{proc.victims}</strong>
                        </p>
                      )}
                    </div>

                    {/* Defesa */}
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-0.5">
                        Advogado de Defesa:
                      </span>
                      <p className="font-bold text-ric-text leading-snug">
                        {proc.defenseLawyer || <span className="text-gray-400 italic">Não informado</span>}
                      </p>
                      {proc.defenseLawyerPhone && (
                        <a
                          href={`https://wa.me/55${proc.defenseLawyerPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 text-[11px] text-emerald-700 hover:underline flex items-center gap-1 font-bold"
                        >
                          <Phone size={11} /> {proc.defenseLawyerPhone} (WhatsApp)
                        </a>
                      )}
                    </div>

                    {/* Promotor / MPPR */}
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-0.5">
                        Ministério Público / Acusação:
                      </span>
                      <p className="font-bold text-ric-text leading-snug">
                        {proc.prosecutor || <span className="text-gray-400 italic">Não informado</span>}
                      </p>
                    </div>

                    {/* Juiz */}
                    <div>
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-0.5">
                        Magistrado / Juiz:
                      </span>
                      <p className="font-bold text-ric-text leading-snug">
                        {proc.judge || <span className="text-gray-400 italic">Não informado</span>}
                      </p>
                    </div>
                  </div>

                  {/* Summary / Despacho Recente */}
                  {proc.summary && (
                    <div className="text-xs">
                      <span className="text-[10px] font-black uppercase text-gray-400 block mb-1">
                        Resumo do Caso / Último Despacho Relevante:
                      </span>
                      <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 text-slate-800 leading-relaxed font-medium">
                        {proc.summary}
                      </div>
                    </div>
                  )}

                  {/* Document Link */}
                  {proc.documentLink && (
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={proc.documentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-ric-blue hover:underline font-bold bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg"
                      >
                        <FileText size={14} />
                        <span>Abrir Documento / Peça Jurídica (PDF/Drive)</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Footer Metadata */}
                <div className="bg-[#FAFBFD] px-5 py-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400 font-medium">
                  <span>Cadastrado por: <strong>{proc.createdByName}</strong></span>
                  <span className="font-mono">{proc.createdAt ? format(proc.createdAt, 'dd/MM/yyyy HH:mm') : ''}</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal de Cadastro & Edição de Processo */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4">
            {/* Modal Header */}
            <div className="bg-amber-600 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                  <Scale size={20} />
                </div>
                <div>
                  <h3 className="font-black uppercase text-sm tracking-tight">
                    {editingProcess ? 'Editar Processo Judicial' : 'Cadastrar Processo Judicial do Caso'}
                  </h3>
                  <p className="text-[11px] text-amber-100 font-medium">
                    Preencha os dados judiciais para consulta rápida da equipe de reportagem
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-full cursor-pointer text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Linked Story & Secret Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Vincular a uma História / Caso Existente (Opcional):
                  </label>
                  <select
                    value={formStoryId}
                    onChange={e => handleStorySelection(e.target.value)}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-bold outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    <option value="">-- Caso Geral / Não vinculado a história específica --</option>
                    {availableStories.map(s => (
                      <option key={s.id} value={s.id}>{s.title}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center">
                  <label className="flex items-center gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl cursor-pointer w-full select-none">
                    <input
                      type="checkbox"
                      checked={formIsSecret}
                      onChange={e => setFormIsSecret(e.target.checked)}
                      className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                    />
                    <div>
                      <span className="font-black text-purple-900 block text-xs">🔒 Segredo de Justiça</span>
                      <span className="text-[10px] text-purple-700">Restrito p/ divulgação</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Process Number & Court */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Número do Processo (CNJ) ou Inquérito <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formProcessNumber}
                    onChange={e => setFormProcessNumber(e.target.value)}
                    placeholder="Ex: 0012345-67.2024.8.16.0001 ou IP 145/2024"
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-mono font-bold text-sm outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Tribunal / Sistema <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formCourt}
                    onChange={e => setFormCourt(e.target.value as CourtSystem)}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-bold outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    {COURT_OPTIONS.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Comarca, Vara & Stage */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Comarca (Cidade)
                  </label>
                  <input
                    type="text"
                    value={formComarca}
                    onChange={e => setFormComarca(e.target.value)}
                    placeholder="Ex: Curitiba, Ponta Grossa..."
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Vara Judicial / Delegacia
                  </label>
                  <input
                    type="text"
                    value={formVara}
                    onChange={e => setFormVara(e.target.value)}
                    placeholder="Ex: 1ª Vara do Júri, DHPP..."
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Fase Processual Atual
                  </label>
                  <select
                    value={formStage}
                    onChange={e => setFormStage(e.target.value as ProcessStage)}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-bold outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    {STAGE_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Réus, Situação & Vítimas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Nome do(s) Réu(s) / Investigado(s) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formDefendants}
                    onChange={e => setFormDefendants(e.target.value)}
                    placeholder="Ex: João da Silva e Pedro Santos"
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-bold outline-none focus:ring-1 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Situação Atual do Réu
                  </label>
                  <select
                    value={formDefendantStatus}
                    onChange={e => setFormDefendantStatus(e.target.value as DefendantStatus)}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-bold outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                  >
                    {DEFENDANT_STATUS_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                  Vítima(s) (Opcional)
                </label>
                <input
                  type="text"
                  value={formVictims}
                  onChange={e => setFormVictims(e.target.value)}
                  placeholder="Ex: Maria Pereira"
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-medium outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Defense & Prosecution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Advogado de Defesa
                  </label>
                  <input
                    type="text"
                    value={formDefenseLawyer}
                    onChange={e => setFormDefenseLawyer(e.target.value)}
                    placeholder="Ex: Dr. Carlos Eduardo (OAB/PR 12345)"
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-medium outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Telefone / WhatsApp da Defesa (Para Entrevistas)
                  </label>
                  <input
                    type="text"
                    value={formDefenseLawyerPhone}
                    onChange={e => setFormDefenseLawyerPhone(e.target.value)}
                    placeholder="Ex: (41) 99999-8888"
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-medium outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Promotor(a) de Justiça / MPPR
                  </label>
                  <input
                    type="text"
                    value={formProsecutor}
                    onChange={e => setFormProsecutor(e.target.value)}
                    placeholder="Ex: Dr. Marcelo Rocha"
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-medium outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                    Magistrado / Juiz(a)
                  </label>
                  <input
                    type="text"
                    value={formJudge}
                    onChange={e => setFormJudge(e.target.value)}
                    placeholder="Ex: Dra. Ana Paula Silva"
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-medium outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Hearing Info */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-3">
                <h4 className="font-black uppercase text-xs text-emerald-900 flex items-center gap-1.5">
                  <Calendar size={15} /> Próxima Audiência ou Sessão do Júri (Pauta da TV)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-emerald-800 mb-1">
                      Data da Audiência
                    </label>
                    <input
                      type="date"
                      value={formNextHearingDate}
                      onChange={e => setFormNextHearingDate(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-2 font-bold outline-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-emerald-800 mb-1">
                      Horário
                    </label>
                    <input
                      type="time"
                      value={formNextHearingTime}
                      onChange={e => setFormNextHearingTime(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg p-2 font-bold outline-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-emerald-800 mb-1">
                      Detalhes da Sessão
                    </label>
                    <input
                      type="text"
                      value={formNextHearingNotes}
                      onChange={e => setFormNextHearingNotes(e.target.value)}
                      placeholder="Ex: Oitiva de 5 testemunhas e interrogatório"
                      className="w-full bg-white border border-emerald-300 rounded-lg p-2 outline-none font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Summary & Doc Link */}
              <div>
                <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                  Resumo do Caso & Último Despacho Judicial
                </label>
                <textarea
                  rows={3}
                  value={formSummary}
                  onChange={e => setFormSummary(e.target.value)}
                  placeholder="Ex: Juiz manteve a prisão preventiva por conveniência da instrução penal. Audiência remarcada..."
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-3 font-medium outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-gray-600 mb-1">
                  Link da Peça / Decisão Judicial (Google Drive / Nuvem)
                </label>
                <input
                  type="url"
                  value={formDocumentLink}
                  onChange={e => setFormDocumentLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-2.5 font-medium outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-xs font-bold uppercase hover:bg-gray-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="bg-amber-600 hover:bg-amber-700 active:scale-95 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Salvando...' : editingProcess ? 'Atualizar Processo' : 'Cadastrar Processo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
