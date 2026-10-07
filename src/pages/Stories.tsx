import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import { confirmAction } from '../lib/confirmHelper';
import { BookOpen, Plus, FileText, Phone, Link as LinkIcon, History, Edit, Trash2, Save, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getDisplayNames } from '../lib/userUtils';

interface Pendency {
  id: string;
  text: string;
  completed: boolean;
}

interface PhoneContact {
  id: string;
  name: string;
  number: string;
}

interface ExternalLink {
  id: string;
  title: string;
  url: string;
}

interface StoryLog {
  id: string;
  text: string;
  date: string; // ISO string or simple date
  userId: string;
}

interface RepercussionStory {
  id: string;
  title: string;
  description: string;
  responsibleId: string;
  responsibleIds?: string[]; // new array support
  status: 'active' | 'archived';
  pendencies: Pendency[];
  phones: PhoneContact[];
  links: ExternalLink[];
  logs: StoryLog[];
  createdAt: any;
}

export default function Stories() {
  const { userData } = useAuth();
  const [stories, setStories] = useState<RepercussionStory[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newResponsibles, setNewResponsibles] = useState<string[]>([]);

  // Editing state for nested arrays
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [newItems, setNewItems] = useState<{ [key: string]: string }>({});

  const isReporter = userData?.role === 'reporter';
  const displayNames = getDisplayNames(users);

  useEffect(() => {
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
    });
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'stories'));
    const unsub = onSnapshot(q, (snap) => {
      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RepercussionStory));
      docs.sort((a, b) => {
        const da = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const db = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return db - da; // desc
      });
      setStories(docs);
      setLoading(false);
    }, (error) => {
      console.error(error);
      toast.error('Erro ao carregar histórias: ' + error.message);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isReporter) return toast.error('Sem permissão.');
    if (!newTitle.trim()) return toast.error('O título é obrigatório.');

    try {
      if (!userData?.uid) {
        toast.error('Usuário não carregado. Tente novamente.');
        return;
      }
      await addDoc(collection(db, 'stories'), {
        title: newTitle.trim(),
        description: newDesc.trim(),
        responsibleId: newResponsibles.length > 0 ? newResponsibles[0] : userData.uid,
        responsibleIds: newResponsibles.length > 0 ? newResponsibles : [userData.uid],
        status: 'active',
        pendencies: [],
        phones: [],
        links: [],
        logs: [],
        createdAt: serverTimestamp()
      });
      toast.success('História criada com sucesso!');
      setIsFormOpen(false);
      setNewTitle('');
      setNewDesc('');
      setNewResponsibles([]);
    } catch (error: any) {
      toast.error('Erro ao criar: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (userData?.role !== 'admin') return toast.error('Apenas administradores podem apagar histórias.');
    confirmAction('Deseja apagar esta história toda?', async () => {
      try {
        await deleteDoc(doc(db, 'stories', id));
        toast.success('Apagada com sucesso.');
      } catch (error: any) {
        toast.error('Erro: ' + error.message);
      }
    });
  };

  const updateStory = async (id: string, field: string, value: any) => {
    if (isReporter) return toast.error('Sem permissão.');
    try {
      await updateDoc(doc(db, 'stories', id), { [field]: value });
    } catch (error: any) {
      toast.error('Erro ao atualizar: ' + error.message);
    }
  };

  // Generalized array update
  const addToArray = async (story: RepercussionStory, arrayField: keyof RepercussionStory, obj: any) => {
    if (isReporter) return;
    const currentList = story[arrayField] as any[];
    await updateStory(story.id, arrayField as string, [...currentList, { id: crypto.randomUUID(), ...obj }]);
  };

  const removeFromArray = async (story: RepercussionStory, arrayField: keyof RepercussionStory, itemId: string) => {
    if (isReporter) return;
    confirmAction('Deseja remover este item?', async () => {
      const currentList = story[arrayField] as any[];
      await updateStory(story.id, arrayField as string, currentList.filter(i => i.id !== itemId));
    });
  };

  const handleTogglePendency = async (story: RepercussionStory, pendencyId: string, completed: boolean) => {
    if (isReporter) return;
    const newList = story.pendencies.map(p => p.id === pendencyId ? { ...p, completed } : p);
    await updateStory(story.id, 'pendencies', newList);
  };

  const handleAddPendency = async (story: RepercussionStory) => {
    const text = newItems[`pendency-${story.id}`];
    if (!text?.trim()) return;
    await addToArray(story, 'pendencies', { text, completed: false });
    setNewItems(prev => ({ ...prev, [`pendency-${story.id}`]: '' }));
  };

  const handleAddPhone = async (story: RepercussionStory) => {
    const name = newItems[`phone-name-${story.id}`];
    const number = newItems[`phone-number-${story.id}`];
    if (!name?.trim() || !number?.trim()) return toast.error('Nome e número são obrigatórios.');
    await addToArray(story, 'phones', { name, number });
    setNewItems(prev => ({ ...prev, [`phone-name-${story.id}`]: '', [`phone-number-${story.id}`]: '' }));
  };

  const handleAddLink = async (story: RepercussionStory) => {
    const title = newItems[`link-title-${story.id}`];
    const url = newItems[`link-url-${story.id}`];
    if (!title?.trim() || !url?.trim()) return toast.error('Título e URL são obrigatórios.');
    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = 'http://' + formattedUrl;
    await addToArray(story, 'links', { title, url: formattedUrl });
    setNewItems(prev => ({ ...prev, [`link-title-${story.id}`]: '', [`link-url-${story.id}`]: '' }));
  };

  const handleAddLog = async (story: RepercussionStory) => {
    const text = newItems[`log-${story.id}`];
    if (!text?.trim()) return;
    await addToArray(story, 'logs', { 
      text, 
      date: new Date().toISOString(),
      userId: userData?.uid 
    });
    setNewItems(prev => ({ ...prev, [`log-${story.id}`]: '' }));
  };

  const activeStories = stories.filter(s => s.status === 'active');
  const archivedStories = stories.filter(s => s.status === 'archived');

  if (loading) return <div className="p-8 text-center text-ric-muted">Carregando Histórias...</div>;

  return (
    <div className="space-y-[20px]">
      <div className="flex justify-between items-center bg-[#003366] text-white p-5 rounded-xl shadow-lg bg-gradient-to-r from-[#003366] to-[#004A8F]">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-2 rounded-lg">
            <BookOpen size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-wider uppercase">Histórias (Repercussão)</h1>
            <p className="text-blue-100 text-[13px] font-medium opacity-80">Acompanhamento de casos e desdobramentos</p>
          </div>
        </div>
        {!isReporter && (
          <button 
            onClick={() => setIsFormOpen(!isFormOpen)}
            className="bg-white text-[#003366] px-4 py-2 font-bold rounded-lg shadow-sm hover:bg-blue-50 transition-colors uppercase tracking-wider text-[12px] flex items-center gap-2"
          >
            {isFormOpen ? <X size={16} /> : <Plus size={16} />}
            {isFormOpen ? 'Fechar' : 'Nova História'}
          </button>
        )}
      </div>

      {isFormOpen && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-xl border border-ric-border shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-[11px] font-bold text-ric-muted uppercase tracking-wider mb-1">Título do Caso</label>
              <input 
                autoFocus
                type="text" 
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Ex: Caso Joãozinho..."
                className="w-full text-[13px] border border-gray-300 rounded-lg p-2 focus:border-ric-blue focus:ring-1 focus:ring-ric-blue outline-none transition-colors"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-ric-muted uppercase tracking-wider mb-1">Pauteiros Responsáveis</label>
              <div className="border border-gray-300 rounded-lg p-2 max-h-[120px] overflow-y-auto space-y-1">
                {users.filter(u => ['admin', 'pauteiro', 'pauteira', 'editor'].includes(u.role)).map(u => (
                  <label key={u.uid} className="flex items-center gap-2 text-[12px]">
                    <input 
                      type="checkbox" 
                      value={u.uid}
                      checked={newResponsibles.includes(u.uid)}
                      onChange={(e) => {
                        if(e.target.checked) setNewResponsibles([...newResponsibles, u.uid]);
                        else setNewResponsibles(newResponsibles.filter(id => id !== u.uid));
                      }}
                      className="rounded border-gray-300"
                    />
                    {displayNames[u.uid] || u.name || u.email}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-[11px] font-bold text-ric-muted uppercase tracking-wider mb-1">Descrição / Contexto</label>
            <textarea
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Descreva o caso e o que precisa ser acompanhado..."
              className="w-full text-[13px] border border-gray-300 rounded-lg p-2 focus:border-ric-blue focus:ring-1 focus:ring-ric-blue outline-none transition-colors min-h-[80px]"
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="bg-ric-green text-white px-6 py-2 rounded-lg font-black uppercase text-[12px] hover:bg-green-700 transition-colors shadow-sm">
              Criar História
            </button>
          </div>
        </form>
      )}

      {stories.length === 0 ? (
        <div className="bg-white p-8 text-center text-ric-muted border border-dashed border-gray-300 rounded-xl">
          Nenhuma história de repercussão cadastrada.
        </div>
      ) : (
        <div className="space-y-4">
          {activeStories.map(story => (
            <StoryCard 
              key={story.id} 
              story={story} 
              expanded={expandedStory === story.id}
              onToggleExpand={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
              newItems={newItems}
              setNewItems={setNewItems}
              isReporter={isReporter}
              displayNames={displayNames}
              users={users}
              userData={userData}
              onUpdateStatus={() => updateStory(story.id, 'status', 'archived')}
              onDelete={() => handleDelete(story.id)}
              onTogglePendency={(pid, comp) => handleTogglePendency(story, pid, comp)}
              onAddPendency={() => handleAddPendency(story)}
              onAddPhone={() => handleAddPhone(story)}
              onAddLink={() => handleAddLink(story)}
              onAddLog={() => handleAddLog(story)}
              onRemovePendency={(pid) => removeFromArray(story, 'pendencies', pid)}
              onRemovePhone={(pid) => removeFromArray(story, 'phones', pid)}
              onRemoveLink={(pid) => removeFromArray(story, 'links', pid)}
              onRemoveLog={(pid) => removeFromArray(story, 'logs', pid)}
              onUpdateTitle={(newVal: string) => updateStory(story.id, 'title', newVal)}
              onUpdateDesc={(newVal: string) => updateStory(story.id, 'description', newVal)}
              onUpdateResponsibles={(newIds: string[]) => updateStory(story.id, 'responsibleIds', newIds)}
            />
          ))}

          {archivedStories.length > 0 && (
            <div className="pt-8">
              <h3 className="text-ric-muted font-bold text-[13px] uppercase tracking-wider mb-4 px-2">Histórias Arquivadas</h3>
              <div className="space-y-4 opacity-75">
                {archivedStories.map(story => (
                  <StoryCard 
                    key={story.id} 
                    story={story} 
                    expanded={expandedStory === story.id}
                    onToggleExpand={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
                    newItems={newItems}
                    setNewItems={setNewItems}
                    isReporter={isReporter}
                    displayNames={displayNames}
                    users={users}
                    userData={userData}
                    onUpdateStatus={() => updateStory(story.id, 'status', 'active')}
                    onDelete={() => handleDelete(story.id)}
                    onTogglePendency={(pid, comp) => handleTogglePendency(story, pid, comp)}
                    onAddPendency={() => handleAddPendency(story)}
                    onAddPhone={() => handleAddPhone(story)}
                    onAddLink={() => handleAddLink(story)}
                    onAddLog={() => handleAddLog(story)}
                    onRemovePendency={(pid) => removeFromArray(story, 'pendencies', pid)}
                    onRemovePhone={(pid) => removeFromArray(story, 'phones', pid)}
                    onRemoveLink={(pid) => removeFromArray(story, 'links', pid)}
                    onRemoveLog={(pid) => removeFromArray(story, 'logs', pid)}
                    onUpdateTitle={(newVal: string) => updateStory(story.id, 'title', newVal)}
                    onUpdateDesc={(newVal: string) => updateStory(story.id, 'description', newVal)}
                    onUpdateResponsibles={(newIds: string[]) => updateStory(story.id, 'responsibleIds', newIds)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StoryCard({ 
  story, expanded, onToggleExpand, isReporter, displayNames, users, userData,
  onUpdateStatus, onDelete, newItems, setNewItems,
  onTogglePendency, onAddPendency, onRemovePendency,
  onAddPhone, onRemovePhone,
  onAddLink, onRemoveLink,
  onAddLog, onRemoveLog,
  onUpdateTitle, onUpdateDesc, onUpdateResponsibles
}: any) {

  const respNames = (story.responsibleIds || [story.responsibleId]).map((id: string) => displayNames[id] || 'Não atribuído').join(', ');
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(story.title);
  
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState(story.description);

  const [isEditingResp, setIsEditingResp] = useState(false);
  const [editResponsibles, setEditResponsibles] = useState<string[]>(story.responsibleIds || [story.responsibleId]);

  return (
    <div className={`bg-white border rounded-xl shadow-sm transition-all overflow-hidden mb-4 ${expanded ? 'border-ric-blue' : 'border-ric-border hover:shadow-md'}`}>
      <div 
        className="p-4 flex flex-col md:flex-row gap-4 cursor-pointer items-start md:items-center"
        onClick={(e) => {
          // ignore if clicked inside edit inputs
          if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('label')) return;
          onToggleExpand(e);
        }}
      >
        <div className="bg-gray-100 p-3 rounded-lg text-ric-blue shrink-0">
          <BookOpen size={24} />
        </div>
        <div className="flex-1 w-full">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 mb-1 w-full max-w-lg">
              <input 
                type="text" 
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="flex-1 text-[16px] font-black uppercase tracking-tight p-1 border rounded"
                autoFocus
              />
              <button 
                onClick={(e) => { e.stopPropagation(); onUpdateTitle(editTitle); setIsEditingTitle(false); }}
                className="text-white bg-ric-green p-1.5 rounded"
              ><Save size={14}/></button>
              <button 
                onClick={(e) => { e.stopPropagation(); setIsEditingTitle(false); setEditTitle(story.title); }}
                className="text-gray-500 bg-gray-100 p-1.5 rounded"
              ><X size={14}/></button>
            </div>
          ) : (
            <h3 className="text-[16px] font-black uppercase text-ric-text tracking-tight mb-1 group flex items-center gap-2">
              {story.title}
              {!isReporter && (
                <button onClick={(e) => { e.stopPropagation(); setIsEditingTitle(true); setEditTitle(story.title); }} className="text-gray-400 hover:text-ric-blue opacity-0 group-hover:opacity-100 transition-opacity">
                  <Edit size={14} />
                </button>
              )}
            </h3>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium uppercase tracking-wider text-ric-muted mb-2">
            <span className="flex flex-col items-start gap-1 group relative">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-ric-blue"></span>
                {isEditingResp ? 'Editando responsáveis...' : respNames}
                {!isReporter && !isEditingResp && (
                  <button onClick={(e) => { e.stopPropagation(); setIsEditingResp(true); setEditResponsibles(story.responsibleIds || [story.responsibleId]); }} className="text-gray-400 hover:text-ric-blue opacity-0 group-hover:opacity-100 transition-opacity ml-1">
                    <Edit size={12} />
                  </button>
                )}
              </span>
              {isEditingResp && (
                <div className="absolute top-full left-0 z-10 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]" onClick={e => e.stopPropagation()}>
                  <div className="max-h-[150px] overflow-y-auto space-y-2 mb-3">
                    {users.filter((u: any) => ['admin', 'pauteiro', 'pauteira', 'editor'].includes(u.role)).map((u: any) => (
                      <label key={u.uid} className="flex items-center gap-2 text-[12px] cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={editResponsibles.includes(u.uid)}
                          onChange={(e) => {
                            if(e.target.checked) setEditResponsibles([...editResponsibles, u.uid]);
                            else setEditResponsibles(editResponsibles.filter(id => id !== u.uid));
                          }}
                          className="rounded border-gray-300"
                        />
                        {displayNames[u.uid] || u.name || u.email}
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => { onUpdateResponsibles(editResponsibles.length > 0 ? editResponsibles : [userData.uid]); setIsEditingResp(false); }}
                      className="flex-1 bg-ric-green text-white px-2 py-1.5 rounded text-[10px] font-bold uppercase hover:bg-green-700"
                    >Salvar</button>
                    <button 
                      onClick={() => { setIsEditingResp(false); setEditResponsibles(story.responsibleIds || [story.responsibleId]); }}
                      className="flex-1 bg-gray-200 text-gray-700 px-2 py-1.5 rounded text-[10px] font-bold uppercase hover:bg-gray-300"
                    >Cancelar</button>
                  </div>
                </div>
              )}
            </span>
            <span>•</span>
            <span>{story.pendencies?.filter((p:any) => !p.completed).length || 0} Pendências</span>
            <span>•</span>
            <span>{story.logs?.length || 0} Retrancas</span>
          </div>

          {/* Moved Pendencies here to always show before expanding */}
          {(story.pendencies || []).length > 0 && (
            <div className="mt-3 bg-gray-50 p-3 rounded-lg border border-gray-100 space-y-1.5">
               <h4 className="text-[11px] font-bold text-ric-text uppercase tracking-wider mb-2 flex items-center gap-1">
                 <AlertCircle size={14} className="text-amber-500" /> Pendências Principais
               </h4>
               {(story.pendencies || []).map((p: any) => (
                  <div key={p.id} className="flex gap-2 items-start" onClick={e => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      className="mt-0.5"
                      checked={p.completed} 
                      disabled={isReporter}
                      onChange={(e) => onTogglePendency(p.id, e.target.checked)}
                    />
                    <span className={`text-[12px] flex-1 ${p.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{p.text}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
        {!isReporter && (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {story.status === 'active' ? (
              <button onClick={onUpdateStatus} className="text-[10px] uppercase font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 transition-colors">
                Arquivar
              </button>
            ) : (
              <button onClick={onUpdateStatus} className="text-[10px] uppercase font-bold text-ric-green bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg border border-green-200 transition-colors">
                Reativar
              </button>
            )}
            <button onClick={onDelete} className="text-ric-red p-2 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="p-5 border-t border-gray-100 bg-gray-50/50 space-y-6">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
             <div className="flex items-center justify-between mb-2">
               <h4 className="text-[11px] font-bold uppercase tracking-wider text-ric-muted flex items-center gap-2">
                 <FileText size={14} /> Contexto do Caso
               </h4>
               {!isReporter && !isEditingDesc && (
                 <button onClick={(e) => { e.stopPropagation(); setIsEditingDesc(true); setEditDesc(story.description); }} className="text-gray-400 hover:text-ric-blue">
                   <Edit size={14} />
                 </button>
               )}
             </div>
             {isEditingDesc ? (
               <div className="space-y-2">
                 <textarea 
                   className="w-full text-[13px] border p-2 rounded min-h-[80px]"
                   value={editDesc}
                   onChange={e => setEditDesc(e.target.value)}
                   autoFocus
                 />
                 <div className="flex gap-2">
                   <button 
                     onClick={() => { onUpdateDesc(editDesc); setIsEditingDesc(false); }}
                     className="bg-ric-green text-white px-3 py-1.5 rounded text-[11px] font-bold uppercase"
                   >Salvar</button>
                   <button 
                     onClick={() => { setIsEditingDesc(false); setEditDesc(story.description); }}
                     className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-[11px] font-bold uppercase"
                   >Cancelar</button>
                 </div>
               </div>
             ) : (
                <p className="text-[13px] text-gray-700 whitespace-pre-line">{story.description || <span className="italic text-gray-400">Sem contexto.</span>}</p>
             )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pendencies (Edition / Add) */}
            <div className="space-y-3">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-ric-text flex items-center gap-2 border-b border-gray-200 pb-2">
                <AlertCircle size={16} className="text-amber-500" /> 
                Gerenciar Pendências
              </h4>
              <div className="space-y-2">
                {(story.pendencies || []).map((p: any) => (
                  <div key={p.id} className="flex gap-2 items-start bg-white p-2.5 rounded-lg shadow-sm border border-gray-200">
                    <input 
                      type="checkbox" 
                      className="mt-1"
                      checked={p.completed} 
                      disabled={isReporter}
                      onChange={(e) => onTogglePendency(p.id, e.target.checked)}
                    />
                    <span className={`text-[12px] flex-1 ${p.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{p.text}</span>
                    {!isReporter && (
                      <button onClick={() => onRemovePendency(p.id)} className="text-gray-400 hover:text-ric-red"><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              {!isReporter && (
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={newItems[`pendency-${story.id}`] || ''}
                    onChange={e => setNewItems({ ...newItems, [`pendency-${story.id}`]: e.target.value })}
                    placeholder="Nova pendência..."
                    className="flex-1 text-[12px] border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-ric-blue"
                    onKeyDown={e => e.key === 'Enter' && onAddPendency()}
                  />
                  <button onClick={onAddPendency} className="bg-amber-500 text-white px-3 py-2 rounded-lg font-bold text-[12px] hover:bg-amber-600 shadow-sm"><Plus size={16} /></button>
                </div>
              )}
            </div>

            {/* Phones */}
            <div className="space-y-3">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-ric-text flex items-center gap-2 border-b border-gray-200 pb-2">
                <Phone size={16} className="text-ric-green" /> 
                Telefones de Fontes
              </h4>
              <div className="space-y-2">
                {(story.phones || []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg shadow-sm border border-gray-200">
                    <div>
                      <div className="text-[12px] font-bold text-gray-800">{p.name}</div>
                      <div className="text-[11px] text-ric-muted font-mono">{p.number}</div>
                    </div>
                    {!isReporter && (
                      <button onClick={() => onRemovePhone(p.id)} className="text-gray-400 hover:text-ric-red"><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              {!isReporter && (
                <div className="flex gap-1.5">
                  <input 
                    type="text"
                    value={newItems[`phone-name-${story.id}`] || ''}
                    onChange={e => setNewItems({ ...newItems, [`phone-name-${story.id}`]: e.target.value })}
                    placeholder="Nome"
                    className="w-1/2 text-[12px] border border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-ric-blue"
                  />
                  <input 
                    type="text"
                    value={newItems[`phone-number-${story.id}`] || ''}
                    onChange={e => setNewItems({ ...newItems, [`phone-number-${story.id}`]: e.target.value })}
                    placeholder="Telefone"
                    className="flex-1 text-[12px] border border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-ric-blue"
                    onKeyDown={e => e.key === 'Enter' && onAddPhone()}
                  />
                  <button onClick={onAddPhone} className="bg-ric-green text-white px-2 py-1 rounded-lg font-bold hover:bg-green-700 shadow-sm"><Plus size={16} /></button>
                </div>
              )}
            </div>

            {/* Links / Documentos */}
            <div className="space-y-3">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-ric-text flex items-center gap-2 border-b border-gray-200 pb-2">
                <LinkIcon size={16} className="text-indigo-500" /> 
                Links e Documentos
              </h4>
              <div className="space-y-2">
                {(story.links || []).map((l: any) => (
                  <div key={l.id} className="flex items-center justify-between bg-white p-2.5 rounded-lg shadow-sm border border-gray-200">
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-ric-blue hover:underline break-all truncate mr-2 block w-full">
                      {l.title}
                    </a>
                    {!isReporter && (
                      <button onClick={() => onRemoveLink(l.id)} className="text-gray-400 hover:text-ric-red"><X size={14} /></button>
                    )}
                  </div>
                ))}
              </div>
              {!isReporter && (
                <div className="flex gap-1.5 flex-col lg:flex-row">
                  <input 
                    type="text"
                    value={newItems[`link-title-${story.id}`] || ''}
                    onChange={e => setNewItems({ ...newItems, [`link-title-${story.id}`]: e.target.value })}
                    placeholder="Título (ex: BE Notícia)"
                    className="flex-1 text-[12px] border border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-ric-blue"
                  />
                  <div className="flex gap-1.5 flex-1 w-full lg:w-auto">
                    <input 
                      type="url"
                      value={newItems[`link-url-${story.id}`] || ''}
                      onChange={e => setNewItems({ ...newItems, [`link-url-${story.id}`]: e.target.value })}
                      placeholder="URL..."
                      className="flex-1 text-[12px] border border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-ric-blue"
                      onKeyDown={e => e.key === 'Enter' && onAddLink()}
                    />
                    <button onClick={onAddLink} className="bg-indigo-500 text-white px-3 py-2 rounded-lg font-bold hover:bg-indigo-600 shadow-sm"><Plus size={16} /></button>
                  </div>
                </div>
              )}
            </div>

            {/* Logs / Retrancas */}
            <div className="space-y-3">
              <h4 className="text-[12px] font-black uppercase tracking-wider text-ric-text flex items-center gap-2 border-b border-gray-200 pb-2">
                <History size={16} className="text-gray-600" /> 
                Histórico (Retrancas / Avanços)
              </h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {(story.logs || []).map((l: any) => (
                  <div key={l.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 relative group">
                    <div className="text-[10px] font-bold text-ric-muted uppercase mb-1 flex justify-between">
                      <span>{new Date(l.date).toLocaleDateString()}</span>
                      <span>{displayNames[l.userId] || 'Sistema'}</span>
                    </div>
                    <div className="text-[12px] text-gray-800 whitespace-pre-wrap">{l.text}</div>
                    {!isReporter && (
                      <button onClick={() => onRemoveLog(l.id)} className="absolute top-2 right-2 text-gray-300 hover:text-ric-red opacity-0 group-hover:opacity-100 transition-opacity"><X size={14} /></button>
                    )}
                  </div>
                ))}
                {(story.logs || []).length === 0 && (
                  <div className="text-[11px] text-gray-400 italic">Nenhum avanço registrado.</div>
                )}
              </div>
              {!isReporter && (
                <div className="flex gap-2">
                  <textarea
                    value={newItems[`log-${story.id}`] || ''}
                    onChange={e => setNewItems({ ...newItems, [`log-${story.id}`]: e.target.value })}
                    placeholder="Descreva a retranca de hoje..."
                    className="flex-1 text-[12px] border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-ric-blue min-h-[60px]"
                  />
                  <button onClick={onAddLog} className="bg-gray-800 text-white px-3 h-full rounded-lg font-bold hover:bg-gray-900 shadow-sm flex items-center justify-center self-stretch">Salvar</button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
