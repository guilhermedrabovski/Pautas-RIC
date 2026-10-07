import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import { getDisplayNames } from '../lib/userUtils';
import { Check, Reply, Send, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { confirmAction } from '../lib/confirmHelper';

export default function Reminders() {
  const { userData } = useAuth();
  const [reminders, setReminders] = useState<any[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  
  const [newReminder, setNewReminder] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const displayNames = getDisplayNames(users);

  useEffect(() => {
    // Fetch all users
    getDocs(collection(db, 'users')).then(snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserData)).sort((a,b) => (a.name || '').localeCompare(b.name || '')));
    });

    if (!userData) return;
    const q = query(collection(db, 'reminders'), where('toId', '==', userData.uid));
    const unsub = onSnapshot(q, snap => {
       setReminders(snap.docs.map(d => ({ id: d.id, ...d.data() } as any)).sort((a: any, b: any) => b.createdAt - a.createdAt));
    });
    return () => unsub();
  }, [userData]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReminder.trim() || !selectedUser) return toast.error('Preencha os campos!');
    try {
      await addDoc(collection(db, 'reminders'), {
        text: newReminder,
        fromId: userData?.uid,
        toId: selectedUser,
        read: false,
        createdAt: Date.now()
      });
      setNewReminder('');
      toast.success('Lembrete enviado!');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'reminders', id), { read: true });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteReminder = async (id: string) => {
    confirmAction('Deseja realmente apagar este lembrete?', async () => {
      try {
        await deleteDoc(doc(db, 'reminders', id));
        toast.success('Lembrete apagado com sucesso');
      } catch (err: any) {
        toast.error(err.message);
      }
    });
  };

  const getUserName = (id: string) => {
    if (!id) return '';
    const u = users.find(u => u.uid === id);
    if (!u) return id;
    return displayNames[u.uid] || u.name || u.email?.split('@')[0] || id;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-[15px]">
      {/* List */}
      <div className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border p-[20px]">
        <h2 className="text-[16px] font-bold text-ric-text mb-[15px] uppercase tracking-wider">Meus Lembretes</h2>
        {reminders.length === 0 ? (
          <p className="text-ric-muted text-[13px]">Nenhum lembrete.</p>
        ) : (
          <div className="space-y-[10px]">
            {reminders.map(r => (
              <div key={r.id} className={`p-[15px] rounded-[6px] border ${r.read ? 'bg-ric-bg border-ric-border' : 'bg-[#FFF5F5] border-[#FCA5A5] border-l-4 border-l-ric-red'}`}>
                <div className="flex justify-between items-start">
                  <span className="text-[11px] font-bold uppercase text-ric-muted">
                    De: {getUserName(r.fromId)}
                  </span>
                  <div className="flex items-center gap-1">
                    {!r.read && (
                      <button onClick={() => markAsRead(r.id)} className="text-ric-green hover:text-[#2E8B1A] bg-white rounded p-1 transition-colors" title="Marcar como lido">
                        <Check size={16} />
                      </button>
                    )}
                    <button onClick={() => handleDeleteReminder(r.id)} className="text-black/30 hover:text-red-600 bg-white/50 hover:bg-white rounded p-1 transition-colors" title="Excluir Lembrete">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <p className={`mt-[8px] text-[13px] ${!r.read ? 'font-bold text-ric-text' : 'text-ric-muted'}`}>{r.text}</p>
                <button 
                  onClick={() => { setSelectedUser(r.fromId); setNewReminder(`Re: ${r.text} - `); }}
                  className="mt-[12px] text-[12px] font-medium text-ric-blue flex items-center hover:underline"
                >
                  <Reply size={14} className="mr-1" /> Responder
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create */}
      <div className="bg-ric-card rounded-[8px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-ric-border p-[20px] h-fit">
        <h2 className="text-[16px] font-bold text-ric-text mb-[15px] uppercase tracking-wider">Enviar Lembrete</h2>
        <form onSubmit={handleSend} className="space-y-[15px]">
          <div>
            <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Para</label>
            <select 
              value={selectedUser} 
              onChange={e => setSelectedUser(e.target.value)}
              className="mt-1 block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:border-ric-red focus:ring-1 focus:ring-ric-red bg-ric-bg p-2 text-[13px]"
            >
              <option value="">Selecione um usuário...</option>
              {users.sort((a,b) => (a.name || '').localeCompare(b.name || '')).map(u => (
                <option key={u.uid} value={u.uid}>{displayNames[u.uid] || u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Mensagem</label>
            <textarea 
              rows={4}
              value={newReminder}
              onChange={e => setNewReminder(e.target.value)}
              className="mt-1 block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:border-ric-red focus:ring-1 focus:ring-ric-red bg-ric-bg p-2 text-[13px]"
              placeholder="Digite o lembrete..."
            />
          </div>
          <button 
            type="submit"
            className="w-full flex items-center justify-center py-[10px] px-4 rounded-[4px] text-[13px] font-bold text-white bg-ric-blue hover:bg-[#002244] uppercase cursor-pointer"
          >
            <Send size={16} className="mr-2" /> Enviar Lembrete
          </button>
        </form>
      </div>
    </div>
  );
}
