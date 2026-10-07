import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, setDoc as setFirestoreDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, secondaryAuth } from '../lib/firebase';
import { UserData, useAuth } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import { createUserWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import toast from 'react-hot-toast';
import { Trash2, Plus, Save, UserPlus, Users as UsersIcon, Lock, ShieldCheck, Bell, Send } from 'lucide-react';
import { confirmAction } from '../lib/confirmHelper';
import { sendPushNotification } from '../lib/notifications';
import { requestNotificationPermission } from '../components/NotificationHandler';

export default function Settings() {
  const { userData } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  
  const [lineupTimes, setLineupTimes] = useState<any[]>([]);

  // New User Form State
  const [newUserName, setNewUserName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'reporter' | 'pauteiro' | 'pauteira' | 'editor' | 'admin' | 'cinegrafista'>('reporter');
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Security State
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const EQUIPMENT_OPTIONS = ['Mochilink', 'Kit celular', 'Drone', 'Lapela', 'Estabilizador', 'Carro descaracterizado'];
  const NEWSCAST_OPTIONS = ['RN', 'RNM', 'BG', 'CA', 'Factual'];

  useEffect(() => {
    fetchUsers();
    
    getDoc(doc(db, 'settings', 'defaultScale')).then(snap => {
      if (snap.exists() && snap.data().items) {
        setItems(snap.data().items);
      } else {
        setItems([
          { id: '1', shift: 'Manhã', time: '07:00 - 16:00', reporterId: '', cinegrafistaId: '' },
          { id: '2', shift: 'Tarde', time: '13:00 - 22:00', reporterId: '', cinegrafistaId: '' },
          { id: '3', shift: 'Noite', time: '16:00 - 01:00', reporterId: '', cinegrafistaId: '' },
        ]);
      }
    });

    getDoc(doc(db, 'settings', 'defaultLineup')).then(snap => {
      if (snap.exists() && snap.data().times) {
        const rawTimes = snap.data().times;
        const unique = Array.from(new Set(rawTimes.map((t: any) => t.time)));
        const final = unique.map((time, i) => ({ id: i.toString(), time: time as string })).sort((a,b) => a.time.localeCompare(b.time));
        setLineupTimes(final);
      } else {
        setLineupTimes([
          { id: '1', time: '11:30' },
          { id: '2', time: '12:00' },
          { id: '3', time: '12:20' },
        ]);
      }
    });
  }, []);

  const fetchUsers = () => {
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
    });
  };

  const reporters = users.filter(u => u.role === 'reporter');
  const cinegrafistas = users.filter(u => u.role === 'cinegrafista');
  const displayNames = getDisplayNames(users);

  const handleAddItem = () => {
    setItems([...items, { id: Date.now().toString(), shift: 'Manhã', time: '', reporterId: '', cinegrafistaId: '', equipments: [], newscasts: [], observation: '' }]);
  };

  const handleUpdateItem = (id: string, field: string, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'settings', 'defaultScale'), { items, updatedAt: Date.now() });
      await setDoc(doc(db, 'settings', 'defaultLineup'), { times: lineupTimes, updatedAt: Date.now() });
      toast.success('Configurações salvas!');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAddLineupTime = () => setLineupTimes([...lineupTimes, { id: Date.now().toString(), time: '' }]);
  const handleUpdateLineupTime = (id: string, time: string) => setLineupTimes(lineupTimes.map(t => t.id === id ? { ...t, time } : t));
  const handleRemoveLineupTime = (id: string) => setLineupTimes(lineupTimes.filter(t => t.id !== id));

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

      <datalist id="shift-options">
        <option value="Manhã" />
        <option value="Tarde" />
        <option value="Noite" />
        <option value="Madrugada" />
        <option value="Plantão" />
      </datalist>

      <datalist id="reporter-options">
        {reporters.map(r => <option key={r.uid} value={displayNames[r.uid] || r.name} />)}
      </datalist>

      <datalist id="cinegrafista-options">
        {cinegrafistas.map(r => <option key={r.uid} value={displayNames[r.uid] || r.name} />)}
      </datalist>

      {userData?.role === 'admin' && (
        <div className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-[20px] border border-ric-border border-t-[4px] border-t-[#4B5563]">
          <h2 className="text-[18px] font-bold text-ric-text mb-1 uppercase tracking-wider">Configurações Gerais</h2>
          <p className="text-[13px] text-ric-muted mb-6">Ajuste os valores padrões da aplicação</p>
          
          <div className="border border-ric-border rounded-[8px] overflow-hidden">
            <div className="bg-[#F8F9FA] px-[20px] py-[15px] border-b border-ric-border flex justify-between items-center">
              <h3 className="text-[14px] font-bold text-ric-text uppercase">Escala Padrão</h3>
              <button onClick={handleSave} className="bg-ric-green text-white px-[15px] py-[6px] rounded-[4px] font-bold shadow-sm flex items-center hover:bg-[#2E8B1A] text-[12px] uppercase transition-colors cursor-pointer">
                <Save size={14} className="mr-2" /> Salvar Padrão
              </button>
            </div>
            <div className="p-[20px] space-y-[15px]">
              {items.map((item, index) => (
                <div key={item.id} className="relative bg-[#F8F9FA] p-[15px] rounded-[4px] border border-[#E9ECEF] flex flex-col gap-[10px]">
                  <div className="flex flex-col md:flex-row gap-[10px] items-end w-full">
                    <div className="flex-1 w-full scale-item">
                      <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase">Turno</label>
                      <input type="text" list="shift-options" value={item.shift} onChange={e => handleUpdateItem(item.id, 'shift', e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[13px] focus:ring-ric-red focus:border-ric-red" />
                    </div>
                    <div className="flex-1 w-full scale-item">
                      <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase">Horário</label>
                      <input type="text" value={item.time} onChange={e => handleUpdateItem(item.id, 'time', e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[13px] focus:ring-ric-red focus:border-ric-red" />
                    </div>
                    <div className="flex-1 w-full scale-item">
                      <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase">Repórter</label>
                      <input type="text" list="reporter-options" value={item.reporterId} onChange={e => handleUpdateItem(item.id, 'reporterId', e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[13px] focus:ring-ric-red focus:border-ric-red" placeholder="(Opcional)" />
                    </div>
                    <div className="flex-1 w-full scale-item">
                      <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase">Cinegrafista</label>
                      <input type="text" list="cinegrafista-options" value={item.cinegrafistaId} onChange={e => handleUpdateItem(item.id, 'cinegrafistaId', e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[13px] focus:ring-ric-red focus:border-ric-red" placeholder="(Opcional)" />
                    </div>
                    <button onClick={() => handleRemoveItem(item.id)} className="p-2 mb-[1px] text-ric-muted hover:text-ric-red bg-white border border-[#E9ECEF] rounded-[4px] cursor-pointer" title="Remover regra">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="flex flex-col md:flex-row gap-[10px] items-start w-full">
                    <div className="flex-1 w-full">
                      <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase">Observações e Detalhes</label>
                      <input type="text" value={item.observation || ''} onChange={e => handleUpdateItem(item.id, 'observation', e.target.value)} className="block w-full rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[13px] focus:ring-ric-red focus:border-ric-red" placeholder="(Opcional)" />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={handleAddItem} className="text-ric-blue text-[13px] font-bold hover:underline flex items-center bg-transparent border-none cursor-pointer mt-4">
                <Plus size={14} className="mr-1" /> Adicionar linha na escala padrão
              </button>
            </div>
          </div>
  
          <div className="border border-ric-border rounded-[8px] overflow-hidden mt-6">
            <div className="bg-[#F8F9FA] px-[20px] py-[15px] border-b border-ric-border flex justify-between items-center">
              <h3 className="text-[14px] font-bold text-ric-text uppercase">Horários Padrão da Reunião de Pauta</h3>
              <button onClick={handleSave} className="bg-ric-green text-white px-[15px] py-[6px] rounded-[4px] font-bold shadow-sm flex items-center hover:bg-[#2E8B1A] text-[12px] uppercase transition-colors cursor-pointer">
                <Save size={14} className="mr-2" /> Salvar Padrão
              </button>
            </div>
            <div className="p-[20px] space-y-[15px]">
              {lineupTimes.map((item) => (
                <div key={item.id} className="relative bg-[#F8F9FA] p-[15px] rounded-[4px] border border-[#E9ECEF] flex gap-[10px] items-end w-max">
                  <div>
                    <label className="block text-[11px] font-bold text-ric-text mb-1 uppercase">Horário</label>
                    <input type="time" value={item.time} onChange={e => handleUpdateLineupTime(item.id, e.target.value)} className="block w-[120px] rounded-[4px] border-ric-border shadow-sm p-2 bg-white text-[13px] focus:ring-ric-red focus:border-ric-red" />
                  </div>
                  <button onClick={() => handleRemoveLineupTime(item.id)} className="p-2 mb-[1px] text-ric-muted hover:text-ric-red bg-white border border-[#E9ECEF] rounded-[4px] cursor-pointer">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <button onClick={handleAddLineupTime} className="text-ric-blue text-[13px] font-bold hover:underline flex items-center bg-transparent border-none cursor-pointer mt-4">
                <Plus size={14} className="mr-1" /> Adicionar horário
              </button>
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
          
          <h3 className="text-[14px] font-bold text-ric-text uppercase mb-[10px]">Usuários Cadastrados ({users.length})</h3>
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
                      <span className={`px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-ric-text text-white' : 'bg-blue-100 text-blue-700'}`}>
                        {u.role}
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
    </div>
  );
}
