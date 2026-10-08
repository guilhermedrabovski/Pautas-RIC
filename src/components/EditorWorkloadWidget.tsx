import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { IMAGE_EDITORS_LIST } from '../lib/constants';
import { 
  Film, 
  Play, 
  CheckCircle2, 
  Sparkles, 
  Clock, 
  Video, 
  ArrowRight,
  Flame,
  Plus
} from 'lucide-react';
import { Link } from 'react-router-dom';

export interface EditorWorkloadItem {
  id: string;
  name: string;
  username: string;
  activeRetrancas: any[];
  concludedRetrancas: any[];
  pendingRetrancas: any[];
  isFree: boolean;
  hasUrgent: boolean;
  isEditing: boolean;
  workloadScore: number;
  sharePercent: number;
}

interface EditorWorkloadWidgetProps {
  initialRetrancas?: any[];
  initialEditors?: any[];
  onAssignClick?: (editorId: string) => void;
  showLinkToDashboard?: boolean;
}

// Official image editors of the newsroom: Zand, Jamir, Jean, Vagner, Valdeilton
const OFFICIAL_IMAGE_EDITORS = [
  { uid: 'zand', username: 'zand', name: 'Zand', role: 'editor' },
  { uid: 'jamir', username: 'jamir', name: 'Jamir', role: 'editor' },
  { uid: 'jean', username: 'jean', name: 'Jean', role: 'editor' },
  { uid: 'vagner', username: 'vagner', name: 'Vagner', role: 'editor' },
  { uid: 'valdeilton', username: 'valdeilton', name: 'Valdeilton', role: 'editor' }
];

