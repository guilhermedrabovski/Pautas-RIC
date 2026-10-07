import React, { useState } from 'react';
import { addDoc, collection, updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth, UserData } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { getDisplayNames } from '../lib/userUtils';
import { notifyUrgentPautaPush } from '../lib/notifications';

export default function AgendaForm({ users, onClose, editData = null }: { users: UserData[], onClose: () => void, editData?: any }) {
  const { userData, user } = useAuth();
  const isEditorOrAdmin = userData?.role === 'editor' || userData?.role === 'pauteiro' || userData?.role === 'pauteira' || userData?.role === 'admin';
  const displayNames = getDisplayNames(users);

  const [formData, setFormData] = useState(editData || {
    title: '',
    slug: '',
    description: '',
    status: 'pending',
    priority: 'media',
    continuing: false,
    date: format(new Date(), 'yyyy-MM-dd'),
    journal: '',
    reporterId: !isEditorOrAdmin && userData?.uid ? userData.uid : '',
    cinegrafistaId: '',
    audienceSuccess: false,
    isMochilink: false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.slug) return toast.error('Título e Retranca são obrigatórios');

    try {
      if (editData) {
        await updateDoc(doc(db, 'agendas', editData.id), {
          ...formData,
          updatedAt: Date.now()
        });
        toast.success('Pauta atualizada!');
      } else {
        await addDoc(collection(db, 'agendas'), {
          ...formData,
          suggestedBy: userData?.uid || user?.uid || 'unknown',
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        if (formData.priority === 'alta') {
          notifyUrgentPautaPush({
            title: formData.title || formData.slug,
            isUrgent: true,
            url: '/pautas',
          }).catch(err => console.warn('Push error on agenda:', err));
        }

        toast.success('Pauta enviada!');
      }
      onClose();
    } catch (err: any) { toast.error(err.message); }
  };

  const reporters = users.filter(u => u.role === 'reporter').sort((a,b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-ric-card rounded-[8px] border border-ric-border shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-[20px] w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-[18px] font-bold text-ric-text uppercase tracking-wider mb-[15px]">{editData ? 'Editar Pauta' : 'Criar Nova Pauta'}</h2>
        <form onSubmit={handleSubmit} className="space-y-[15px]">
          <div className="grid grid-cols-2 gap-[15px]">
            <div>
              <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Retranca (Slug)</label>
              <input type="text" value={formData.slug} onChange={e => setFormData({...formData, slug: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]" required />
            </div>
            <div>
              <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Prioridade</label>
              <select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]">
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Título</label>
            <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]" required />
          </div>

          <div>
            <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Descrição</label>
            <textarea rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]" required />
          </div>

          <div className="flex gap-[15px]">
            <label className="flex items-center space-x-2">
              <input type="checkbox" checked={formData.continuing} onChange={e => setFormData({...formData, continuing: e.target.checked})} className="rounded-[3px] text-ric-red border-ric-border focus:ring-ric-red bg-ric-bg w-[16px] h-[16px]" />
              <span className="text-[13px] font-medium text-ric-text">Pauta com Continuidade (Destaque)</span>
            </label>
            <label className="flex items-center space-x-2">
              <input type="checkbox" checked={formData.isMochilink} onChange={e => setFormData({...formData, isMochilink: e.target.checked})} className="rounded-[3px] text-ric-red border-ric-border focus:ring-ric-red bg-ric-bg w-[16px] h-[16px]" />
              <span className="text-[13px] font-medium text-ric-text">É Mochilink (Ao vivo)</span>
            </label>
          </div>

          {isEditorOrAdmin && (
            <>
              <hr className="my-[20px] border-ric-border" />
              <div className="grid grid-cols-2 gap-[15px]">
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]">
                    <option value="pending">Pendente</option>
                    <option value="approved">Aprovada</option>
                    <option value="in_progress">Em Andamento</option>
                    <option value="rejected">Recusada</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Jornal (Em Andamento)</label>
                  <select value={formData.journal} onChange={e => setFormData({...formData, journal: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]">
                    <option value="">Não definido</option>
                    <option value="BG">Balanço Geral (BG)</option>
                    <option value="CA">Cidade Alerta (CA)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-[15px]">
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Data Prevista</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]" />
                </div>
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Repórter Atribuído</label>
                  <select value={formData.reporterId} onChange={e => setFormData({...formData, reporterId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]">
                    <option value="">(Nenhum)</option>
                    {reporters.map(r => <option key={r.uid} value={r.uid}>{displayNames[r.uid] || r.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-[15px]">
                <div>
                  <label className="block text-[12px] font-bold text-ric-text mb-1 uppercase">Cinegrafista</label>
                  <input type="text" value={formData.cinegrafistaId} onChange={e => setFormData({...formData, cinegrafistaId: e.target.value})} className="block w-full rounded-[4px] border-ric-border shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] p-[8px] bg-ric-bg focus:border-ric-red focus:ring-1 focus:ring-ric-red text-[13px]" placeholder="Nome" />
                </div>
              </div>
              
              <label className="flex items-center space-x-2 bg-[#FFF8E1] p-[10px] rounded-[4px] border border-ric-yellow w-fit">
                <input type="checkbox" checked={formData.audienceSuccess} onChange={e => setFormData({...formData, audienceSuccess: e.target.checked})} className="rounded-[3px] text-ric-yellow border-ric-border focus:ring-ric-yellow bg-ric-bg w-[16px] h-[16px]" />
                <span className="text-[13px] font-bold text-[#D48806] uppercase">Marcador de Sucesso de Audiência 📈</span>
              </label>
            </>
          )}

          <div className="flex justify-end gap-[10px] mt-[20px]">
            <button type="button" onClick={onClose} className="px-[15px] py-[8px] border border-ric-border bg-ric-bg rounded-[4px] text-ric-text font-bold text-[13px] hover:bg-[#E4E6E9] uppercase cursor-pointer">Cancelar</button>
            <button type="submit" className="px-[15px] py-[8px] bg-ric-red text-white font-bold rounded-[4px] text-[13px] hover:bg-[#c90000] uppercase cursor-pointer">
              {editData ? 'Salvar Alterações' : 'Salvar Pauta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
