import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, getDocs, limit, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Download, Plus, MessageSquare, Trash2, CheckCircle, ChevronDown, ChevronUp, Edit, CalendarPlus, Users, CornerDownRight } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { confirmAction } from '../lib/confirmHelper';

interface TaskReply {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: number;
}

interface HandoverTask {
  id: string;
  reporterId?: string;
  pauteiroId?: string;
  subject: string;
  description: string;
  markedUser: string;
  status: 'pendente' | 'finalizado' | 'urgente' | 'amanha';
  statusUpdatedBy?: string;
  statusUpdatedAt?: number;
  replies: TaskReply[];
  shift?: 'Manhã' | 'Tarde' | 'Noite' | '';
}

export default function Handovers() {
  const { userData, users } = useAuth();
  
  const canSeeReports = ['admin', 'editor', 'pauteiro', 'pauteira'].includes(userData?.role || '');

  if (userData && !canSeeReports) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-white rounded-3xl border-2 border-ric-border shadow-soft">
        <div className="bg-red-50 text-ric-red p-6 rounded-full mb-6">
          <CalendarPlus size={48} className="opacity-50" />
        </div>
        <h2 className="text-2xl font-black text-ric-text uppercase mb-2">Acesso Restrito</h2>
        <p className="text-ric-muted font-medium max-w-md">
          Desculpe, mas repórteres não possuem permissão para visualizar ou gerenciar os relatórios de plantão.
        </p>
      </div>
    );
  }

  const [handovers, setHandovers] = useState<any[]>([]);
  const [expandedReports, setExpandedReports] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState(9); // 3 days * 3 shifts
  
  const [editingHandover, setEditingHandover] = useState<any | null>(null);
  const displayNames = getDisplayNames(users);
  
  const [isNewFormOpen, setIsNewFormOpen] = useState(false);
  
  const getCurrentShift = (): 'Manhã' | 'Tarde' | 'Noite' => {
    const hour = new Date().getHours();
    if (hour < 14) return 'Manhã';
    if (hour < 20) return 'Tarde';
    return 'Noite';
  };

  const [newHandover, setNewHandover] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    shift: getCurrentShift(),
    suggestions: '',
    openReportersForTomorrow: [] as string[],
    scheduledReportersForTomorrow: [] as { id: string, reporterId: string, task: string }[],
    tasks: [] as HandoverTask[]
  });

  const [replyInputs, setReplyInputs] = useState<{[taskId: string]: string}>({});
  const [formReplies, setFormReplies] = useState<{[taskId: string]: string}>({});

  const myMentions = handovers.flatMap(h => 
    (h.tasks || [])
      .filter((t: HandoverTask) => {
        const isMarked = t.markedUser === userData?.uid;
        const isPending = t.status !== 'finalizado';
        if (!isMarked || !isPending) return false;
        
        // If there are no replies, it's definitely pending for the user
        if (!t.replies || t.replies.length === 0) return true;
        
        // If the last reply is not from the current user, it's still pending for them
        const lastReply = t.replies[t.replies.length - 1];
        return lastReply.authorId !== userData?.uid;
      })
      .map((t: HandoverTask) => ({ ...t, handoverId: h.id, handoverDate: h.date, handoverShift: h.shift }))
  );

  useEffect(() => {
    const q = query(
      collection(db, 'handovers'), 
      orderBy('createdAt', 'desc'),
      limit(visibleCount)
    );
    const unsub = onSnapshot(q, snap => {
      setHandovers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [visibleCount]);

  useEffect(() => {
    if (myMentions.length > 0 && isNewFormOpen) {
      toast('Você tem pendências onde foi marcado. Elas foram incluídas no formulário e exigem resposta.', {
        icon: '⚠️',
        duration: 5000,
      });
    }
  }, [myMentions.length, isNewFormOpen]);

  useEffect(() => {
    if (myMentions.length > 0 && !isNewFormOpen) {
      toast(`Você possui ${myMentions.length} item(ns) pendente(s) que precisam da sua atenção.`, {
        icon: '🔔',
        duration: 4000,
      });
    }
  }, [myMentions.length, isNewFormOpen]);

  const getUserName = (id?: string) => {
    if (!id) return '';
    const u = users.find(u => u.uid === id);
    if (!u) return id;
    return displayNames[u.uid] || u.name || u.email?.split('@')[0] || id;
  };

  const toggleReport = (id: string) => {
    setExpandedReports(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddStatusTask = (status: 'pendente' | 'finalizado' | 'amanha') => {
    setNewHandover(prev => ({
      ...prev,
      tasks: [...prev.tasks, { id: Date.now().toString() + Math.random(), subject: '', reporterId: '', pauteiroId: userData?.uid || '', description: '', markedUser: '', status, replies: [], shift: getCurrentShift() }]
    }));
  };

  const handleRemoveTask = (taskId: string) => {
    setNewHandover(prev => ({
      ...prev,
      tasks: prev.tasks.filter(t => t.id !== taskId)
    }));
  };

  const updateNewTask = (taskId: string, field: keyof HandoverTask, value: string) => {
    setNewHandover(prev => ({
      ...prev,
      tasks: prev.tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t)
    }));
  };

  const handleAddNewScheduledReporter = () => {
    setNewHandover(prev => ({
      ...prev,
      scheduledReportersForTomorrow: [...(prev.scheduledReportersForTomorrow || []), { id: Date.now().toString() + Math.random(), reporterId: '', task: '' }]
    }));
  };

  const handleRemoveNewScheduledReporter = (id: string) => {
    setNewHandover(prev => ({
      ...prev,
      scheduledReportersForTomorrow: (prev.scheduledReportersForTomorrow || []).filter(r => r.id !== id)
    }));
  };

  const updateNewScheduledReporter = (id: string, field: string, value: string) => {
    setNewHandover(prev => ({
      ...prev,
      scheduledReportersForTomorrow: (prev.scheduledReportersForTomorrow || []).map(r => r.id === id ? { ...r, [field]: value } : r)
    }));
  };

  const handleStartEdit = (h: any) => {
    // Prevent editing if not the creator
    if (userData?.uid !== h.createdBy) return;
    setEditingHandover(JSON.parse(JSON.stringify(h)));
  };

  const handleCancelEdit = () => {
    setEditingHandover(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHandover) return;
    if (editingHandover.tasks.length === 0 || editingHandover.tasks.some((t: any) => !t.subject || !t.description)) {
      return toast.error('Preencha todos os assuntos e descrições');
    }
    try {
      await updateDoc(doc(db, 'handovers', editingHandover.id), {
        date: editingHandover.date,
        shift: editingHandover.shift,
        suggestions: editingHandover.suggestions,
        openReportersForTomorrow: editingHandover.openReportersForTomorrow || [],
        scheduledReportersForTomorrow: editingHandover.scheduledReportersForTomorrow || [],
        tasks: editingHandover.tasks
      });
      setEditingHandover(null);
      toast.success('Relatório atualizado com sucesso');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteHandover = async (id: string) => {
    if (userData?.role !== 'admin') {
      return toast.error('Apenas administradores podem apagar relatórios.');
    }

    confirmAction('Deseja realmente apagar este relatório de plantão? Esta ação é irreversível.', async () => {
      try {
        await deleteDoc(doc(db, 'handovers', id));
        toast.success('Relatório apagado com sucesso');
      } catch (error: any) {
        toast.error('Erro ao apagar relatório: ' + error.message);
      }
    });
  };

  const updateEditTask = (taskId: string, field: keyof HandoverTask, value: string) => {
    setEditingHandover((prev: any) => ({
      ...prev,
      tasks: prev.tasks.map((t: any) => t.id === taskId ? { ...t, [field]: value } : t)
    }));
  };

  const handleAddScheduledReporterToEdit = () => {
    setEditingHandover((prev: any) => ({
      ...prev,
      scheduledReportersForTomorrow: [...(prev.scheduledReportersForTomorrow || []), { id: Date.now().toString() + Math.random(), reporterId: '', task: '' }]
    }));
  };

  const handleRemoveScheduledReporterFromEdit = (id: string) => {
    setEditingHandover((prev: any) => ({
      ...prev,
      scheduledReportersForTomorrow: (prev.scheduledReportersForTomorrow || []).filter((r: any) => r.id !== id)
    }));
  };

  const updateScheduledReporterInEdit = (id: string, field: string, value: string) => {
    setEditingHandover((prev: any) => ({
      ...prev,
      scheduledReportersForTomorrow: prev.scheduledReportersForTomorrow.map((r: any) => r.id === id ? { ...r, [field]: value } : r)
    }));
  };

  const handleAddEditTask = () => {
    setEditingHandover((prev: any) => ({
      ...prev,
      tasks: [...prev.tasks, { id: Date.now().toString() + Math.random(), subject: '', reporterId: '', pauteiroId: userData?.uid || '', description: '', markedUser: '', status: 'pendente', replies: [], shift: getCurrentShift() }]
    }));
  };

  const handleRemoveEditTask = (taskId: string) => {
    setEditingHandover((prev: any) => ({
      ...prev,
      tasks: prev.tasks.filter((t: any) => t.id !== taskId)
    }));
  };

  const handleOpenNewForm = () => {
    setFormReplies({}); // Clear form replies when opening new form
    let pendingTasks: HandoverTask[] = [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    // 1. Inherit tasks from the MOST RECENT report
    if (handovers.length > 0) {
       const lastReport = handovers[0];
       const isSameDay = lastReport.date === todayStr;
       
       if (lastReport.tasks) {
          pendingTasks = lastReport.tasks
            .filter((t: HandoverTask) => {
              if (t.status === 'finalizado' && !isSameDay) return false;
              // Ignore empty/aberto tasks
              const subjLower = t.subject.toLowerCase();
              if (subjLower.includes('aberto / sem pauta') || t.subject.trim() === '' || subjLower === 'aberto' || subjLower.includes('[pendência] aberto / sem pauta')) {
                return false;
              }
              return true;
            })
            .map((t: HandoverTask) => {
               // Amanhã from yesterday becomes 'pendente'. Amanhã from today stays 'amanhã'.
               const newStatus = (t.status === 'amanha' && !isSameDay) ? 'pendente' : t.status;
               
               let finalSubject = t.subject;
               if ((newStatus === 'pendente' || newStatus === 'urgente') && !finalSubject.startsWith('[PENDÊNCIA]')) {
                 finalSubject = `[PENDÊNCIA] ${finalSubject}`;
               }

               return {
                 ...t,
                 id: Date.now().toString() + Math.random(),
                 status: newStatus,
                 subject: finalSubject,
                 replies: t.replies || [] 
               }
            });
       }
    }

    // 2. ALSO bring in any mentions that might have been "lost" from the heritage but are still open
    myMentions.forEach(mention => {
      const isAlreadyInList = pendingTasks.some(t => 
        t.subject.includes(mention.subject) || mention.subject.includes(t.subject.replace('[PENDÊNCIA] ', ''))
      );
      if (!isAlreadyInList) {
        pendingTasks.push({
          id: Date.now().toString() + Math.random(),
          reporterId: mention.reporterId || '',
          subject: `[PENDÊNCIA EXTRA] ${mention.subject}`,
          description: mention.description,
          status: mention.status === 'amanha' ? 'pendente' : mention.status,
          markedUser: userData?.uid || '',
          replies: mention.replies || []
        });
      }
    });

    // 3. Ensure we have exactly one 'finalizado' slot for each reporter, and optionally one 'amanhã' slot for Manhã
    const defaultReporterNames = ['Bruna', 'Ricardo', 'Tiago', 'Thais', 'Fernanda'];
    const reporters = defaultReporterNames.map(name => users.find((u: any) => u.name.toLowerCase().includes(name.toLowerCase()) && u.role === 'reporter')).filter(Boolean);
    const newShift = new Date().getHours() < 14 ? 'Manhã' : 'Tarde';
    
    reporters.forEach((u: any) => {
      // Slot for finalizado (for both shifts)
      const hasFinalizadoTask = pendingTasks.some(t => t.status === 'finalizado' && t.reporterId === u.uid);
      if (!hasFinalizadoTask) {
        pendingTasks.push({
          id: Date.now().toString() + Math.random(),
          subject: '',
          reporterId: u.uid,
          pauteiroId: userData?.uid || '',
          description: '',
          markedUser: '',
          status: 'finalizado',
          replies: [],
          shift: getCurrentShift()
        });
      }

      // Slot for amanha (both shifts)
      const hasAmanhaTask = pendingTasks.some(t => t.status === 'amanha' && t.reporterId === u.uid);
      if (!hasAmanhaTask) {
        pendingTasks.push({
          id: Date.now().toString() + Math.random() + 1,
          subject: 'ABERTO / SEM PAUTA',
          reporterId: u.uid,
          pauteiroId: userData?.uid || '',
          description: '',
          markedUser: '',
          status: 'amanha',
          replies: [],
          shift: getCurrentShift()
        });
      }
    });
    
    setNewHandover({
      date: todayStr,
      shift: newShift,
      suggestions: '',
      openReportersForTomorrow: [] as string[],
      scheduledReportersForTomorrow: [] as { id: string, reporterId: string, task: string }[],
      tasks: pendingTasks
    });
    setIsNewFormOpen(true);
  };

  const handleAddHandover = async (e: React.FormEvent) => {
    e.preventDefault();

    // Filter out completely empty tasks
    // A task is valid if it has a subject OR it is scheduled for tomorrow with a reporter
    const validTasks = newHandover.tasks
      .filter(t => t.subject.trim() !== '' || (t.status === 'amanha' && t.reporterId))
      .map(t => {
        const safeSubject = t.subject.trim() === '' && t.status === 'amanha' ? 'ABERTO / SEM PAUTA' : t.subject;
        const safeDesc = t.description.trim() === '' ? '-' : t.description;
        return { ...t, subject: safeSubject, description: safeDesc };
      });
    
    if (validTasks.length === 0) {
      return toast.error('Preencha ao menos um assunto e descrição');
    }
    
    try {
      await addDoc(collection(db, 'handovers'), {
        date: newHandover.date,
        shift: newHandover.shift,
        suggestions: newHandover.suggestions,
        openReportersForTomorrow: newHandover.openReportersForTomorrow || [],
        scheduledReportersForTomorrow: newHandover.scheduledReportersForTomorrow || [],
        tasks: validTasks,
        createdBy: userData?.uid,
        createdAt: Date.now()
      });
      setIsNewFormOpen(false);
      toast.success('Relatório adicionado');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleAddReply = async (handoverId: string, taskId: string, markFinished = false) => {
    const content = replyInputs[taskId];
    // Allow saving if only marking finished without a specific message text
    if (!content && !markFinished) return;

    try {
      const handover = handovers.find(h => h.id === handoverId);
      if (!handover) return;

      const updatedTasks = handover.tasks.map((t: HandoverTask) => {
        if (t.id === taskId) {
          const newReplies = content ? [...(t.replies || []), {
            id: Date.now().toString(),
            authorId: userData?.uid || '',
            authorName: userData?.name || 'Usuário',
            content,
            createdAt: Date.now()
          }] : t.replies;

          return {
            ...t,
            replies: newReplies,
            status: markFinished ? 'finalizado' : t.status,
            ...(markFinished ? {
              statusUpdatedBy: userData?.name || 'Usuário',
              statusUpdatedAt: Date.now()
            } : {})
          };
        }
        return t;
      });

      await updateDoc(doc(db, 'handovers', handoverId), { tasks: updatedTasks });
      setReplyInputs(prev => ({ ...prev, [taskId]: '' }));
      if (markFinished) toast.success('Tarefa marcada como finalizada!');
      else toast.success('Resposta enviada!');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUpdateStatus = async (handoverId: string, taskId: string, newStatus: 'pendente' | 'finalizado' | 'urgente' | 'amanha') => {
    try {
      const handover = handovers.find(h => h.id === handoverId);
      if (!handover) return;

      const updatedTasks = handover.tasks.map(t => t.id === taskId ? { 
        ...t, 
        status: newStatus,
        statusUpdatedBy: userData?.name || 'Usuário',
        statusUpdatedAt: Date.now()
      } : t);
      await updateDoc(doc(db, 'handovers', handoverId), { tasks: updatedTasks });
      toast.success(`Status alterado`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const exportDayPDF = (hDate: string) => {
    const doc = new jsPDF();
    const dayHandovers = handovers.filter((h: any) => h.date === hDate);
    const formattedDate = hDate.split('-').reverse().join('/');
    
    doc.text(`Relatório de Plantão - ${formattedDate}`, 14, 15);
    let currentY = 25;

    // 1. O QUE FOI FEITO
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('O QUE FOI FEITO:', 14, currentY);
    currentY += 6;
    doc.setFont('helvetica', 'normal');

    const feitosData: any[][] = [];
    ['Manhã', 'Tarde', 'Noite'].forEach(shiftName => {
      let shiftFeitosRaw: HandoverTask[] = [];
      dayHandovers.forEach((sh: any) => {
        if (sh.tasks) {
          shiftFeitosRaw = shiftFeitosRaw.concat(sh.tasks.filter((t: HandoverTask) => t.status === 'finalizado' && !t.subject.toUpperCase().includes('PENDÊNCIA') && (t.shift === shiftName || (!t.shift && sh.shift === shiftName))));
        }
      });
      const shiftFeitos = Array.from(new Map(
        shiftFeitosRaw.map((t: HandoverTask) => [`${t.reporterId || 'Indef'}|${(t.subject || '').trim().toLowerCase()}`, t])
      ).values());
      
      const groupedFeitos: Record<string, HandoverTask[]> = {};
      shiftFeitos.forEach((t) => {
        const rep = t.reporterId ? getUserName(t.reporterId).toUpperCase() : 'GERAL';
        if (!groupedFeitos[rep]) groupedFeitos[rep] = [];
        groupedFeitos[rep].push(t);
      });

      Object.keys(groupedFeitos).sort((a,b) => a.localeCompare(b)).forEach(rep => {
        groupedFeitos[rep].forEach((t, idx) => {
          feitosData.push([
            idx === 0 ? shiftName.toUpperCase() : '',
            idx === 0 ? (t.pauteiroId ? getUserName(t.pauteiroId).toUpperCase() : '-') : '',
            idx === 0 ? rep : '',
            t.subject,
            t.description
          ]);
        });
      });
    });

    if (feitosData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Turno', 'Pauteiro', 'Repórter', 'Assunto', 'Detalhes']],
        body: feitosData,
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.text('Nenhum registro finalizado neste dia.', 14, currentY);
      currentY += 10;
    }

    // 2. O QUE TÁ PENDENTE
    doc.setFont('helvetica', 'bold');
    doc.text('PENDÊNCIAS PRO PRÓXIMO TURNO:', 14, currentY);
    currentY += 6;
    doc.setFont('helvetica', 'normal');

    const pendentesData: any[][] = [];
    if (dayHandovers.length > 0) {
      const sortedHandovers = [...dayHandovers].sort((a, b) => b.createdAt - a.createdAt);
      const lastHandoverOfDay = sortedHandovers[0];
      
      ['Manhã', 'Tarde', 'Noite'].forEach(shiftName => {
        if (lastHandoverOfDay.tasks) {
          const shiftPendentes = lastHandoverOfDay.tasks.filter((t: HandoverTask) => (t.status !== 'finalizado' || (t.status === 'finalizado' && t.subject.toUpperCase().includes('PENDÊNCIA'))) && t.status !== 'amanha' && (t.shift === shiftName || (!t.shift && lastHandoverOfDay.shift === shiftName)));
          shiftPendentes.forEach((t: HandoverTask) => {
            pendentesData.push([
              shiftName.toUpperCase(),
              t.pauteiroId ? getUserName(t.pauteiroId).toUpperCase() : '-',
              t.reporterId ? getUserName(t.reporterId).toUpperCase() : 'GERAL',
              t.subject + (t.markedUser ? `\n(Notificado: ${getUserName(t.markedUser)})` : ''),
              t.description,
              t.status === 'finalizado' ? 'RESOLVIDO' : t.status.toUpperCase()
            ]);
          });
        }
      });
    }

    if (pendentesData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Turno', 'Pauteiro', 'Repórter', 'Assunto', 'Detalhes', 'Status']],
        body: pendentesData,
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    } else {
      doc.text('Nenhuma pendência registrada.', 14, currentY);
      currentY += 10;
    }

    // 3. RECADO E SUGESTÕES GERAIS
    let hasSuggestions = false;
    dayHandovers.forEach((h: any) => {
      if (h.suggestions) {
        if (!hasSuggestions) {
          doc.setFont('helvetica', 'bold');
          doc.text('OBSERVAÇÕES DOS TURNOS:', 14, currentY);
          currentY += 6;
          doc.setFont('helvetica', 'normal');
          hasSuggestions = true;
        }
        const text = `[${h.shift}] ${h.suggestions}`;
        const lines = doc.splitTextToSize(text, 180);
        doc.text(lines, 14, currentY);
        currentY += (6 * lines.length) + 2;
      }
    });

    if (hasSuggestions) currentY += 4;
    
    // 4. PROGRAMAÇÃO PRA AMANHÃ
    // Combines all unique "Amanhã" items from ALL handovers of the day
    const allAmanhaTasks: {reporter: string, subjectDesc: string, isAberto: boolean}[] = [];
    
    if (dayHandovers.length > 0) {
      const sortedHandovers = [...dayHandovers].sort((a, b) => b.createdAt - a.createdAt);
      
      sortedHandovers.forEach((sh: any) => {
        if (sh.tasks) {
          const hAmanha = sh.tasks.filter((t: HandoverTask) => t.status === 'amanha');
          hAmanha.forEach((t: HandoverTask) => {
            const desc = t.description?.trim() === '' || t.description?.trim() === '-' ? '' : ` - ${t.description}`;
            const finalSubject = `${t.subject}${desc}`;
            const isAberto = t.subject.includes('ABERTO / SEM PAUTA') || t.subject.trim() === 'ABERTO' || finalSubject.trim() === '';
            
            allAmanhaTasks.push({
              reporter: t.reporterId ? getUserName(t.reporterId).toUpperCase() : 'GERAL',
              subjectDesc: finalSubject,
              isAberto
            });
          });
        }
      });
    }

    const amanhaData: any[][] = [];
    const groupedAmanha = allAmanhaTasks.reduce((acc, curr) => {
      if (!acc[curr.reporter]) acc[curr.reporter] = [];
      // avoid exact dupes
      if (!acc[curr.reporter].find((x: any) => x.subjectDesc === curr.subjectDesc)) {
         acc[curr.reporter].push(curr);
      }
      return acc;
    }, {} as any);

    Object.keys(groupedAmanha).forEach(rep => {
       const repTasks = groupedAmanha[rep];
       const realTasks = repTasks.filter((t: any) => !t.isAberto);
       if (realTasks.length > 0) {
          // If they have real tasks, only show the real ones (drop the ABERTO placeholders)
          realTasks.forEach((t: any, idx: number) => amanhaData.push([idx === 0 ? rep : '', t.subjectDesc]));
       } else {
          // Otherwise show whatever they had (e.g. ABERTO)
          repTasks.forEach((t: any, idx: number) => amanhaData.push([idx === 0 ? rep : '', t.subjectDesc]));
       }
    });

    if (amanhaData.length > 0) {
      autoTable(doc, {
        startY: currentY,
        head: [['Repórter', 'Pauta / Observação']],
        body: amanhaData,
      });
      currentY = (doc as any).lastAutoTable.finalY + 10;
    }

    doc.save(`resumo-plantao-${formattedDate.replace(/\//g, '-')}.pdf`);
  };

  const exportSinglePDF = (h: any) => {
    exportDayPDF(h.date);
  };

  const isAuthorized = ['admin', 'editor', 'pauteiro', 'pauteira'].includes(userData?.role || '');

  if (!isAuthorized) {
    return <div className="p-8 text-center bg-white rounded-lg shadow-sm border border-ric-border">
      <h2 className="text-xl font-bold text-ric-text mb-2">Acesso Negado</h2>
      <p className="text-ric-muted">Apenas editores, pauteiros e administradores podem acessar o histórico de plantões.</p>
    </div>;
  }

  return (
    <div className="space-y-[20px]">
      {myMentions.length > 0 && (
        <div className="bg-ric-red/5 border-2 border-ric-red/20 rounded-2xl p-6 mb-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-ric-red text-white p-2 rounded-lg animate-bounce">
              <MessageSquare size={20} />
            </div>
            <div>
               <h3 className="font-black text-ric-red uppercase text-[15px] tracking-tight">Assuntos Esperando sua Resposta</h3>
               <p className="text-[11px] text-ric-red/70 font-bold uppercase tracking-widest">Você foi marcado nos itens abaixo. Eles serão incluídos no seu próximo relatório e EXIGEM uma resposta sua.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myMentions.map((m, idx) => (
              <div key={`${m.handoverId}-${idx}`} className="bg-white p-4 rounded-xl border-l-4 border-l-ric-red shadow-sm transition-all hover:shadow-md group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-black bg-gray-100 text-ric-muted px-2 py-0.5 rounded uppercase">
                    {m.handoverDate?.split('-').reverse().join('/')} — {m.handoverShift}
                  </span>
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${m.status === 'urgente' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    {m.status}
                  </span>
                </div>
                <h4 className="font-black text-ric-text text-[13px] uppercase mb-1 truncate group-hover:text-ric-red transition-colors">{m.subject}</h4>
                <p className="text-[12px] text-ric-muted line-clamp-1 mb-3 italic opacity-75">"{m.description}"</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Sua resposta..."
                    value={replyInputs[m.id] || ''}
                    onChange={e => setReplyInputs(prev => ({...prev, [m.id]: e.target.value}))}
                    className="flex-1 text-[11px] border border-gray-200 rounded-lg p-2 bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-ric-red transition-all font-medium"
                  />
                  <button 
                    onClick={() => handleAddReply(m.handoverId, m.id, false)}
                    disabled={!replyInputs[m.id]}
                    className="bg-ric-blue text-white p-2 rounded-lg hover:bg-blue-800 disabled:opacity-30 transition-all shadow-md active:scale-95"
                  >
                    <MessageSquare size={16} />
                  </button>
                  <button 
                    onClick={() => handleAddReply(m.handoverId, m.id, true)}
                    className="bg-ric-green text-white p-2 rounded-lg hover:bg-green-700 transition-all shadow-md active:scale-95"
                    title="Responder e Finalizar"
                  >
                    <CheckCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between items-center bg-[#003366] text-white border border-ric-border shadow-lg rounded-xl p-5 mb-8 bg-gradient-to-r from-[#003366] to-[#004A8F]">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-lg">
            <MessageSquare size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight">Escala de Plantão / Passagem</h2>
            <p className="text-[11px] text-white/70 font-medium uppercase tracking-widest mt-0.5">Histórico de entregas e pendências de pauta</p>
          </div>
        </div>
        {handovers.length === 0 && (
          <button 
            onClick={handleOpenNewForm}
            className="bg-ric-red hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase shadow-lg transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={18} /> Novo Relatório
          </button>
        )}
      </div>

      {/* RESUMO DE PRÓXIMAS PRODUÇÕES */}
      {handovers.length > 0 && (() => {
        const isVazio = (t: any) => {
          const s = (t.subject || '').trim().toUpperCase();
          return s === '' || s === 'ABERTO' || s.includes('ABERTO / SEM PAUTA') || s === '[PENDÊNCIA]' || s === '[PENDÊNCIA] ' || s === '-';
        };
        const latestHandover = handovers[0];
        const recentHandovers = handovers.filter((h: any) => h.date === latestHandover.date && h.shift === latestHandover.shift);
        
        const isPendencia = (t: any) => t.subject?.toUpperCase().includes('PENDÊNCIA');
        
        // Use a Map to deduplicate tasks by reporter and subject, favoring the most recent version (since recentHandovers is descending)
        const allTasksRaw = recentHandovers.slice().reverse().flatMap((h: any) => h.tasks || []);
        const allTasks = Array.from(new Map(allTasksRaw.map((t: any) => {
          const key = `${t.reporterId || 'Indef'}|${(t.subject || '').trim().toLowerCase()}`;
          return [key, t];
        })).values());
        
        const amTasks = allTasks.filter((t: any) => {
          if (t.status === 'amanha') return true;
          // Se for turno da Tarde, as produções finalizadas também contam pra amanhã
          if (latestHandover.shift === 'Tarde' && t.status === 'finalizado' && !isPendencia(t)) return true;
          return false;
        }) || [];
        
        const pautasFechadas = amTasks.filter((t: any) => !isVazio(t));
        
        const defaultReporterNames = ['Bruna', 'Ricardo', 'Tiago', 'Thais', 'Fernanda'];
        const defaultRepIds = defaultReporterNames.map(name => {
           const u = users.find((u: any) => u.name.toLowerCase().includes(name.toLowerCase()) && u.role === 'reporter');
           return u ? u.uid : null;
        }).filter(Boolean) as string[];
        
        const reportersComPauta = pautasFechadas.map((t: any) => t.reporterId).filter(Boolean);
        const semPautaUids = defaultRepIds.filter((id: string) => !reportersComPauta.includes(id));
        
        const pauteiros = Array.from(new Set(recentHandovers.map((h: any) => getUserName(h.createdBy).split(' ')[0]))).join(', ');
        
        return (
          <div className="bg-white p-6 rounded-2xl border border-blue-200/60 shadow-sm mb-8 flex flex-col md:flex-row gap-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
            
            <div className="flex-1">
              <div className="mb-4">
                <h3 className="text-[14px] font-black uppercase tracking-tight text-blue-900 leading-none mb-1">
                  Resumo do Último Turno
                </h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Plantões de {latestHandover.date.split('-').reverse().join('/')} ({latestHandover.shift}) — {pauteiros}
                </p>
              </div>

              <h4 className="text-[11px] font-black text-gray-400 border-b border-gray-100 pb-2 uppercase mb-4 tracking-[2px]">Pautas Fechadas (Próximas Produções)</h4>
              {pautasFechadas.length === 0 ? (
                <div className="text-[12px] text-gray-400 italic font-medium">Nenhuma pauta fechada.</div>
              ) : (
                <ul className="space-y-3">
                  {pautasFechadas.map((t: any) => {
                    const rep = t.reporterId ? getUserName(t.reporterId).split(' ')[0] : 'Indef.';
                    return (
                      <li key={t.id} className="text-[13px] text-gray-800 leading-tight flex items-start gap-2">
                         <span className="font-black uppercase shrink-0 text-ric-blue">{rep}:</span>
                         <span className="font-bold">{t.subject}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            
            <div className="md:w-[280px] shrink-0 border-t md:border-t-0 md:border-l border-gray-100 pt-5 md:pt-0 md:pl-8">
              <h4 className="text-[11px] font-black text-gray-400 border-b border-gray-100 pb-2 uppercase mb-4 tracking-[2px]">Repórteres Sem Pauta</h4>
              {semPautaUids.length === 0 ? (
                <div className="text-[12px] text-gray-500 italic font-medium">Todos com pauta!</div>
              ) : (
                <ul className="space-y-3">
                  {semPautaUids.map(uid => (
                    <li key={uid} className="text-[13px] font-black text-amber-600 uppercase flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      {getUserName(uid).split(' ')[0]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })()}

      {handovers.length === 0 ? (
        <div className="bg-ric-bg p-8 text-center text-ric-muted border border-dashed border-gray-300 rounded-[8px]">
          Nenhum plantão registrado ainda.
        </div>
      ) : (
        <div className="space-y-[15px]">
          {handovers.map(h => (
             <div key={h.id} className="bg-white rounded-xl border border-ric-border shadow-md overflow-hidden mb-6 transition-all border-l-4 border-l-ric-blue">
               <button 
                 onClick={() => toggleReport(h.id)}
                 className="w-full flex justify-between items-center p-5 hover:bg-gray-50 transition-colors cursor-pointer text-left focus:outline-none"
               >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2">
                       <div className={`p-1.5 rounded-md ${h.shift === 'Manhã' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                          <ChevronDown size={18} />
                       </div>
                       <span className="font-black text-[15px] text-ric-text uppercase tracking-tight">
                         {h.date?.split('-').reverse().join('/') || format(h.createdAt || Date.now(), 'dd/MM/yyyy')} — TURNO: {h.shift} 
                       </span>
                    </div>
                    <span className="text-ric-muted font-black text-[10px] bg-gray-100 border border-gray-200 px-2 py-1 rounded uppercase tracking-wider">
                      REDAÇÃO: {getUserName(h.createdBy)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-bold text-ric-muted bg-gray-50 px-2 py-1 rounded border border-gray-200 hidden sm:block">
                      POSTADO ÀS {format(h.createdAt || Date.now(), 'HH:mm')}
                    </span>
                    {expandedReports[h.id] ? <ChevronUp size={22} className="text-ric-blue" /> : <ChevronDown size={22} className="text-ric-muted" />}
                  </div>
               </button>

               {expandedReports[h.id] && (
                 <div className="p-6 pt-0 border-t border-gray-100 bg-gray-50/30">
                    <div className="mt-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4 mb-6">
                      <div className="flex items-center gap-2 text-ric-muted">
                        <CheckCircle size={14} className="text-ric-green" />
                        <span className="text-[11px] font-black uppercase">Resumo da Passagem</span>
                      </div>
                      <div className="flex gap-2">
                        {userData?.uid === h.createdBy && (
                          <button onClick={() => handleStartEdit(h)} className="bg-white text-ric-blue px-3 py-1.5 rounded-lg font-black shadow-sm flex items-center border border-ric-blue/20 hover:bg-blue-50 text-[10px] uppercase transition-all">
                            <Edit size={14} className="mr-2" /> Editar
                          </button>
                        )}
                        {userData?.role === 'admin' && (
                          <button onClick={() => handleDeleteHandover(h.id)} className="bg-white text-ric-red px-3 py-1.5 rounded-lg font-black shadow-sm flex items-center border border-ric-red/20 hover:bg-red-50 text-[10px] uppercase transition-all">
                            <Trash2 size={14} className="mr-2" /> Excluir
                          </button>
                        )}
                        <button onClick={() => exportSinglePDF(h)} className="bg-ric-text text-white px-3 py-1.5 rounded-lg font-black shadow-sm flex items-center hover:bg-gray-800 text-[10px] uppercase transition-all">
                          <Download size={14} className="mr-2" /> Exportar PDF (Resumo do Dia)
                        </button>
                      </div>
                    </div>
                   {editingHandover?.id === h.id ? (
                      <form onSubmit={handleSaveEdit} className="space-y-[15px] pt-4">
                        <div className="flex justify-end gap-2 mb-[15px]">
                           <button type="button" onClick={handleCancelEdit} className="text-ric-muted hover:text-ric-text text-[12px] font-bold uppercase transition-colors px-[12px] py-[6px]">
                             Cancelar Edição
                           </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px]">
                          <div>
                            <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Data do Relatório</label>
                            <input type="date" value={editingHandover.date} onChange={e => setEditingHandover({...editingHandover, date: e.target.value})} className="block w-full rounded-xl border-gray-200 p-3 bg-white focus:ring-2 focus:ring-ric-blue outline-none text-[13px]" />
                          </div>
                          <div>
                            <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Turno entregue</label>
                            <select value={editingHandover.shift} onChange={e => setEditingHandover({...editingHandover, shift: e.target.value})} className="block w-full rounded-xl border-gray-200 p-3 bg-white focus:ring-2 focus:ring-ric-blue outline-none text-[13px]">
                              <option value="Manhã">Manhã</option>
                              <option value="Tarde">Tarde</option>
                              <option value="Noite">Noite</option>
                            </select>
                          </div>
                        </div>
        
                        <div className="space-y-[15px] mt-6">
                          {(() => {
                            const isPendencia = (t: any) => t.subject?.toUpperCase().includes('PENDÊNCIA');
                            const tasksFinalizadas = editingHandover.tasks.filter((t: any) => {
                               if (t.status === 'finalizado' && !isPendencia(t)) return true;
                               return false;
                            });
                            const tasksPendentes = editingHandover.tasks.filter((t: any) => t.status === 'pendente' || t.status === 'urgente' || (t.status === 'finalizado' && isPendencia(t)));
                            const tasksAmanha = editingHandover.tasks.filter((t: any) => {
                               return t.status === 'amanha';
                            });

                            const renderTable = (tasks: any[], title: string, colorClass: string, icon: any, statusType: 'pendente' | 'finalizado' | 'amanha') => {
                              const bgClass = statusType === 'finalizado' ? 'bg-green-50/50 border-green-200' : statusType === 'amanha' ? 'bg-blue-50/50 border-blue-200' : 'bg-amber-50/50 border-amber-200';
                              const headerBgClass = statusType === 'finalizado' ? 'bg-green-100/50' : statusType === 'amanha' ? 'bg-blue-100/50' : 'bg-amber-100/50';
                              
                              const handleDuplicateTaskRow = (baseTask: any) => {
                                setEditingHandover((prev: any) => {
                                  const newTask = {
                                    id: Date.now().toString() + Math.random(),
                                    subject: '',
                                    reporterId: baseTask.reporterId,
                                    pauteiroId: userData?.uid || '',
                                    description: '',
                                    markedUser: baseTask.markedUser,
                                    status: baseTask.status,
                                    replies: [],
                                    shift: getCurrentShift()
                                  };
                                  const taskIndex = prev.tasks.findIndex((t: any) => t.id === baseTask.id);
                                  if (taskIndex >= 0) {
                                    const newTasks = [...prev.tasks];
                                    newTasks.splice(taskIndex + 1, 0, newTask);
                                    return { ...prev, tasks: newTasks };
                                  }
                                  return { ...prev, tasks: [...prev.tasks, newTask] };
                                });
                              };
                              
                              const handleAddStatusTask = () => {
                                setEditingHandover((prev: any) => ({
                                  ...prev,
                                  tasks: [...prev.tasks, {
                                    id: Date.now().toString() + Math.random(),
                                    subject: '', reporterId: '', pauteiroId: userData?.uid || '',
                                    description: '', markedUser: '', status: statusType, replies: [], shift: getCurrentShift()
                                  }]
                                }));
                              };

                              return (
                                <div className={`mb-6 rounded-xl border shadow-sm overflow-hidden ${bgClass}`}>
                                  <div className={`p-4 border-b ${statusType === 'finalizado' ? 'border-green-200' : statusType === 'amanha' ? 'border-blue-200' : 'border-amber-200'} ${headerBgClass} flex items-center justify-between ${colorClass}`}>
                                    <h3 className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                                      {icon} {title} ({tasks.length})
                                    </h3>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[800px]">
                                      <thead>
                                        <tr className={`${headerBgClass} border-b ${statusType === 'finalizado' ? 'border-green-200/50' : statusType === 'amanha' ? 'border-blue-200/50' : 'border-amber-200/50'} opacity-80`}>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[160px]">Repórter (Opcional)</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[250px]">Retranca/Assunto</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest min-w-[200px]">Observações/Detalhes</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[160px]">Notificar?</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[40px]"></th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200/30">
                                        {tasks.length === 0 && (
                                          <tr>
                                            <td colSpan={5} className="p-8 text-center text-[12px] font-medium text-gray-500 italic">
                                              Nenhum item adicionado nesta seção ainda.
                                            </td>
                                          </tr>
                                        )}
                                        {tasks.map((task: any, index: number) => {
                                          const isDuplicateReporter = index > 0 && task.reporterId && task.reporterId === tasks[index - 1].reporterId;
                                          return (
                                            <React.Fragment key={task.id}>
                                              <tr className="hover:bg-black/5">
                                                <td className="p-3 align-top">
                                                  {isDuplicateReporter ? (
                                                    <div className="flex items-center justify-end pr-4 text-gray-400 h-[36px]">
                                                      <CornerDownRight size={16} />
                                                    </div>
                                                  ) : (
                                                    <select value={task.reporterId || ''} onChange={e => updateEditTask(task.id, 'reporterId', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] font-bold cursor-pointer hover:border-gray-400">
                                                      <option value="">(Nenhum)</option>
                                                      {users.filter(u => u.role === 'reporter').map(u => {
                                                        const otherTasksCount = tasks.filter((t: any) => t.id !== task.id && t.reporterId === u.uid && t.subject.trim() !== '' && t.subject.trim() !== 'ABERTO / SEM PAUTA').length;
                                                        const warningText = otherTasksCount > 0 ? ` ⚠️ (Já possui pauta)` : '';
                                                        return <option key={u.uid} value={u.uid}>{u.name}{warningText}</option>;
                                                      })}
                                                    </select>
                                                  )}
                                                </td>
                                                <td className="p-3 align-top">
                                                  <input type="text" value={task.subject} onChange={e => updateEditTask(task.id, 'subject', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] font-bold placeholder:font-normal placeholder:text-gray-400 hover:border-gray-400" placeholder="Ex: Acidente na Rodovia / ou deixe vazio se livre" />
                                                </td>
                                                <td className="p-3 align-top">
                                                  <textarea rows={1} value={task.description} onChange={e => updateEditTask(task.id, 'description', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] leading-relaxed resize-y min-h-[36px] placeholder:font-normal placeholder:text-gray-400 hover:border-gray-400" placeholder="Detalhes (Opcional se for para amanhã livre)" />
                                                </td>
                                                <td className="p-3 align-top">
                                                  <select value={task.markedUser} onChange={e => updateEditTask(task.id, 'markedUser', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] font-bold cursor-pointer hover:border-gray-400">
                                                    <option value="">(Ninguém)</option>
                                                    {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                                                  </select>
                                                </td>
                                                <td className="p-3 align-top flex items-center justify-center gap-2">
                                                  {statusType === 'pendente' && (
                                                    <button 
                                                      type="button" 
                                                      onClick={() => updateEditTask(task.id, 'status', task.status === 'finalizado' ? 'pendente' : 'finalizado')} 
                                                      className={`p-1.5 rounded-md transition-all text-[10px] font-black uppercase ${task.status === 'finalizado' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                                                      title={task.status === 'finalizado' ? 'Reabrir pendência' : 'Marcar como resolvido'}
                                                    >
                                                      {task.status === 'finalizado' ? <CheckCircle size={14} /> : 'Resolver'}
                                                    </button>
                                                  )}
                                                  <button type="button" onClick={() => handleDuplicateTaskRow(task)} className="p-1.5 text-ric-blue hover:text-blue-700 hover:bg-blue-100/50 rounded-md transition-all" title="Adicionar outra pauta para este repórter">
                                                    <Plus size={16} />
                                                  </button>
                                                  <button type="button" onClick={() => handleRemoveEditTask(task.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-black/10 rounded-md transition-all" title="Remover item">
                                                    <Trash2 size={16} />
                                                  </button>
                                                </td>
                                              </tr>
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                  <div className={`p-3 ${headerBgClass} border-t ${statusType === 'finalizado' ? 'border-green-200' : statusType === 'amanha' ? 'border-blue-200' : 'border-amber-200'} flex justify-center`}>
                                    <button type="button" onClick={handleAddStatusTask} className={`text-[12px] font-black uppercase tracking-tight hover:underline flex items-center gap-1 ${colorClass}`}>
                                      <Plus size={16} /> Adicionar Novo Item nesta Seção
                                    </button>
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <div className="space-y-6">
                                {editingHandover.shift !== 'Tarde' && renderTable(tasksFinalizadas, "Produção Finalizada", "text-green-700", <CheckCircle size={16} />, "finalizado")}
                                {renderTable(tasksAmanha, "Amanhã", "text-blue-700", <CalendarPlus size={16} />, "amanha")}
                                {renderTable(tasksPendentes, "Pendências", "text-amber-700", <MessageSquare size={16} />, "pendente")}
                              </div>
                            );
                          })()}
                        </div>
        
                        <div className="pt-4 mt-6 border-t border-gray-100">
                          <div className="mt-6 border-t border-gray-100 pt-6">
                            <label className="block text-[11px] font-black text-ric-muted mb-2 uppercase tracking-widest">Observações Gerais</label>
                            <textarea rows={2} value={editingHandover.suggestions} onChange={e => setEditingHandover({...editingHandover, suggestions: e.target.value})} className="block w-full rounded-xl border-gray-200 p-3 bg-white focus:ring-2 focus:ring-ric-blue outline-none text-[13px]" placeholder="Instruções para o próximo turno..." />
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                           <button type="button" onClick={handleCancelEdit} className="px-6 py-2 rounded-xl text-[11px] font-black text-ric-muted uppercase hover:bg-gray-100 transition-all">
                              Cancelar
                           </button>
                           <button type="submit" className="bg-ric-green text-white rounded-xl px-8 py-3 text-[11px] font-black hover:bg-green-700 uppercase shadow-lg transition-all active:scale-95">
                             Salvar Alterações
                           </button>
                        </div>
                      </form>
                   ) : (
                      <>
                        {(() => {
                          const isPendencia = (t: any) => t.subject?.toUpperCase().includes('PENDÊNCIA');
                          const isVazioOuAberto = (t: any) => {
                             const s = (t.subject || '').trim().toUpperCase();
                             return s === '' || s === 'ABERTO' || s.includes('ABERTO / SEM PAUTA') || s === '[PENDÊNCIA]' || s === '[PENDÊNCIA] ' || s === '-';
                          };
                          const tasksFinalizadas = h.tasks?.filter((t: any) => {
                             if (isVazioOuAberto(t)) return false;
                             if (t.status === 'finalizado' && !isPendencia(t)) return true;
                             if (h.shift === 'Tarde' && t.status === 'amanha') return true;
                             return false;
                          }) || [];
                          const tasksPendentes = h.tasks?.filter((t: any) => (t.status === 'pendente' || t.status === 'urgente' || (t.status === 'finalizado' && isPendencia(t))) && !isVazioOuAberto(t)) || [];
                          const tasksAmanha = h.tasks?.filter((t: any) => {
                             if (isVazioOuAberto(t)) return false;
                             if (h.shift === 'Tarde' && t.status === 'amanha') return false;
                             return t.status === 'amanha';
                          }) || [];
                          
                          return (
                            <div className="mt-6 mb-6 space-y-8">
                               {h.suggestions && (
                                  <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200 shadow-sm">
                                     <h4 className="text-[10px] font-black text-amber-700 uppercase mb-3 tracking-[2px]">Mensagem da Coordenação</h4>
                                     <p className="text-[13px] text-amber-900 leading-relaxed font-medium italic">"{h.suggestions}"</p>
                                  </div>
                               )}

                               {/* PRODUÇÃO FINALIZADA */}
                               {h.shift !== 'Tarde' && (
                               <div className="mb-6 rounded-xl border border-green-200 shadow-sm overflow-hidden bg-green-50/50">
                                  <div className="p-4 border-b border-green-200 bg-green-100/50 flex items-center text-green-700">
                                    <h3 className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                                      <CheckCircle size={16} /> Produção Finalizada ({tasksFinalizadas.length})
                                    </h3>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-green-100/50 border-b border-green-200/50 opacity-80">
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[150px]">Repórter</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-1/4">Retranca</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest">Observações</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[120px]">Notificado</th>
                                        </tr>
                                      </thead>
                                      <tbody className="">
                                        {tasksFinalizadas.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-[12px] text-gray-500 italic">Nenhuma retranca finalizada.</td></tr>}
                                        {(() => {
                                          const grouped: Record<string, any[]> = {};
                                          tasksFinalizadas.forEach((t: any) => {
                                            const rep = t.reporterId ? getUserName(t.reporterId).split(' ')[0] : '-';
                                            if (!grouped[rep]) grouped[rep] = [];
                                            grouped[rep].push(t);
                                          });
                                          return Object.keys(grouped).sort((a, b) => a.localeCompare(b)).map(rep => {
                                            return grouped[rep].map((t: any, idx: number) => (
                                              <tr key={t.id} className={`hover:bg-black/5 ${idx === grouped[rep].length - 1 ? 'border-b-2 border-green-200/80 shadow-sm' : 'border-b border-green-200/30'}`}>
                                                {idx === 0 ? (
                                                  <td rowSpan={grouped[rep].length} className="p-3 align-top text-[12px] font-bold text-gray-800 uppercase border-r border-gray-200/30 bg-white/50">{rep}</td>
                                                ) : <td className="hidden"></td>}
                                                <td className="p-3 align-top font-bold text-[13px] text-gray-700 uppercase">{t.subject}</td>
                                                <td className="p-3 align-top text-[12px] text-gray-600 leading-relaxed whitespace-pre-wrap">
                                                  <div className="mb-2">{t.description}</div>
                                                  {(t.replies && t.replies.length > 0) && (
                                                    <div className="space-y-1 mt-2 mb-2 bg-white/50 p-2 rounded border border-gray-200">
                                                      {t.replies.map((r: any) => (
                                                        <div key={r.id} className="text-[10px]">
                                                          <span className="font-bold text-ric-blue capitalize">{r.authorName}</span> <span className="text-gray-400">({format(r.createdAt || Date.now(), 'HH:mm')})</span>: {r.content}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                  <div className="flex items-center gap-1 mt-2">
                                                    <input 
                                                      type="text" 
                                                      placeholder="Adicionar nota..."
                                                      value={replyInputs[t.id] || ''}
                                                      onChange={e => setReplyInputs(prev => ({...prev, [t.id]: e.target.value}))}
                                                      className="w-full text-[10px] border border-gray-300 rounded px-2 py-1 outline-none focus:border-ric-blue"
                                                    />
                                                    <button 
                                                      onClick={() => handleAddReply(h.id, t.id, false)}
                                                      disabled={!replyInputs[t.id]}
                                                      className="bg-ric-blue text-white p-1 rounded hover:bg-blue-800 disabled:opacity-50 shrink-0"
                                                    >
                                                      <MessageSquare size={12} />
                                                    </button>
                                                  </div>
                                                </td>
                                                <td className="p-3 align-top text-[11px] font-bold text-ric-blue">
                                                  {t.markedUser ? `@ ${getUserName(t.markedUser).split(' ')[0]}` : '-'}
                                                </td>
                                              </tr>
                                            ));
                                          });
                                        })()}
                                      </tbody>
                                    </table>
                                  </div>
                               </div>
                               )}

                               {/* AMANHÃ */}
                               <div className="mb-6 rounded-xl border border-blue-200 shadow-sm overflow-hidden bg-blue-50/50">
                                  <div className="p-4 border-b border-blue-200 bg-blue-100/50 flex items-center text-blue-700">
                                    <h3 className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                                      <CalendarPlus size={16} /> Amanhã ({tasksAmanha.length})
                                    </h3>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-blue-100/50 border-b border-blue-200/50 opacity-80">
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[150px]">Repórter</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-1/4">Retranca</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest">Observações</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[120px]">Notificado</th>
                                        </tr>
                                      </thead>
                                      <tbody className="">
                                        {tasksAmanha.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-[12px] text-gray-500 italic">Sem programação para amanhã.</td></tr>}
                                        {(() => {
                                          const grouped: Record<string, any[]> = {};
                                          tasksAmanha.forEach((t: any) => {
                                            const rep = t.reporterId ? getUserName(t.reporterId).split(' ')[0] : 'Indefinido';
                                            if (!grouped[rep]) grouped[rep] = [];
                                            grouped[rep].push(t);
                                          });
                                          return Object.keys(grouped).sort((a, b) => a.localeCompare(b)).map(rep => {
                                            return grouped[rep].map((t: any, idx: number) => (
                                              <tr key={t.id} className={`hover:bg-black/5 ${idx === grouped[rep].length - 1 ? 'border-b-2 border-blue-200/80 shadow-sm' : 'border-b border-blue-200/30'}`}>
                                                {idx === 0 ? (
                                                  <td rowSpan={grouped[rep].length} className="p-3 align-top text-[12px] font-bold text-gray-800 uppercase border-r border-gray-200/30 bg-white/50">{rep}</td>
                                                ) : <td className="hidden"></td>}
                                                <td className="p-3 align-top font-bold text-[13px] text-gray-800 uppercase">{t.subject}</td>
                                                <td className="p-3 align-top text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                  <div className="mb-2">{t.description}</div>
                                                  {(t.replies && t.replies.length > 0) && (
                                                    <div className="space-y-1 mt-2 mb-2 bg-white/50 p-2 rounded border border-blue-200/50">
                                                      {t.replies.map((r: any) => (
                                                        <div key={r.id} className="text-[10px]">
                                                          <span className="font-bold text-ric-blue capitalize">{r.authorName}</span> <span className="text-gray-400">({format(r.createdAt || Date.now(), 'HH:mm')})</span>: {r.content}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                  <div className="flex items-center gap-1 mt-2">
                                                    <input 
                                                      type="text" 
                                                      placeholder="Adicionar nota..."
                                                      value={replyInputs[t.id] || ''}
                                                      onChange={e => setReplyInputs(prev => ({...prev, [t.id]: e.target.value}))}
                                                      className="w-full text-[10px] border border-gray-300 rounded px-2 py-1 outline-none focus:border-ric-blue"
                                                    />
                                                    <button 
                                                      onClick={() => handleAddReply(h.id, t.id, false)}
                                                      disabled={!replyInputs[t.id]}
                                                      className="bg-ric-blue text-white p-1 rounded hover:bg-blue-800 disabled:opacity-50 shrink-0"
                                                    >
                                                      <MessageSquare size={12} />
                                                    </button>
                                                  </div>
                                                </td>
                                                <td className="p-3 align-top text-[11px] font-bold text-ric-blue">
                                                  {t.markedUser ? `@ ${getUserName(t.markedUser).split(' ')[0]}` : '-'}
                                                </td>
                                              </tr>
                                            ));
                                          });
                                        })()}
                                      </tbody>
                                    </table>
                                  </div>
                               </div>

                               {/* PENDENTES */}
                               <div className="mb-6 rounded-xl border border-amber-200 shadow-sm overflow-hidden bg-amber-50/50">
                                  <div className="p-4 border-b border-amber-200 bg-amber-100/50 flex items-center text-amber-700">
                                    <h3 className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                                      <MessageSquare size={16} /> Pendências ({tasksPendentes.length})
                                    </h3>
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                      <thead>
                                        <tr className="bg-amber-100/50 border-b border-amber-200/50 opacity-80">
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-1/4">Retranca</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest">Observações</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[120px]">Notificar?</th>
                                          <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[150px] text-right">Marcar Finalizado</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200/30">
                                        {tasksPendentes.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-[12px] text-gray-500 italic">Nenhuma pendência.</td></tr>}
                                        {tasksPendentes.map((t: any) => (
                                          <tr key={t.id} className={`hover:bg-black/5 ${t.status==='urgente'?'bg-red-50/30':''} ${t.status === 'finalizado' ? 'opacity-60 bg-green-50/50' : ''}`}>
                                            <td className="p-3 align-top font-bold text-[13px] text-gray-800 uppercase">
                                              {t.status === 'urgente' && <span className="text-[9px] bg-red-100 text-red-800 px-1 py-0.5 rounded mr-2 font-black uppercase">Urgente</span>}
                                              {t.status === 'finalizado' && <span className="text-[9px] bg-green-100 text-green-800 px-1 py-0.5 rounded mr-2 font-black uppercase border border-green-200">Resolvido ✅</span>}
                                              <span className={t.status === 'finalizado' ? 'line-through text-gray-500' : ''}>{t.subject}</span>
                                            </td>
                                            <td className="p-3 align-top text-[12px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                                              <div className="mb-2">{t.description}</div>
                                              {(t.replies && t.replies.length > 0) && (
                                                <div className="space-y-1 mt-2 mb-2 bg-white/50 p-2 rounded border border-amber-200/50">
                                                  {t.replies.map((r: any) => (
                                                    <div key={r.id} className="text-[10px]">
                                                      <span className="font-bold text-ric-blue capitalize">{r.authorName}</span> <span className="text-gray-400">({format(r.createdAt || Date.now(), 'HH:mm')})</span>: {r.content}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              <div className="flex items-center gap-1 mt-2">
                                                <input 
                                                  type="text" 
                                                  placeholder="Adicionar nota..."
                                                  value={replyInputs[t.id] || ''}
                                                  onChange={e => setReplyInputs(prev => ({...prev, [t.id]: e.target.value}))}
                                                  className="w-full text-[10px] border border-gray-300 rounded px-2 py-1 outline-none focus:border-ric-blue"
                                                />
                                                <button 
                                                  onClick={() => handleAddReply(h.id, t.id, false)}
                                                  disabled={!replyInputs[t.id]}
                                                  className="bg-ric-blue text-white p-1 rounded hover:bg-blue-800 disabled:opacity-50 shrink-0"
                                                >
                                                  <MessageSquare size={12} />
                                                </button>
                                              </div>
                                            </td>
                                            <td className="p-3 align-top text-[11px] font-bold text-ric-blue">
                                              {t.markedUser ? `@ ${getUserName(t.markedUser).split(' ')[0]}` : '-'}
                                            </td>
                                            <td className="p-3 align-top text-right">
                                              {t.status !== 'finalizado' && (
                                                <button onClick={() => handleUpdateStatus(h.id, t.id, 'finalizado')} className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-green-600 hover:text-white hover:border-green-600 transition-colors text-[10px] font-black uppercase px-3 py-1.5 rounded-lg shadow-sm">
                                                  Finalizar
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                               </div>
                            </div>
                          );
                        })()}
                      </>
                   )}
                 </div>
               )}
             </div>
          ))}
          
          {handovers.length >= visibleCount && (
            <div className="flex justify-center mt-4">
              <button 
                onClick={() => setVisibleCount(prev => prev + 9)}
                className="bg-white text-ric-blue px-[20px] py-[10px] rounded-[4px] font-bold shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border hover:bg-gray-50 text-[12px] uppercase transition-colors"
              >
                Carregar Mais Antigos
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-[40px] pt-[30px] border-t-2 border-dashed border-gray-300">
        <div className="bg-white rounded-2xl border-2 border-ric-blue shadow-xl overflow-hidden">
          <button 
            onClick={() => isNewFormOpen ? setIsNewFormOpen(false) : handleOpenNewForm()}
            className="w-full flex justify-between items-center p-6 bg-ric-blue text-white hover:bg-blue-800 transition-all cursor-pointer text-left focus:outline-none"
          >
            <div className="flex items-center gap-3">
               <div className="bg-white/20 p-2 rounded-lg relative">
                  <CalendarPlus size={22} />
                  {myMentions.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-ric-red rounded-full border-2 border-ric-blue animate-pulse"></span>
                  )}
               </div>
               <span className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                 Enviar Novo Relatório de Plantão
                 {myMentions.length > 0 && (
                   <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full animate-bounce">
                     {myMentions.length} {myMentions.length === 1 ? 'PENDÊNCIA' : 'PENDÊNCIAS'}
                   </span>
                 )}
               </span>
            </div>
            {isNewFormOpen ? <ChevronUp size={24} /> : <ChevronDown size={24} />}
          </button>
          
          {isNewFormOpen && (
            <div className="p-8 bg-gray-50">
              <div className="mb-8 p-4 bg-ric-blue/5 border border-ric-blue/10 rounded-xl flex items-start gap-4">
                 <div className="bg-ric-blue text-white p-2 rounded-lg shrink-0">
                    <MessageSquare size={20} />
                 </div>
                 <div>
                    <h3 className="font-black text-ric-blue uppercase text-[13px] mb-1">Dica Pedagógica</h3>
                    <p className="text-[13px] text-ric-muted leading-relaxed">
                       Registre o que foi <strong>concluído</strong> durante seu turno e o que deve ser <strong>acompanhado/finalizado</strong> pela próxima equipe. Pendências automáticas do turno anterior já foram carregadas abaixo.
                    </p>
                 </div>
              </div>

              <form onSubmit={handleAddHandover} className="space-y-10 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div>
                    <label className="block text-[11px] font-black text-ric-text mb-2 uppercase tracking-widest">Data do Plantão</label>
                    <input type="date" value={newHandover.date} onChange={e => setNewHandover({...newHandover, date: e.target.value})} className="block w-full rounded-xl border-gray-200 p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[14px] font-bold" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-ric-text mb-2 uppercase tracking-widest">Turno que você está entregando</label>
                    <select value={newHandover.shift} onChange={e => setNewHandover({...newHandover, shift: e.target.value})} className="block w-full rounded-xl border-gray-200 p-3 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[14px] font-bold appearance-none">
                      <option value="Manhã">Manhã</option>
                      <option value="Tarde">Tarde</option>
                      <option value="Noite">Noite</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                     <h4 className="text-[15px] font-black text-ric-blue uppercase tracking-tight">O que foi feito / O que está pendente</h4>
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mínimo: 1 registro</span>
                  </div>
                  
                  {(() => {
                    const isPendencia = (t: any) => t.subject?.toUpperCase().includes('PENDÊNCIA');
                    const tasksFinalizadas = newHandover.tasks.filter((t: any) => {
                       if (t.status === 'finalizado' && !isPendencia(t)) return true;
                       return false;
                    });
                    const tasksPendentes = newHandover.tasks.filter((t: any) => t.status === 'pendente' || t.status === 'urgente' || (t.status === 'finalizado' && isPendencia(t)));
                    const tasksAmanha = newHandover.tasks.filter((t: any) => {
                       return t.status === 'amanha';
                    });

                    const renderTable = (tasks: any[], title: string, colorClass: string, icon: any, statusType: 'pendente' | 'finalizado' | 'amanha') => {
                      const bgClass = statusType === 'finalizado' ? 'bg-green-50/50 border-green-200' : statusType === 'amanha' ? 'bg-blue-50/50 border-blue-200' : 'bg-amber-50/50 border-amber-200';
                      const headerBgClass = statusType === 'finalizado' ? 'bg-green-100/50' : statusType === 'amanha' ? 'bg-blue-100/50' : 'bg-amber-100/50';
                      
                      const handleDuplicateTaskRow = (baseTask: any) => {
                        setNewHandover(prev => {
                          const newTask = {
                            id: Date.now().toString() + Math.random(),
                            subject: '',
                            reporterId: baseTask.reporterId,
                            pauteiroId: userData?.uid || '',
                            description: '',
                            markedUser: baseTask.markedUser,
                            status: baseTask.status,
                            replies: [],
                            shift: getCurrentShift()
                          };
                          
                          // Insert the new task right after the base task
                          const taskIndex = prev.tasks.findIndex((t: any) => t.id === baseTask.id);
                          if (taskIndex >= 0) {
                            const newTasks = [...prev.tasks];
                            newTasks.splice(taskIndex + 1, 0, newTask);
                            return { ...prev, tasks: newTasks };
                          }
                          
                          return { ...prev, tasks: [...prev.tasks, newTask] };
                        });
                      };
                      
                      return (
                        <div className={`mb-6 rounded-xl border shadow-sm overflow-hidden ${bgClass}`}>
                          <div className={`p-4 border-b ${statusType === 'finalizado' ? 'border-green-200' : statusType === 'amanha' ? 'border-blue-200' : 'border-amber-200'} ${headerBgClass} flex items-center justify-between ${colorClass}`}>
                            <h3 className="text-[13px] font-black uppercase tracking-widest flex items-center gap-2">
                              {icon} {title} ({tasks.length})
                            </h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[800px]">
                              <thead>
                                <tr className={`${headerBgClass} border-b ${statusType === 'finalizado' ? 'border-green-200/50' : statusType === 'amanha' ? 'border-blue-200/50' : 'border-amber-200/50'} opacity-80`}>
                                  <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[160px]">Repórter (Opcional)</th>
                                  <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[250px]">Retranca/Assunto</th>
                                  <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest min-w-[200px]">Observações/Detalhes</th>
                                  <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[160px]">Notificar?</th>
                                  <th className="p-3 text-[10px] font-black text-gray-600 uppercase tracking-widest w-[40px]"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200/30">
                                {tasks.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="p-8 text-center text-[12px] font-medium text-gray-500 italic">
                                      Nenhum item adicionado nesta seção ainda.
                                    </td>
                                  </tr>
                                )}
                                {tasks.map((task: any, index: number) => {
                                  const isDuplicateReporter = index > 0 && task.reporterId && task.reporterId === tasks[index - 1].reporterId;
                                  
                                  return (
                                    <React.Fragment key={task.id}>
                                      <tr className="hover:bg-black/5">
                                        <td className="p-3 align-top">
                                          {isDuplicateReporter ? (
                                            <div className="flex items-center justify-end pr-4 text-gray-400 h-[36px]">
                                              <CornerDownRight size={16} />
                                            </div>
                                          ) : (
                                            <select value={task.reporterId || ''} onChange={e => updateNewTask(task.id, 'reporterId', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] font-bold cursor-pointer hover:border-gray-400">
                                              <option value="">(Nenhum)</option>
                                              {users.filter(u => u.role === 'reporter').map(u => {
                                                const otherTasksCount = tasks.filter((t: any) => t.id !== task.id && t.reporterId === u.uid && t.subject.trim() !== '' && t.subject.trim() !== 'ABERTO / SEM PAUTA').length;
                                                const warningText = otherTasksCount > 0 ? ` ⚠️ (Já possui pauta)` : '';
                                                return <option key={u.uid} value={u.uid}>{u.name}{warningText}</option>;
                                              })}
                                            </select>
                                          )}
                                        </td>
                                      <td className="p-3 align-top">
                                        <input type="text" value={task.subject} onChange={e => updateNewTask(task.id, 'subject', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] font-bold placeholder:font-normal placeholder:text-gray-400 hover:border-gray-400" placeholder="Ex: Acidente na Rodovia / ou deixe vazio se livre" />
                                      </td>
                                      <td className="p-3 align-top">
                                        <textarea rows={1} value={task.description} onChange={e => updateNewTask(task.id, 'description', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] leading-relaxed resize-y min-h-[36px] placeholder:font-normal placeholder:text-gray-400 hover:border-gray-400" placeholder="Detalhes (Opcional se for para amanhã livre)" />
                                      </td>
                                      <td className="p-3 align-top">
                                        <select value={task.markedUser} onChange={e => updateNewTask(task.id, 'markedUser', e.target.value)} className="block w-full rounded-md border border-gray-300/50 p-2 bg-white/80 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[11px] font-bold cursor-pointer hover:border-gray-400">
                                          <option value="">(Ninguém)</option>
                                          {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                                        </select>
                                      </td>
                                      <td className="p-3 align-top flex items-center justify-center gap-2">
                                        {statusType === 'pendente' && (
                                          <button 
                                            type="button" 
                                            onClick={() => updateNewTask(task.id, 'status', task.status === 'finalizado' ? 'pendente' : 'finalizado')} 
                                            className={`p-1.5 rounded-md transition-all text-[10px] font-black uppercase ${task.status === 'finalizado' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                                            title={task.status === 'finalizado' ? 'Reabrir pendência' : 'Marcar como resolvido'}
                                          >
                                            {task.status === 'finalizado' ? <CheckCircle size={14} /> : 'Resolver'}
                                          </button>
                                        )}
                                        <button type="button" onClick={() => handleDuplicateTaskRow(task)} className="p-1.5 text-ric-blue hover:text-blue-700 hover:bg-blue-100/50 rounded-md transition-all" title="Adicionar outra pauta para este repórter">
                                          <Plus size={16} />
                                        </button>
                                        <button type="button" onClick={() => handleRemoveTask(task.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-black/10 rounded-md transition-all" title="Remover item">
                                          <Trash2 size={16} />
                                        </button>
                                      </td>
                                    </tr>
                                  </React.Fragment>
                                );
                              })}
                              </tbody>
                            </table>
                          </div>
                          <div className={`p-3 ${headerBgClass} border-t ${statusType === 'finalizado' ? 'border-green-200' : statusType === 'amanha' ? 'border-blue-200' : 'border-amber-200'} flex justify-center`}>
                            <button type="button" onClick={() => handleAddStatusTask(statusType)} className={`text-[12px] font-black uppercase tracking-tight hover:underline flex items-center gap-1 ${colorClass}`}>
                              <Plus size={16} /> Adicionar Novo Item nesta Seção
                            </button>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <div className="space-y-6">
                        {newHandover.shift !== 'Tarde' && renderTable(tasksFinalizadas, "Produção Finalizada", "text-green-700", <CheckCircle size={16} />, "finalizado")}
                        {renderTable(tasksAmanha, "Amanhã", "text-blue-700", <CalendarPlus size={16} />, "amanha")}
                        {renderTable(tasksPendentes, "Pendências", "text-amber-700", <MessageSquare size={16} />, "pendente")}
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                  <div>
                    <label className="block text-[11px] font-black text-ric-muted mb-2 uppercase tracking-widest">Recado Final / Próxima Equipe</label>
                    <textarea rows={2} value={newHandover.suggestions} onChange={e => setNewHandover({...newHandover, suggestions: e.target.value})} className="block w-full rounded-xl border-gray-200 p-4 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-ric-blue outline-none transition-all text-[14px]" placeholder="Ex: Deixamos o estúdio organizado, amanhã o link começa às 07h..." />
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                   <button type="submit" className="bg-ric-green hover:bg-green-700 text-white rounded-xl px-12 py-4 text-sm font-black uppercase shadow-xl transition-all active:scale-95 flex items-center gap-3">
                     <CheckCircle size={20} /> Salvar e Publicar Relatório
                   </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