const normalizeStr = (str: string) => 
  (str || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function EditorWorkloadWidget({
  initialRetrancas,
  initialEditors,
  onAssignClick,
  showLinkToDashboard = true
}: EditorWorkloadWidgetProps) {
  const [retrancas, setRetrancas] = useState<any[]>(initialRetrancas || []);
  const [editorsList, setEditorsList] = useState<any[]>(initialEditors || []);

  // Listen to retrancas
  useEffect(() => {
    if (initialRetrancas !== undefined) {
      setRetrancas(initialRetrancas);
      return;
    }
    const q = query(collection(db, 'retrancas'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setRetrancas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn('Could not listen to retrancas:', err));
    return unsub;
  }, [initialRetrancas]);

  // Listen to editors / users
  useEffect(() => {
    if (initialEditors !== undefined && initialEditors.length > 0) {
      setEditorsList(initialEditors);
      return;
    }

    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, snap => {
      const dbUsers = snap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }));
      setEditorsList(dbUsers);
    }, () => {
      setEditorsList(IMAGE_EDITORS_LIST);
    });

    return unsub;
  }, [initialEditors]);

  // Resolve all aliases and known IDs (both Auth UID and username) for each editor
  const effectiveEditors = OFFICIAL_IMAGE_EDITORS.map(official => {
    const found = editorsList.find((e: any) => {
      const rawId = normalizeStr(e.id || e.uid || '');
      const rawUser = normalizeStr(e.username || '');
      const rawName = normalizeStr(e.name || '');
      const target = official.uid;
      const isLegacyMatch = target === 'vagner' && (rawId === 'miudo' || rawUser === 'miudo' || rawName.includes('miudo'));
      return rawId === target || rawUser === target || rawName === target || rawName.includes(target) || rawId.includes(target) || isLegacyMatch;
    });

    const extraAliases = official.uid === 'vagner' ? ['miudo', 'miú'] : [];
    const allKnownIds = Array.from(new Set([
      official.uid,
      official.username,
      found?.id,
      found?.uid,
      normalizeStr(official.name),
      ...extraAliases
    ].filter(Boolean).map(s => normalizeStr(String(s)))));

    return {
      uid: found?.id || found?.uid || official.uid,
      allKnownIds,
      username: official.username,
      name: official.name,
      role: 'editor',
      ...(found ? { photoURL: found.photoURL } : {})
    };
  });

  // Comprehensive match between editor and retranca (handles Auth UIDs, usernames, names)
  const isMatch = (ed: any, r: any) => {
    if (!r) return false;
    const target = normalizeStr(r.editorId || '');
    const targetName = normalizeStr(r.editorName || '');

    if (!target && !targetName) return false;

    // Direct match against known IDs
    if (target) {
      if (ed.allKnownIds && ed.allKnownIds.includes(target)) return true;
      if (normalizeStr(ed.uid) === target || normalizeStr(ed.username) === target || normalizeStr(ed.name) === target) return true;
      if (target.includes(normalizeStr(ed.name)) || normalizeStr(ed.name).includes(target)) return true;

      // Cross reference with users list to map UID -> Name
      const matchingUser = editorsList.find((u: any) => normalizeStr(u.id || u.uid || '') === target);
      if (matchingUser) {
        const uName = normalizeStr(matchingUser.name || '');
        const edName = normalizeStr(ed.name);
        if (uName === edName || uName.includes(edName) || edName.includes(uName)) return true;
      }
    }

    // Match by editorName
    if (targetName) {
      const edName = normalizeStr(ed.name);
      if (targetName === edName || targetName.includes(edName) || edName.includes(targetName)) return true;
    }

    return false;
  };

  // Calculate statistics per editor
  // An editor is occupied if they have ANY retranca assigned that is NOT concluded ('editando' OR 'pendente')
  const editorStats: EditorWorkloadItem[] = effectiveEditors.map(ed => {
    const active = retrancas.filter(r => 
      (r.status === 'editando' || r.status === 'pendente') && isMatch(ed, r)
    );
    const concluded = retrancas.filter(r => 
      r.status === 'concluido' && isMatch(ed, r)
    );
    const pending = retrancas.filter(r => 
      r.status === 'pendente' && isMatch(ed, r)
    );
    const editing = retrancas.filter(r => 
      r.status === 'editando' && isMatch(ed, r)
    );
    const hasUrgent = active.some(r => !!r.isUrgent);

    const isFree = active.length === 0;
    const isEditing = editing.length > 0;
    const workloadScore = isFree ? 0 : 100;

    return {
      id: ed.uid || ed.username,
      name: ed.name,
      username: ed.username || ed.uid,
      activeRetrancas: active,
      concludedRetrancas: concluded,
      pendingRetrancas: pending,
      isFree,
      hasUrgent,
      isEditing,
      workloadScore,
      sharePercent: isFree ? 0 : 100
    };
  });

  const freeEditors = editorStats.filter(e => e.isFree);
  const busyEditors = editorStats.filter(e => !e.isFree);

  return (
    <div className="bg-white rounded-2xl border border-ric-border shadow-xs p-5 space-y-4">
      {/* Header with Title and Global Counts */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-ric-blue flex items-center justify-center font-bold">
            <Film size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Ilhas de Edição
              </h2>
              <span className="bg-blue-100 text-ric-blue text-[10px] font-black uppercase px-2 py-0.5 rounded-full">
                Ao Vivo
              </span>
              <span className="text-xs font-bold text-slate-500">
                ({busyEditors.length} ocupada{busyEditors.length !== 1 ? 's' : ''} • {freeEditors.length} livre{freeEditors.length !== 1 ? 's' : ''})
              </span>
            </div>
            <p className="text-xs text-ric-muted font-bold">
              Disponibilidade e ocupação dos editores de imagem em tempo real
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showLinkToDashboard && (
            <Link 
              to="/editor-dashboard" 
              className="text-xs font-black uppercase text-ric-blue hover:text-blue-800 flex items-center gap-1 hover:underline"
            >
              Abrir Ilhas de Edição <ArrowRight size={14} />
            </Link>
          )}
        </div>
      </div>

      {/* Prominent Alert Banner for Free Editors */}
      {freeEditors.length > 0 ? (
        <div className="p-3.5 bg-emerald-50 border-2 border-emerald-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3.5 w-3.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
            </span>
            <div>
              <div className="text-xs font-black uppercase text-emerald-900 tracking-wide flex items-center gap-1.5">
                <Sparkles size={15} className="text-emerald-600" />
                Alerta de Disponibilidade: {freeEditors.length} {freeEditors.length === 1 ? 'editor livre' : 'editores livres'} agora!
              </div>
              <p className="text-[11px] text-emerald-800 font-bold mt-0.5">
                {freeEditors.map(e => e.name).join(', ')} {freeEditors.length === 1 ? 'está sem retranca no momento' : 'estão sem retranca no momento'} e {freeEditors.length === 1 ? 'pode' : 'podem'} assumir material imediatamente.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {freeEditors.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => onAssignClick ? onAssignClick(e.id) : undefined}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                title={`Atribuir pauta/retranca para ${e.name}`}
              >
                <Plus size={13} strokeWidth={3} /> Atribuir a {e.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3.5 bg-red-50 border-2 border-red-300 rounded-xl text-xs font-black text-red-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-red-600 animate-pulse" />
            <span>Capacidade Máxima: Todas as 5 ilhas de edição estão ocupadas com material em produção!</span>
          </div>
          <span className="text-[10px] bg-red-200 text-red-900 px-2.5 py-0.5 rounded-full font-black uppercase">
            100% Ocupadas
          </span>
        </div>
      )}

      {/* Editors Grid Cards (Zand, Jamir, Jean, Vagner, Valdeilton) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
        {editorStats.map(editor => {
          const isFree = editor.isFree;
          const currentRetranca = editor.activeRetrancas[0];
          const hasUrgent = editor.hasUrgent;
          const isEditingNow = editor.isEditing;
          const count = editor.activeRetrancas.length;

          // Highly visible color changing based on workload state
          const cardStyle = hasUrgent
            ? 'border-2 border-red-500 bg-gradient-to-b from-red-50/90 via-white to-red-50/40 ring-2 ring-red-400/40 shadow-md'
            : !isFree && count >= 2
              ? 'border-2 border-amber-500 bg-gradient-to-b from-amber-50/90 via-white to-amber-50/40 ring-2 ring-amber-400/30 shadow-md'
              : !isFree
                ? 'border-2 border-blue-600 bg-gradient-to-b from-blue-50/90 via-white to-blue-50/40 ring-2 ring-blue-400/30 shadow-md'
                : 'border-2 border-emerald-400 bg-gradient-to-b from-emerald-50/70 via-white to-emerald-50/30 ring-2 ring-emerald-400/20 shadow-xs';

          const badgeStyle = hasUrgent
            ? 'bg-red-600 text-white shadow-xs animate-pulse'
            : !isFree && count >= 2
              ? 'bg-amber-600 text-white shadow-xs'
              : !isFree && isEditingNow
                ? 'bg-blue-600 text-white shadow-xs'
                : !isFree
                  ? 'bg-blue-500 text-white shadow-xs'
                  : 'bg-emerald-600 text-white shadow-xs animate-pulse';

          const badgeText = hasUrgent
            ? '🚨 URGENTE'
            : !isFree && count >= 2
              ? `⚡ ${count} PAUTAS`
              : !isFree && isEditingNow
                ? '▶️ EDITANDO'
                : !isFree
                  ? '⏱️ NA ILHA'
                  : '🟢 LIVRE';

          return (
            <div
              key={editor.id}
              className={`rounded-2xl p-4 flex flex-col justify-between transition-all relative overflow-hidden ${cardStyle}`}
            >
              {/* Top Row: Name and Status Badge */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[14px] font-black text-slate-900 uppercase tracking-tight">
                    {editor.name}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase flex items-center gap-1 ${badgeStyle}`}>
                    {badgeText}
                  </span>
                </div>

                {/* Percentage Meter & Workload */}
                <div className="space-y-1.5 mb-3">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tight">
                    <span className={
                      hasUrgent 
                        ? 'text-red-950 font-black' 
                        : !isFree 
                          ? 'text-blue-950 font-black' 
                          : 'text-emerald-800'
                    }>
                      {isFree 
                        ? 'Ocupação: 0%' 
                        : hasUrgent
                          ? 'Ocupação: 100%'
                          : count >= 2
                            ? `Ocupação: 100% (${count} pautas)`
                            : 'Ocupação: 100%'}
                    </span>
                    <span className={
                      hasUrgent 
                        ? 'text-red-700 font-black' 
                        : !isFree 
                          ? 'text-blue-700 font-extrabold' 
                          : 'text-emerald-600 font-extrabold'
                    }>
                      {isFree ? 'Disponível' : isEditingNow ? 'Em Edição' : 'Fila Atribuída'}
                    </span>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFree 
                          ? 'w-0' 
                          : hasUrgent
                            ? 'w-full bg-gradient-to-r from-red-600 to-amber-500 animate-pulse'
                            : count >= 2
                              ? 'w-full bg-gradient-to-r from-amber-500 to-orange-500'
                              : 'w-full bg-blue-600'
                      }`}
                    />
                  </div>
                </div>

                {/* Content Details: What they are editing or Free Alert */}
                {isFree ? (
                  <div className="bg-emerald-100/80 border border-emerald-300 rounded-xl p-2.5 text-center text-emerald-950 text-[11px] font-bold space-y-2">
                    <div>
                      <div className="font-black text-emerald-900 text-[11px] uppercase flex items-center justify-center gap-1">
                        <Sparkles size={13} className="text-emerald-600" /> 100% Livre
                      </div>
                      <div className="text-[10px] text-emerald-800 mt-0.5">
                        Pronto para nova retranca
                      </div>
                    </div>
                    {onAssignClick && (
                      <button
                        type="button"
                        onClick={() => onAssignClick(editor.id)}
                        className="w-full py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black uppercase shadow-xs flex items-center justify-center gap-1 transition-all cursor-pointer active:scale-95"
                      >
                        <Plus size={12} strokeWidth={3} /> Atribuir Pauta
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={`rounded-xl p-2.5 space-y-1.5 transition-all shadow-xs ${
                    currentRetranca?.isUrgent 
                      ? 'bg-red-100/90 border-2 border-red-500 text-red-950' 
                      : 'bg-white border-2 border-blue-400 text-slate-900'
                  }`}>
                    <div className="flex items-start justify-between gap-1.5">
                      <div 
                        className={`text-[11px] font-black uppercase line-clamp-2 leading-tight ${
                          currentRetranca?.isUrgent ? 'text-red-950 font-black' : 'text-blue-950'
                        }`} 
                        title={currentRetranca?.title}
                      >
                        {currentRetranca?.title || 'Retranca em produção'}
                      </div>
                      {currentRetranca?.isUrgent && (
                        <span className="shrink-0 text-[8px] font-black uppercase bg-red-600 text-white px-1.5 py-0.5 rounded-full flex items-center gap-0.5 animate-pulse shadow-xs">
                          <Flame size={9} fill="white" /> URGENTE
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-[10px] font-bold pt-1 border-t border-slate-200/60">
                      <span className="flex items-center gap-1 text-slate-700">
                        <Video size={11} className="text-blue-600" /> {currentRetranca?.format || 'VT'}
                      </span>
                      {currentRetranca?.deadline ? (
                        <span className="flex items-center gap-1 text-red-700 font-black">
                          <Clock size={11} /> {currentRetranca.deadline}
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-500">Sem horário</span>
                      )}
                    </div>

                    {count > 1 && (
                      <div className="text-[9px] font-black text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 text-center">
                        + {count - 1} outra(s) matéria(s) na fila
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bottom Footer Info */}
              <div className="pt-2.5 mt-2.5 border-t border-gray-100 flex items-center justify-between text-[10px] font-bold text-gray-500">
                <span>Concluídas hoje: {editor.concludedRetrancas.length}</span>
                {onAssignClick && isFree && (
                  <button
                    onClick={() => onAssignClick(editor.id)}
                    className="text-emerald-700 hover:text-emerald-900 font-black hover:underline cursor-pointer"
                  >
                    Atribuir +
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
