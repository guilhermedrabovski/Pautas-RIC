import React, { useEffect, useState } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PREDEFINED_USERS, IMAGE_EDITORS_LIST } from '../lib/constants';
import { 
  Film, 
  Play, 
  CheckCircle2, 
  Sparkles, 
  AlertTriangle, 
  Clock, 
  Video, 
  ArrowRight,
  Flame,
  Check,
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
  workloadScore: number;
  sharePercent: number;
}

interface EditorWorkloadWidgetProps {
  initialRetrancas?: any[];
  initialEditors?: any[];
  onAssignClick?: (editorId: string) => void;
  showLinkToDashboard?: boolean;
}

// Official image editors of the newsroom: Zand, Jamir, Jean, Miúdo, Valdeilton
const OFFICIAL_IMAGE_EDITORS = [
  { uid: 'zand', username: 'zand', name: 'Zand', role: 'editor' },
  { uid: 'jamir', username: 'jamir', name: 'Jamir', role: 'editor' },
  { uid: 'jean', username: 'jean', name: 'Jean', role: 'editor' },
  { uid: 'miudo', username: 'miudo', name: 'Miúdo', role: 'editor' },
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

  // Listen to retrancas if not supplied
  useEffect(() => {
    if (initialRetrancas && initialRetrancas.length > 0) {
      setRetrancas(initialRetrancas);
      return;
    }
    const q = query(collection(db, 'retrancas'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setRetrancas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn('Could not listen to retrancas:', err));
    return unsub;
  }, [initialRetrancas]);

  // Listen to editors / users, strictly filtering for Zand, Jamir, Jean, Miúdo
  useEffect(() => {
    const predefinedEditors = IMAGE_EDITORS_LIST;

    if (initialEditors && initialEditors.length > 0) {
      setEditorsList(initialEditors);
      return;
    }

    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, snap => {
      const dbUsers = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      setEditorsList(dbUsers);
    }, () => {
      setEditorsList(predefinedEditors);
    });

    return unsub;
  }, [initialEditors]);

  // Strictly and exclusively Zand, Jamir, Jean, Miúdo (unicos editores de imagem)
  const effectiveEditors = OFFICIAL_IMAGE_EDITORS.map(official => {
    const found = editorsList.find((e: any) => {
      const uid = normalizeStr(e.uid || e.username || e.id);
      const name = normalizeStr(e.name);
      return uid === official.uid || name === official.uid || name.includes(official.uid);
    });
    return {
      uid: official.uid,
      username: official.username,
      name: official.name,
      role: 'editor',
      ...(found ? { photoURL: found.photoURL } : {})
    };
  });

  // Helper to match an editor with a retranca
  const isMatch = (ed: any, retrancaEditorId: string) => {
    if (!retrancaEditorId) return false;
    const target = normalizeStr(retrancaEditorId);
    const uid = normalizeStr(ed.uid);
    const uname = normalizeStr(ed.username);
    const name = normalizeStr(ed.name);
    return target === uid || target === uname || target === name || target.includes(uid) || uid.includes(target);
  };

  // Calculate statistics per editor
  const totalActiveEditing = retrancas.filter(r => r.status === 'editando' && !!r.editorId).length;

  const editorStats: EditorWorkloadItem[] = effectiveEditors.map(ed => {
    const active = retrancas.filter(r => r.status === 'editando' && isMatch(ed, r.editorId));
    const concluded = retrancas.filter(r => r.status === 'concluido' && isMatch(ed, r.editorId));
    const pending = retrancas.filter(r => r.status === 'pendente' && isMatch(ed, r.editorId));
    const isFree = active.length === 0;

    // Percentage of active editing relative to total active load
    const sharePercent = totalActiveEditing > 0 
      ? Math.round((active.length / totalActiveEditing) * 100) 
      : 0;

    // Workload score (0% if none, 50% if 1, 100% if 2+)
    const workloadScore = active.length === 0 ? 0 : active.length === 1 ? 50 : 100;

    return {
      id: ed.uid || ed.username,
      name: ed.name,
      username: ed.username || ed.uid,
      activeRetrancas: active,
      concludedRetrancas: concluded,
      pendingRetrancas: pending,
      isFree,
      workloadScore,
      sharePercent
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
            </div>
            <p className="text-xs text-ric-muted font-bold">
              Disponibilidade e ocupação dos editores em tempo real
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
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-900 flex items-center gap-2">
          <Flame size={16} className="text-orange-500" />
          <span>Todos os editores estão ocupados no momento com material em edição.</span>
        </div>
      )}

      {/* Editors Grid Cards (Zand, Jamir, Jean, Miúdo, Valdeilton) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
        {editorStats.map(editor => {
          const isFree = editor.isFree;
          const currentRetranca = editor.activeRetrancas[0];

          return (
            <div
              key={editor.id}
              className={`rounded-xl p-3.5 flex flex-col justify-between transition-all relative overflow-hidden ${
                isFree 
                  ? 'border-2 border-emerald-400 bg-emerald-50/40 shadow-xs hover:border-emerald-500 ring-2 ring-emerald-400/20' 
                  : 'border border-blue-200 bg-white shadow-xs hover:border-blue-400 hover:shadow-md'
              }`}
            >
              {/* Top Row: Name and Status Badge */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-black text-slate-900 uppercase tracking-tight">
                    {editor.name}
                  </span>
                  {isFree ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-600 text-white shadow-xs flex items-center gap-1 animate-pulse">
                      <Sparkles size={11} /> LIVRE
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-600 text-white shadow-xs flex items-center gap-1">
                      <Play size={10} fill="white" /> EDITANDO
                    </span>
                  )}
                </div>

                {/* Percentage Meter & Workload */}
                <div className="space-y-1 mb-2.5">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase">
                    <span className={isFree ? 'text-emerald-700' : 'text-blue-900'}>
                      {isFree ? 'Ocupação: 0%' : `Editando: ${editor.activeRetrancas.length} pauta(s)`}
                    </span>
                    <span className={isFree ? 'text-emerald-600 font-extrabold' : 'text-blue-700 font-extrabold'}>
                      {isFree ? 'Disponível' : `${editor.sharePercent}% do fluxo`}
                    </span>
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        isFree 
                          ? 'w-0 bg-gray-200' 
                          : editor.activeRetrancas.length >= 2 
                            ? 'bg-amber-500' 
                            : 'bg-blue-600'
                      }`}
                      style={{ width: isFree ? '0%' : `${Math.max(25, editor.sharePercent || 100)}%` }}
                    />
                  </div>
                </div>

                {/* Content Details: What they are editing or Free Alert */}
                {isFree ? (
                  <div className="bg-emerald-100/70 border border-emerald-200 rounded-lg p-2.5 text-center text-emerald-900 text-[11px] font-bold space-y-2">
                    <div>
                      <div className="font-black text-emerald-800 text-[11px] uppercase flex items-center justify-center gap-1">
                        <Sparkles size={12} /> 100% Livre
                      </div>
                      <div className="text-[10px] text-emerald-700 mt-0.5">
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
                  <div className="bg-blue-50/70 border border-blue-200/80 rounded-lg p-2 space-y-1">
                    <div className="text-[11px] font-black text-blue-950 uppercase line-clamp-1" title={currentRetranca?.title}>
                      {currentRetranca?.title || 'Retranca em produção'}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-blue-700 font-bold">
                      <span className="flex items-center gap-1">
                        <Video size={10} /> {currentRetranca?.format || 'VT'}
                      </span>
                      {currentRetranca?.deadline && (
                        <span className="flex items-center gap-1 text-ric-red font-black">
                          <Clock size={10} /> {currentRetranca.deadline}
                        </span>
                      )}
                    </div>
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
