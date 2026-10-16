import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { 
  CheckSquare, 
  Share2, 
  Settings as SettingsIcon, 
  CheckCircle2, 
  RotateCcw,
  Save,
  GraduationCap,
  Calendar,
  UserCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  InternRoutineItem, 
  DEFAULT_INTERN_ROUTINE_ITEMS 
} from '../types/internRoutine';
import { confirmAction } from '../lib/confirmHelper';

export default function Checklist() {
  const { userData, users } = useAuth();
  const navigate = useNavigate();

  const isManager = userData?.role === 'admin' || userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira';
  const internUsers = users.filter(u => u.role === 'estagiario');

  // Today's date string
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayFormatted = format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  // Selected intern (defaults to current user if intern, or first intern, or current user)
  const [selectedInternUid, setSelectedInternUid] = useState<string>('');

  // Routine template items
  const [routineItems, setRoutineItems] = useState<InternRoutineItem[]>(DEFAULT_INTERN_ROUTINE_ITEMS);
  const [isLoading, setIsLoading] = useState(true);

  // Completed items & answers for today
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [completedAtTime, setCompletedAtTime] = useState<string | null>(null);

  // Pedro is the estagiário (Guilherme Drabovski is Admin)
  const pedroUser = users.find(u => u.name?.toLowerCase().includes('pedro') || u.email?.toLowerCase().includes('pedro'));
  const allInterns = internUsers.length > 0 
    ? internUsers 
    : (pedroUser ? [pedroUser] : []);

  // Initialize selected intern
  useEffect(() => {
    if (userData) {
      if (userData.role === 'estagiario') {
        setSelectedInternUid(userData.uid);
      } else {
        // For admins (like Guilherme Drabovski) or editors: Pedro is the estagiário
        const pedro = users.find(u => u.name?.toLowerCase().includes('pedro') || u.email?.toLowerCase().includes('pedro'));
        if (pedro && (!selectedInternUid || selectedInternUid === userData.uid)) {
          setSelectedInternUid(pedro.uid);
        } else if (allInterns.length > 0 && !selectedInternUid) {
          setSelectedInternUid(allInterns[0].uid);
        }
      }
    }
  }, [userData, internUsers, selectedInternUid, users, allInterns]);

  // Load Routine Template from Settings
  useEffect(() => {
    setIsLoading(true);
    getDoc(doc(db, 'settings', 'internRoutineTemplate'))
      .then(snap => {
        if (snap.exists() && snap.data().items && snap.data().items.length > 0) {
          setRoutineItems(snap.data().items);
        } else {
          setRoutineItems(DEFAULT_INTERN_ROUTINE_ITEMS);
        }
      })
      .catch(err => {
        console.warn('Erro ao carregar template da rotina:', err);
        setRoutineItems(DEFAULT_INTERN_ROUTINE_ITEMS);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Listen to the routine execution for today and selected intern
  const activeUid = selectedInternUid || userData?.uid || 'default';
  const runId = `run_${todayStr}_${activeUid}`;

  useEffect(() => {
    if (!activeUid) return;

    const unsub = onSnapshot(doc(db, 'internRoutineRuns', runId), snap => {
      if (snap.exists()) {
        const data = snap.data();
        setCompletedIds(data.completedItemIds || []);
        setAnswers(data.responses || {});
        if (data.completedAt) {
          setCompletedAtTime(format(new Date(data.completedAt), 'HH:mm'));
        } else {
          setCompletedAtTime(null);
        }
      } else {
        setCompletedIds([]);
        setAnswers({});
        setCompletedAtTime(null);
      }
    }, err => {
      console.warn('Erro ao ouvir rotina:', err);
    });

    return () => unsub();
  }, [runId, activeUid]);

  // Target intern name display (Pedro is the estagiário, Guilherme is Admin)
  const targetUser = users.find(u => u.uid === activeUid) 
    || (userData?.role === 'estagiario' ? userData : null)
    || pedroUser;
  const targetName = targetUser?.name || 'Pedro';

  // Debounce save handler
  const saveTimeoutRef = useRef<any>(null);

  const persistData = async (newCompleted: string[], newAnswers: Record<string, string | number>, markComplete = false) => {
    setIsSaved(false);
    try {
      const allDone = routineItems.length > 0 && newCompleted.length >= routineItems.length;
      const finalDone = markComplete || allDone;
      const now = Date.now();

      await setDoc(doc(db, 'internRoutineRuns', runId), {
        id: runId,
        date: todayStr,
        internUid: activeUid,
        internName: targetName,
        completedItemIds: newCompleted,
        responses: newAnswers,
        isCompleted: finalDone,
        completedAt: finalDone ? now : null,
        updatedAt: now
      }, { merge: true });

      setIsSaved(true);
    } catch (err: any) {
      console.error('Erro ao salvar:', err);
      toast.error('Erro ao salvar: ' + err.message);
    }
  };

  const handleToggle = (itemId: string) => {
    const isChecked = completedIds.includes(itemId);
    const updated = isChecked
      ? completedIds.filter(id => id !== itemId)
      : [...completedIds, itemId];

    setCompletedIds(updated);
    persistData(updated, answers);
  };

  const handleAnswerChange = (itemId: string, val: string | number) => {
    const updatedAnswers = {
      ...answers,
      [itemId]: val
    };
    setAnswers(updatedAnswers);

    // Auto check if answered and not yet checked
    let updatedCompleted = [...completedIds];
    if (String(val).trim() !== '' && !completedIds.includes(itemId)) {
      updatedCompleted.push(itemId);
      setCompletedIds(updatedCompleted);
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      persistData(updatedCompleted, updatedAnswers);
    }, 500);
  };

  const handleSaveAndComplete = () => {
    persistData(completedIds, answers, true);
    toast.success('🎉 Rotina salva com sucesso!');
  };

  const handleReset = () => {
    confirmAction('Deseja limpar as respostas de hoje e recomeçar?', async () => {
      setCompletedIds([]);
      setAnswers({});
      setCompletedAtTime(null);
      await setDoc(doc(db, 'internRoutineRuns', runId), {
        id: runId,
        date: todayStr,
        internUid: activeUid,
        internName: targetName,
        completedItemIds: [],
        responses: {},
        isCompleted: false,
        completedAt: null,
        updatedAt: Date.now()
      });
      toast.success('Rotina reiniciada.');
    });
  };

  const handleCopyWhatsApp = () => {
    const total = routineItems.length;
    const done = completedIds.length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    let text = `📋 *ROTINA DO ESTAGIÁRIO - RIC RECORD*\n`;
    text += `📅 *Data:* ${format(new Date(), 'dd/MM/yyyy')}\n`;
    text += `👤 *Estagiário:* ${targetName}\n`;
    text += `📊 *Progresso:* ${done}/${total} (${percent}%)\n\n`;

    routineItems.forEach((item, index) => {
      const isDone = completedIds.includes(item.id);
      const icon = isDone ? '✅' : '⬜';
      text += `${icon} *${item.title}*\n`;

      if (item.responseType === 'text') {
        const val = answers[item.id];
        text += `   _O que achou:_ ${val ? String(val).trim() : '(Nenhum achado relevante)'}\n`;
      } else if (item.responseType === 'number') {
        const val = answers[item.id];
        text += `   _Potenciais pautas:_ ${val !== undefined && val !== '' ? String(val) : '0'}\n`;
      } else {
        text += `   _Status:_ ${isDone ? 'Concluído' : 'Pendente'}\n`;
      }
      text += `\n`;
    });

    if (completedAtTime) {
      text += `⏱️ *Concluído às:* ${completedAtTime} hrs\n`;
    }

    navigator.clipboard.writeText(text);
    toast.success('Copiado! Pronto para colar no WhatsApp.');
  };

  const totalCount = routineItems.length;
  const completedCount = completedIds.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-ric-border p-6 border-t-4 border-t-emerald-600">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-md">
                <GraduationCap size={20} />
              </span>
              <h1 className="text-xl font-black text-ric-blue uppercase tracking-tight">
                Rotina do Estagiário: <span className="text-emerald-700">{targetName}</span>
              </h1>
            </div>
            <p className="text-xs text-ric-muted capitalize flex items-center gap-1.5">
              <Calendar size={13} className="text-gray-400" />
              {todayFormatted} {isManager && `• Supervisor: ${userData?.name}`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Seletor de estagiário (para gestores/editores) */}
            {isManager && (
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 px-2.5 py-1.5 rounded-lg text-xs">
                <UserCheck size={14} className="text-emerald-600" />
                <span className="font-bold text-gray-500">Estagiário:</span>
                <select
                  value={activeUid}
                  onChange={e => setSelectedInternUid(e.target.value)}
                  className="bg-transparent font-bold text-ric-blue outline-none cursor-pointer"
                >
                  {allInterns.map(u => (
                    <option key={u.uid} value={u.uid}>
                      {u.name} (Estagiário)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Link direto para configurações de itens (quem tem acesso) */}
            {isManager && (
              <button
                type="button"
                onClick={() => navigate('/settings#rotina-estagiario')}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-ric-text px-3 py-1.5 rounded-lg font-bold uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Configurar, adicionar e subtrair itens nas Configurações"
              >
                <SettingsIcon size={14} className="text-ric-blue" />
                Configurar Itens
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5 pt-4 border-t border-gray-100">
          <div className="flex justify-between items-center text-xs mb-1.5 font-bold">
            <span className="text-ric-text">
              {completedCount} de {totalCount} concluídos ({progressPercent}%)
            </span>
            {completedCount === totalCount && totalCount > 0 ? (
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={13} /> Tudo pronto!
              </span>
            ) : (
              <span className="text-ric-muted">
                {isSaved ? 'Salvo' : 'Salvando...'}
              </span>
            )}
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progressPercent === 100 ? 'bg-emerald-500' : 'bg-ric-blue'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Routine Checklist List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="bg-white p-8 rounded-xl border border-gray-200 text-center text-xs text-ric-muted font-bold">
            Carregando rotina...
          </div>
        ) : routineItems.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-dashed border-gray-300 text-center">
            <p className="font-bold text-sm text-ric-text mb-1">Nenhum item configurado na rotina.</p>
            {isManager && (
              <button
                onClick={() => navigate('/settings#rotina-estagiario')}
                className="text-xs text-ric-blue font-bold uppercase hover:underline"
              >
                Adicionar itens nas configurações
              </button>
            )}
          </div>
        ) : (
          routineItems.map((item, idx) => {
            const isChecked = completedIds.includes(item.id);
            const currentVal = answers[item.id] !== undefined ? answers[item.id] : '';

            return (
              <div
                key={item.id}
                className={`bg-white rounded-xl p-5 border transition-all duration-150 shadow-sm ${
                  isChecked
                    ? 'border-emerald-300 bg-emerald-50/15'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Item Line */}
                <div className="flex items-start gap-3.5">
                  <input
                    type="checkbox"
                    id={`item-${item.id}`}
                    checked={isChecked}
                    onChange={() => handleToggle(item.id)}
                    className="w-5 h-5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 mt-0.5 cursor-pointer shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`item-${item.id}`}
                      className="cursor-pointer block"
                    >
                      <span className={`text-[15px] font-bold block ${
                        isChecked ? 'text-emerald-900 line-through opacity-85' : 'text-ric-text'
                      }`}>
                        {item.title}
                      </span>
                    </label>

                    {item.description && (
                      <p className="text-xs text-ric-muted mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    )}

                    {/* Espaço para colocar o que achou (Texto Livre) */}
                    {item.responseType === 'text' && (
                      <div className="mt-3">
                        <textarea
                          value={currentVal as string}
                          onChange={e => handleAnswerChange(item.id, e.target.value)}
                          placeholder={item.responsePlaceholder || 'Um espaço pra colocar o que achou...'}
                          rows={3}
                          className="w-full bg-[#F8F9FA] border border-gray-200 rounded-lg p-3 text-xs text-ric-text outline-none focus:ring-1 focus:ring-emerald-500 focus:bg-white transition-all shadow-inner leading-relaxed"
                        />
                      </div>
                    )}

                    {/* Espaço para dizer quantas potenciais pautas (Numérico) */}
                    {item.responseType === 'number' && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-bold text-gray-600">
                          {item.responsePlaceholder || 'Quantas potenciais pautas:'}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const val = Math.max(0, (Number(currentVal) || 0) - 1);
                              handleAnswerChange(item.id, val);
                            }}
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-ric-text font-black text-sm flex items-center justify-center cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            value={currentVal}
                            onChange={e => handleAnswerChange(item.id, Math.max(0, parseInt(e.target.value) || 0))}
                            placeholder="0"
                            className="w-16 text-center font-black text-sm bg-[#F8F9FA] border border-gray-200 rounded-lg py-1.5 text-ric-blue outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = (Number(currentVal) || 0) + 1;
                              handleAnswerChange(item.id, val);
                            }}
                            className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-ric-text font-black text-sm flex items-center justify-center cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Clean Bottom Action Buttons */}
      <div className="bg-white rounded-xl shadow-sm border border-ric-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            title="Copiar resumo formatado para o WhatsApp"
          >
            <Share2 size={15} /> Copiar para WhatsApp
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="text-gray-400 hover:text-red-600 px-3 py-2 text-xs flex items-center gap-1 transition-colors cursor-pointer"
            title="Limpar marcações de hoje"
          >
            <RotateCcw size={13} /> Limpar
          </button>
        </div>

        <button
          type="button"
          onClick={handleSaveAndComplete}
          className="bg-ric-blue hover:bg-[#002244] text-white px-5 py-2.5 rounded-lg text-xs font-black uppercase shadow-sm transition-all flex items-center gap-2 cursor-pointer"
        >
          <Save size={15} /> Concluir Rotina de Hoje
        </button>
      </div>
    </div>
  );
}
