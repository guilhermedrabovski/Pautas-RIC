import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, setDoc as setFirestoreDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, secondaryAuth } from '../lib/firebase';
import { UserData, useAuth } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import { createUserWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Trash2, Plus, Save, UserPlus, Users as UsersIcon, Lock, ShieldCheck, Bell, Send, ArrowUp, ArrowDown, Edit3, CheckSquare, GraduationCap, RotateCcw, AlignLeft, Hash, Check } from 'lucide-react';
import { confirmAction } from '../lib/confirmHelper';
import { sendPushNotification } from '../lib/notifications';
import { requestNotificationPermission } from '../components/NotificationHandler';
import { InternRoutineItem, RoutineResponseType, DEFAULT_INTERN_ROUTINE_ITEMS } from '../types/internRoutine';

export default function Settings() {
  const { userData } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  
  // New User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'reporter' | 'pauteiro' | 'pauteira' | 'editor' | 'admin' | 'cinegrafista' | 'estagiario'>('reporter');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Intern Routine Configuration State
  const [internRoutineItems, setInternRoutineItems] = useState<InternRoutineItem[]>([]);
  const [isSavingRoutine, setIsSavingRoutine] = useState(false);
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [routineFormTitle, setRoutineFormTitle] = useState('');
  const [routineFormDesc, setRoutineFormDesc] = useState('');
  const [routineFormType, setRoutineFormType] = useState<RoutineResponseType>('text');
  const [routineFormPlaceholder, setRoutineFormPlaceholder] = useState('');

  // Security State
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    fetchUsers();

    // Fetch Intern Routine Checklist Template
    getDoc(doc(db, 'settings', 'internRoutineTemplate')).then(snap => {
      if (snap.exists() && snap.data().items && snap.data().items.length > 0) {
        setInternRoutineItems(snap.data().items);
      } else {
        setInternRoutineItems(DEFAULT_INTERN_ROUTINE_ITEMS);
        setDoc(doc(db, 'settings', 'internRoutineTemplate'), {
          items: DEFAULT_INTERN_ROUTINE_ITEMS,
          updatedAt: Date.now()
        }, { merge: true });
      }
    }).catch(err => {
      console.warn("Could not load intern routine template, using defaults:", err);
      setInternRoutineItems(DEFAULT_INTERN_ROUTINE_ITEMS);
    });
  }, []);

  const fetchUsers = () => {
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
    });
  };

  const reporters = users.filter(u => u.role === 'reporter');
  const cinegrafistas = users.filter(u => u.role === 'cinegrafista');
  const estagiarios = users.filter(u => u.role === 'estagiario');
  const displayNames = getDisplayNames(users);

  // --- Handlers for Intern Routine Checklist Configuration ---
  const handleSaveRoutineConfig = async (customItems?: InternRoutineItem[]) => {
    const listToSave = customItems || internRoutineItems;
    setIsSavingRoutine(true);
    try {
      await setDoc(doc(db, 'settings', 'internRoutineTemplate'), {
        items: listToSave,
        updatedAt: Date.now(),
        updatedBy: userData?.name || userData?.email || 'admin'
      });
      // Also mirror to checklistTemplates/intern_routine_default for easy access
      await setDoc(doc(db, 'checklistTemplates', 'intern_routine_default'), {
        items: listToSave,
        updatedAt: Date.now()
      }, { merge: true });
      toast.success('Configuração da Rotina do Estagiário salva com sucesso!');
    } catch (err: any) {
      toast.error('Erro ao salvar rotina: ' + err.message);
    } finally {
      setIsSavingRoutine(false);
    }
  };

  const handleOpenAddRoutineItem = () => {
    setEditingRoutineId(null);
    setRoutineFormTitle('');
    setRoutineFormDesc('');
    setRoutineFormType('text');
    setRoutineFormPlaceholder('');
    setIsRoutineModalOpen(true);
  };

  const handleOpenEditRoutineItem = (item: InternRoutineItem) => {
    setEditingRoutineId(item.id);
    setRoutineFormTitle(item.title);
    setRoutineFormDesc(item.description || '');
    setRoutineFormType(item.responseType);
    setRoutineFormPlaceholder(item.responsePlaceholder || '');
    setIsRoutineModalOpen(true);
  };

  const handleSaveRoutineModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineFormTitle.trim()) {
      return toast.error('O título do item de rotina é obrigatório!');
    }

    let updated: InternRoutineItem[];
    if (editingRoutineId) {
      updated = internRoutineItems.map(item => {
        if (item.id === editingRoutineId) {
          return {
            ...item,
            title: routineFormTitle.trim(),
            description: routineFormDesc.trim() || undefined,
            responseType: routineFormType,
            responsePlaceholder: routineFormPlaceholder.trim() || undefined
          };
        }
        return item;
      });
    } else {
      const newItem: InternRoutineItem = {
        id: `routine_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: routineFormTitle.trim(),
        description: routineFormDesc.trim() || undefined,
        responseType: routineFormType,
        responsePlaceholder: routineFormPlaceholder.trim() || undefined
      };
      updated = [...internRoutineItems, newItem];
    }

    setInternRoutineItems(updated);
    setIsRoutineModalOpen(false);
    await handleSaveRoutineConfig(updated);
  };

  const handleRemoveRoutineItem = (id: string) => {
    const item = internRoutineItems.find(i => i.id === id);
    confirmAction(`Deseja remover o item "${item?.title || 'este item'}" da rotina dos estagiários?`, async () => {
      const updated = internRoutineItems.filter(i => i.id !== id);
      setInternRoutineItems(updated);
      await handleSaveRoutineConfig(updated);
    });
  };

  const handleMoveRoutineItem = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === internRoutineItems.length - 1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newItems = [...internRoutineItems];
    const [moved] = newItems.splice(index, 1);
    newItems.splice(targetIndex, 0, moved);
    
    setInternRoutineItems(newItems);
    await handleSaveRoutineConfig(newItems);
  };

  const handleResetRoutineDefaults = () => {
    confirmAction('Deseja restaurar os itens padrões recomendados para a rotina do estagiário?', async () => {
      setInternRoutineItems(DEFAULT_INTERN_ROUTINE_ITEMS);
      await handleSaveRoutineConfig(DEFAULT_INTERN_ROUTINE_ITEMS);
    });
  };

  const handleToggleStatus = async (user: UserData) => {
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        isActive: user.isActive === false ? true : false
      });
      toast.success('Status do usuário atualizado.');
      fetchUsers();
    } catch (error: any) {
      toast.error('Erro ao atualizar status: ' + error.message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserUsername.trim() || !newUserPassword) {
      return toast.error('Preencha os dados do usuário!');
    }

    if (userData?.role !== 'admin') {
      return toast.error('Apenas administradores podem criar usuários.');
    }

    setIsCreatingUser(true);
    let finalUsername = newUserUsername.trim().toLowerCase();
    if (finalUsername.includes('@')) {
      finalUsername = finalUsername.split('@')[0];
    }
    const email = `${finalUsername}@ric.com.br`;

    const existingLogin = users.find(u => u.email === email);
    if (existingLogin) {
      return toast.error('Este login já está em uso por outro usuário.');
    }
    
    const existingName = users.find(u => u.name.trim().toLowerCase() === newUserName.trim().toLowerCase());
    if (existingName) {
      return toast.error('Já existe um colaborador com este nome exato.');
    }

    try {
      // Create user in secondary auth so it doesn't log the current admin out
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, newUserPassword);
      
      // Save data as normal in firestore since we have rule allow create: if isAdmin()
      await setFirestoreDoc(doc(db, 'users', cred.user.uid), {
        name: newUserName.trim(),
        email: email,
        role: newUserRole,
        isActive: true,
        createdAt: Date.now()
      });

      // Sign out the secondary instance to clean it up
      await signOut(secondaryAuth);
      
      toast.success('Usuário criado com sucesso!');
      setNewUserName('');
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserRole('reporter');
      fetchUsers(); // Refresh the users list
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsCreatingUser(true);
      // Small timeout to allow the browser to process the creation before resetting state
      setTimeout(() => setIsCreatingUser(false), 100);
    }
  };

  const handleDeleteUser = async (userToDelete: UserData) => {
    if (userToDelete.uid === userData?.uid) return toast.error('Você não pode excluir seu próprio perfil aqui.');
    
    confirmAction(`Deseja realmente excluir o acesso de ${userToDelete.name}? O registro será removido do sistema.`, async () => {
      try {
        await deleteDoc(doc(db, 'users', userToDelete.uid));
        toast.success('Usuário removido do sistema.');
        fetchUsers();
      } catch (error: any) {
        console.error("Delete user error:", error);
        toast.error('Erro ao remover usuário: ' + (error.message || 'Sem permissão'));
      }
    });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmNewPassword) {
      return toast.error('As senhas não coincidem!');
    }
    if (newPassword.length < 6) {
      return toast.error('A senha deve ter no mínimo 6 caracteres.');
    }

    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (!currentUser) return toast.error('Não autenticado');

    setIsUpdatingPassword(true);
    try {
      await updatePassword(currentUser, newPassword);
      toast.success('Senha alterada com sucesso!');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
        toast.error('Por favor, saia e entre novamente para alterar sua senha (razões de segurança).');
      } else {
        toast.error('Erro ao alterar senha: ' + error.message);
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleTestNotification = async () => {
    if (!userData) return;
    const toastId = toast.loading('Enviando teste...');
    const result = await sendPushNotification(userData, '🔔 Teste de Notificação', 'Isso é um teste do sistema RIC!');
    if (result.success) {
      toast.success('Teste enviado com sucesso!', { id: toastId });
    } else {
      const errMsg = result.error || 'Erro desconhecido. Verifique se as notificações estão autorizadas no seu navegador.';
      toast.error(`Erro ao enviar: ${errMsg}`, { id: toastId, duration: 8000 });
    }
  };

  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle || !broadcastBody) return toast.error('Preencha título e mensagem');
    
    confirmAction(`Deseja enviar essa notificação para TODOS os usuários com push ativado?`, async () => {
      setIsBroadcasting(true);
      const toastId = toast.loading('Enviando para todos os usuários com notificação ativa...');
      let successCount = 0;
      let totalCount = 0;
      let lastError = '';

      for (const u of users) {
        if (u.fcmTokens && u.fcmTokens.length > 0) {
          totalCount++;
          const res = await sendPushNotification(u, broadcastTitle, broadcastBody);
          if (res.success) {
            successCount++;
          } else {
            lastError = res.error || 'Erro ou token inválido';
          }
        }
      }

      if (totalCount === 0) {
        toast.error('Nenhum usuário possui notificações ativadas no navegador.', { id: toastId });
      } else if (successCount === 0 && totalCount > 0) {
        toast.error(`Falha no envio: 0 de ${totalCount} usuários receberam. Detalhes: ${lastError}`, { id: toastId, duration: 8000 });
      } else {
        toast.success(`Broadcast concluído! Sucesso em ${successCount} de ${totalCount} usuários.`, { id: toastId, duration: 6000 });
      }
      setIsBroadcasting(false);
      setBroadcastTitle('');
      setBroadcastBody('');
    });
  };

  return (
    <div className="space-y-[30px]">
      {/* Security Section */}
      <div className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-[20px] border border-ric-border border-t-[4px] border-t-ric-blue">
        <h2 className="text-[18px] font-bold text-ric-text mb-1 uppercase tracking-wider flex items-center">
          <ShieldCheck size={20} className="mr-2 text-ric-blue" /> Sua Segurança
        </h2>
        <p className="text-[13px] text-ric-muted mb-6">Mantenha seus dados de acesso atualizados</p>

        <div className="bg-white border border-ric-border rounded-[8px] p-5 shadow-sm">
           <h3 className="text-[14px] font-bold text-ric-text uppercase flex items-center mb-4 text-ric-text">
             <Lock size={16} className="mr-2 text-ric-red" /> Alterar Sua Senha
           </h3>
           <form onSubmit={handleChangePassword} className="flex flex-wrap gap-4 items-end">
              <div className="w-full md:w-auto md:min-w-[200px]">
                <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase text-ric-muted">Nova Senha</label>
                <input 
                  type="password" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-[#F8F9FA] text-[13px] focus:ring-ric-red focus:border-ric-red h-[38px]"
                  placeholder="Mín. 6 caracteres"
                  required
                />
              </div>
              <div className="w-full md:w-auto md:min-w-[200px]">
                <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase text-ric-muted">Confirmar Nova Senha</label>
                <input 
                  type="password" 
                  value={confirmNewPassword} 
                  onChange={e => setConfirmNewPassword(e.target.value)} 
                  className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-[#F8F9FA] text-[13px] focus:ring-ric-red focus:border-ric-red h-[38px]"
                  required
                />
              </div>
              <button 
                type="submit" 
                disabled={isUpdatingPassword}
                className="bg-ric-text text-white px-4 py-2 rounded-[4px] text-[12px] font-bold uppercase transition-colors hover:bg-black disabled:opacity-50 h-[38px] cursor-pointer"
              >
                {isUpdatingPassword ? 'Salvando...' : 'Atualizar Senha'}
              </button>
           </form>
        </div>

        <div className="mt-8 bg-[#F8F9FA] rounded-xl p-5 border border-gray-100">
          <h3 className="text-[14px] font-bold text-ric-text uppercase flex items-center mb-1">
            <Bell size={16} className="mr-2 text-ric-blue" /> Notificações Push
          </h3>
          <p className="text-[12px] text-ric-muted mb-4 leading-relaxed">
            Habilite para receber avisos de escalas e lembretes diretamente no seu dispositivo.
          </p>

          {/* Iframe or Static Deployment warning banner */}
          {(window.self !== window.top || window.location.hostname.includes("ais-pre") || window.location.hostname.includes("run.app")) && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-[12px] text-amber-800 leading-relaxed">
              <p className="font-bold flex items-center mb-1">
                ⚠️ {window.location.hostname.includes("ais-pre") ? 'Visualização Compartilhada (Static)' : 'Aviso do Navegador (Janela Incorporada)'}
              </p>
              <p>
                {window.location.hostname.includes("ais-pre") ? (
                  <span>Esta é a visualização estática do app (Shared App). Nela, rotas de API personalizadas não processam código no servidor. Para testar o envio de notificações com servidor real, utilize o link de <strong>Desenvolvimento do aplicativo (URL de Dev)</strong>!</span>
                ) : (
                  <span>O navegador bloqueia cookies de segurança e conexões de API locais dentro da janela incorporada (iframe). Para que as notificações e os testes funcionem perfeitamente, por favor clique no botão <strong>"Abrir em nova aba"</strong> (Open in new window) no cabeçalho superior direito do AI Studio!</span>
                )}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-100">
            <div>
              <span className="text-[11px] font-bold text-ric-muted uppercase block">Status Atual</span>
              <span className={`text-[13px] font-black uppercase ${userData?.fcmTokens?.length ? 'text-green-600' : 'text-amber-600'}`}>
                {userData?.fcmTokens?.length ? '🔔 Ativado neste perfil' : '🔕 Desativado ou Bloqueado'}
              </span>
            </div>
            {userData?.fcmTokens?.length ? (
              <button 
                onClick={handleTestNotification}
                className="bg-ric-green text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-opacity-90 transition-all cursor-pointer flex items-center"
              >
                <Send size={12} className="mr-1" /> Testar agora
              </button>
            ) : (
              <button 
                onClick={() => requestNotificationPermission(userData)}
                className="bg-ric-blue text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-opacity-90 transition-all cursor-pointer"
              >
                Ativar Notificações
              </button>
            )}
          </div>
          
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-[10px] text-ric-muted flex items-start italic bg-blue-50/50 p-2 rounded-lg">
              <span className="mr-2">💡</span>
              <span><strong>No iPhone:</strong> Você deve primeiro clicar em "Compartilhar" (quadrado com seta) no Safari e selecionar <strong>"Adicionar à Tela de Início"</strong>. Só então o sistema da Apple libera o uso de notificações.</span>
            </p>
          </div>
        </div>

        {userData?.role === 'admin' && (
          <div className="mt-8 bg-white rounded-xl p-5 border border-ric-border shadow-sm">
            <h3 className="text-[14px] font-bold text-ric-text uppercase flex items-center mb-1">
              <Bell size={16} className="mr-2 text-ric-red" /> Central de Alerta (Broadcast)
            </h3>
            <p className="text-[12px] text-ric-muted mb-4">Envie uma mensagem instantânea para todos os colaboradores no celular.</p>
            
            <form onSubmit={handleBroadcast} className="space-y-3">
              <input 
                type="text" 
                placeholder="Título do Alerta (Ex: Plantão Urgente)"
                value={broadcastTitle}
                onChange={e => setBroadcastTitle(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-gray-200 rounded-lg p-2 text-[13px] font-bold outline-none focus:ring-1 focus:ring-ric-red"
              />
              <textarea 
                placeholder="Mensagem detalhada..."
                value={broadcastBody}
                onChange={e => setBroadcastBody(e.target.value)}
                className="w-full bg-[#F8F9FA] border border-gray-200 rounded-lg p-2 text-[13px] min-h-[60px] outline-none focus:ring-1 focus:ring-ric-red"
              />
              <button 
                type="submit"
                disabled={isBroadcasting}
                className="bg-ric-red text-white w-full py-2 rounded-lg text-[12px] font-black uppercase hover:bg-opacity-90 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isBroadcasting ? 'Enviando...' : 'Disparar Notificação para Todos'}
              </button>
            </form>
          </div>
        )}
      </div>

      {userData?.role === 'admin' && (
        <div className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-[20px] border border-ric-border border-t-[4px] border-t-[#4B5563]">
          <h2 className="text-[18px] font-bold text-ric-text mb-1 uppercase tracking-wider">Configurações Gerais</h2>
          <p className="text-[13px] text-ric-muted mb-6">Ajuste os valores padrões da aplicação</p>
  
          {/* Configuração da Rotina do Estagiário (Checklist) */}
          <div id="rotina-estagiario" className="border border-ric-border rounded-[8px] overflow-hidden bg-white shadow-sm">
            <div className="bg-[#F8F9FA] px-[20px] py-[15px] border-b border-ric-border flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="text-[14px] font-bold text-ric-text uppercase flex items-center gap-2">
                  <GraduationCap size={18} className="text-emerald-600" />
                  Rotina do Estagiário (Checklist Padrão)
                </h3>
                <p className="text-[12px] text-ric-muted mt-0.5">
                  Adicione, edite ou subtraia os itens que os estagiários devem cumprir e responder na rotina da redação.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetRoutineDefaults}
                  className="bg-white text-ric-muted border border-gray-300 hover:text-ric-text px-3 py-1.5 rounded-[4px] font-bold shadow-sm flex items-center text-[11px] uppercase transition-colors cursor-pointer"
                  title="Restaurar padrão sugerido"
                >
                  <RotateCcw size={13} className="mr-1.5" /> Padrão Sugerido
                </button>
                <button
                  type="button"
                  disabled={isSavingRoutine}
                  onClick={() => handleSaveRoutineConfig()}
                  className="bg-ric-green text-white px-4 py-1.5 rounded-[4px] font-bold shadow-sm flex items-center hover:bg-[#2E8B1A] text-[12px] uppercase transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Save size={14} className="mr-1.5" /> {isSavingRoutine ? 'Salvando...' : 'Salvar Rotina'}
                </button>
              </div>
            </div>

            <div className="p-[20px] space-y-3">
              {internRoutineItems.length === 0 ? (
                <div className="text-center py-8 text-ric-muted text-[13px] bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <GraduationCap size={32} className="mx-auto mb-2 text-gray-400 opacity-60" />
                  <p className="font-bold">Nenhum item cadastrado na rotina do estagiário.</p>
                  <p className="text-xs text-gray-500 mt-1">Clique abaixo para adicionar itens ou restaure o modelo recomendado.</p>
                </div>
              ) : (
                internRoutineItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-[#F8F9FA] rounded-lg border border-gray-200 hover:border-gray-300 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center shrink-0 mt-0.5">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[14px] text-ric-text">{item.title}</span>
                          {item.responseType === 'text' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                              <AlignLeft size={11} /> Espaço de Texto (o que achou)
                            </span>
                          )}
                          {item.responseType === 'number' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                              <Hash size={11} /> Numérico (potenciais pautas)
                            </span>
                          )}
                          {item.responseType === 'none' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              <CheckSquare size={11} /> Apenas Confirmação
                            </span>
                          )}
                        </div>

                        {item.description && (
                          <p className="text-[12px] text-ric-muted mt-0.5 leading-snug">{item.description}</p>
                        )}

                        {item.responsePlaceholder && (
                          <p className="text-[11px] text-gray-500 italic mt-1 bg-white px-2 py-1 rounded border border-gray-100 inline-block">
                            Prompt/Placeholder: "{item.responsePlaceholder}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveRoutineItem(idx, 'up')}
                        className="p-1.5 text-gray-500 hover:text-ric-blue bg-white border border-gray-200 rounded disabled:opacity-30 cursor-pointer"
                        title="Mover para cima"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === internRoutineItems.length - 1}
                        onClick={() => handleMoveRoutineItem(idx, 'down')}
                        className="p-1.5 text-gray-500 hover:text-ric-blue bg-white border border-gray-200 rounded disabled:opacity-30 cursor-pointer"
                        title="Mover para baixo"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditRoutineItem(item)}
                        className="p-1.5 text-gray-600 hover:text-ric-blue bg-white border border-gray-200 rounded cursor-pointer"
                        title="Editar item"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRoutineItem(item.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 bg-white border border-gray-200 rounded cursor-pointer"
                        title="Remover item da rotina"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleOpenAddRoutineItem}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black uppercase px-4 py-2 rounded shadow-sm flex items-center transition-colors cursor-pointer"
                >
                  <Plus size={15} className="mr-1.5" /> Adicionar Novo Item à Rotina
                </button>
                <span className="text-xs text-ric-muted">
                  Total configurado: <strong>{internRoutineItems.length} itens</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {userData?.role === 'admin' && (
        <div className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-[20px] border border-ric-border border-t-[4px] border-t-ric-blue mt-[15px]">
          <h2 className="text-[18px] font-bold text-ric-text mb-1 uppercase tracking-wider flex items-center">
            <UsersIcon size={20} className="mr-2" /> Gerenciar Usuários
          </h2>
          <p className="text-[13px] text-ric-muted mb-6">Adicione novos colaboradores ao sistema</p>
          
          <div className="border border-ric-border rounded-[8px] overflow-hidden mb-6">
            <div className="bg-[#F8F9FA] px-[20px] py-[15px] border-b border-ric-border flex justify-between items-center">
              <h3 className="text-[14px] font-bold text-ric-text uppercase flex items-center">
                <UserPlus size={16} className="mr-2 text-ric-blue" /> Novo Usuário
              </h3>
            </div>
            <div className="p-[20px] bg-white">
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-5 gap-[15px] items-end">
                <div className="md:col-span-1">
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Nome Completo</label>
                  <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-[#F8F9FA] text-[13px] focus:ring-ric-blue focus:border-ric-blue" placeholder="Ex: Roberto Silva" required />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Usuário (Login)</label>
                  <input type="text" value={newUserUsername} onChange={e => setNewUserUsername(e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-[#F8F9FA] text-[13px] focus:ring-ric-blue focus:border-ric-blue" placeholder="Ex: roberto" required />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Senha Inicial</label>
                  <input type="text" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-[#F8F9FA] text-[13px] focus:ring-ric-blue focus:border-ric-blue" placeholder="Mínimo 6 caracteres" required minLength={6} />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Cargo</label>
                  <select value={newUserRole} onChange={e => setNewUserRole(e.target.value as any)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-[#F8F9FA] text-[13px] focus:ring-ric-blue focus:border-ric-blue">
                    <option value="reporter">Repórter</option>
                    <option value="cinegrafista">Cinegrafista</option>
                    <option value="pauteiro">Pauteiro</option>
                    <option value="pauteira">Pauteira</option>
                    <option value="editor">Editor</option>
                    <option value="estagiario">Estagiário(a)</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="md:col-span-1">
                  <button type="submit" disabled={isCreatingUser} className="w-full bg-ric-blue text-white rounded-[4px] p-2 text-[13px] font-bold hover:bg-[#002244] uppercase cursor-pointer flex justify-center items-center h-[38px] disabled:opacity-50">
                    {isCreatingUser ? 'Criando...' : 'Cadastrar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          
          <h3 className="text-[14px] font-bold text-ric-text uppercase mb-[10px]">
            Usuários Cadastrados ({users.length})
            {estagiarios.length > 0 && (
              <span className="ml-2 text-xs font-normal normal-case text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                {estagiarios.length} {estagiarios.length === 1 ? 'estagiário(a)' : 'estagiários(as)'}
              </span>
            )}
          </h3>
          <div className="border border-ric-border rounded-[8px] overflow-hidden">
             <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-[#F8F9FA]">
                <tr>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider">Nome do Cadastro</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider">Exibição Curta</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider">Login</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider">Cargo</th>
                  <th scope="col" className="px-5 py-3 text-left text-[11px] font-bold text-ric-muted uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-5 py-3 text-right text-[11px] font-bold text-ric-muted uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(u => (
                  <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text font-bold">{u.name}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-blue font-black uppercase text-[11px]">{displayNames[u.uid] || u.name}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-muted">{u.email.replace('@ric.com.br', '')}</td>
                    <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text uppercase font-bold text-[11px]">
                      <span className={`px-2 py-0.5 rounded-full ${
                        u.role === 'admin' ? 'bg-ric-text text-white font-black' :
                        u.role === 'estagiario' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-black' :
                        u.role === 'editor' ? 'bg-purple-100 text-purple-700 font-bold' :
                        u.role === 'pauteiro' || u.role === 'pauteira' ? 'bg-amber-100 text-amber-800 font-bold' :
                        'bg-blue-100 text-blue-700 font-bold'
                      }`}>
                        {u.role === 'estagiario' ? 'Estagiário(a)' : u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-[13px] text-ric-text uppercase font-bold text-[11px]">
                      <button 
                         onClick={() => handleToggleStatus(u)}
                         className={`px-2 py-1 rounded-full cursor-pointer border transition-colors ${u.isActive !== false ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                      >
                         {u.isActive !== false ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-right">
                       <button onClick={() => handleDeleteUser(u)} className="text-ric-muted hover:text-red-600 transition-colors" title="Excluir Login">
                         <Trash2 size={16} />
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Adicionar / Editar Item de Rotina */}
      {isRoutineModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 px-5 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-[16px] uppercase tracking-wider flex items-center gap-2">
                <GraduationCap size={20} />
                {editingRoutineId ? 'Editar Item da Rotina' : 'Novo Item da Rotina do Estagiário'}
              </h3>
              <button
                type="button"
                onClick={() => setIsRoutineModalOpen(false)}
                className="text-white/80 hover:text-white text-xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveRoutineModal} className="p-6 space-y-4">
              <div>
                <label className="block text-[12px] font-black text-ric-text uppercase mb-1">
                  Título da Ação / Tarefa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={routineFormTitle}
                  onChange={e => setRoutineFormTitle(e.target.value)}
                  placeholder="Ex: Checar páginas, Checar WhatsApp, Apagar mensagens..."
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-lg p-2.5 text-[13px] font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[12px] font-black text-ric-text uppercase mb-1">
                  Orientação / Descrição para o Estagiário (Opcional)
                </label>
                <textarea
                  value={routineFormDesc}
                  onChange={e => setRoutineFormDesc(e.target.value)}
                  placeholder="Ex: Entrar nos portais e redes locais para achar pautas..."
                  rows={2}
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-lg p-2.5 text-[13px] outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[12px] font-black text-ric-text uppercase mb-1">
                  Tipo de Resposta / Campo para o Estagiário
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                    routineFormType === 'text' ? 'border-emerald-500 bg-emerald-50/60 font-bold text-emerald-900' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}>
                    <div className="flex items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        name="routineType"
                        value="text"
                        checked={routineFormType === 'text'}
                        onChange={() => setRoutineFormType('text')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Texto Livre</span>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-1 font-normal">"Espaço para colocar o que achou"</span>
                  </label>

                  <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                    routineFormType === 'number' ? 'border-emerald-500 bg-emerald-50/60 font-bold text-emerald-900' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}>
                    <div className="flex items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        name="routineType"
                        value="number"
                        checked={routineFormType === 'number'}
                        onChange={() => setRoutineFormType('number')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Número</span>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-1 font-normal">"Quantas potenciais pautas"</span>
                  </label>

                  <label className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                    routineFormType === 'none' ? 'border-emerald-500 bg-emerald-50/60 font-bold text-emerald-900' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}>
                    <div className="flex items-center gap-1.5 text-xs">
                      <input
                        type="radio"
                        name="routineType"
                        value="none"
                        checked={routineFormType === 'none'}
                        onChange={() => setRoutineFormType('none')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Apenas Checkbox</span>
                    </div>
                    <span className="text-[11px] text-gray-500 mt-1 font-normal">"Apagar mensagens celular"</span>
                  </label>
                </div>
              </div>

              {routineFormType !== 'none' && (
                <div>
                  <label className="block text-[12px] font-black text-ric-text uppercase mb-1">
                    Texto do Placeholder / Instrução do Campo
                  </label>
                  <input
                    type="text"
                    value={routineFormPlaceholder}
                    onChange={e => setRoutineFormPlaceholder(e.target.value)}
                    placeholder={
                      routineFormType === 'number'
                        ? 'Ex: Quantas potenciais pautas encontradas?'
                        : 'Ex: Espaço para colocar o que achou de mais relevante nas páginas...'
                    }
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-lg p-2.5 text-[13px] outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsRoutineModalOpen(false)}
                  className="px-4 py-2 rounded text-[12px] font-bold uppercase text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded text-[12px] font-black uppercase transition-colors shadow-sm cursor-pointer flex items-center gap-1"
                >
                  <Check size={14} /> Salvar Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
