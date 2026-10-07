import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Calendar, CheckSquare, ClipboardList, LayoutDashboard, LogOut, Users, Settings as SettingsIcon, AlertCircle, MonitorPlay, Menu, X, BookOpen, MessageSquare, Smartphone } from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import NotificationHandler from './NotificationHandler';
import EditorialChat from './EditorialChat';

export default function Layout() {
  const { userData, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadRemindersCount, setUnreadRemindersCount] = useState(0);
  const [pendingScalesCount, setPendingScalesCount] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isReporter = userData?.role === 'reporter';
  const isEditor = userData?.role === 'editor';
  
  const isManager = () => {
    if (!userData) return false;
    const nameStr = (userData.name || '').toLowerCase();
    const managers = ['guilherme', 'luana', 'ivete', 'fabio', 'weslley'];
    return managers.some(m => nameStr.includes(m)) || ['admin', 'editor', 'pauteiro', 'pauteira'].includes(userData.role);
  };

  useEffect(() => {
    if (!userData?.uid) return;
    
    // Listen for unread reminders directed to the current user
    const qReminders = query(
      collection(db, 'reminders'),
      where('toId', '==', userData.uid),
      where('read', '==', false)
    );

    const unsubReminders = onSnapshot(qReminders, snap => {
      setUnreadRemindersCount(snap.docs.length);
    });

    // Listen for trades needing attention
    const statuses = isManager() ? ['pending_target', 'pending_admin'] : ['pending_target'];
    const qTrades = query(
      collection(db, 'shiftTrades'),
      where('status', 'in', statuses)
    );

    const unsubTrades = onSnapshot(qTrades, snap => {
      let count = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'pending_target' && data.targetUserId === userData.uid) {
          count++;
        } else if (data.status === 'pending_admin' && isManager()) {
          count++;
        }
      });
      setPendingScalesCount(count);
    });

    return () => { unsubReminders(); unsubTrades(); };
  }, [userData?.uid, userData?.role, userData?.name]);

  // Menu items: Editores vão direto para Ilhas de Edição
  const menu = isEditor
    ? [
        { name: 'Ilhas de Edição', icon: LayoutDashboard, path: '/editor-dashboard' }
      ]
    : [
        { name: 'Início', icon: LayoutDashboard, path: '/dashboard' },
        { name: 'Pautas', icon: ClipboardList, path: '/agendas' },
        { name: 'WhatsApp Sugestões', icon: MessageSquare, path: '/whatsapp' },
        { name: 'Ilhas de Edição', icon: LayoutDashboard, path: '/editor-dashboard' },
        { name: 'Meu Painel', icon: ClipboardList, path: '/my-dashboard', hide: !isReporter },
        { name: 'Lembretes', icon: Bell, path: '/reminders', badge: unreadRemindersCount },
        { name: 'Histórias (Repercussão)', icon: BookOpen, path: '/stories' },
        { name: 'Checklist', icon: CheckSquare, path: '/checklist' },
        { name: 'Configurações', icon: SettingsIcon, path: '/settings' }
      ].filter(item => !item.hide);

  return (
    <div className="min-h-screen bg-ric-bg flex overflow-hidden">
      <NotificationHandler />
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`w-[240px] bg-ric-blue text-white flex flex-col fixed h-full inset-y-0 left-0 z-30 py-5 transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="px-5 pb-[30px] flex justify-between items-center">
          <div className="text-center flex-1 flex flex-col items-center">
            <img 
               src="https://media.licdn.com/dms/image/v2/C4D0BAQG1MVAq9NsJmQ/company-logo_200_200/company-logo_200_200/0/1678299841092/gruporicpr_logo?e=2147483647&v=beta&t=i7G-u_n_6wi5V3PI3ZLF3LfYC_dNwzDjnkMZGMSDKyo" 
               alt="RIC Logo" 
               className="h-16 w-auto object-contain rounded-full" 
            />
            <span className="text-[12px] tracking-[2px] font-extrabold mt-2 text-white/50">PAUTAS</span>
          </div>
          <button className="md:hidden p-1" onClick={() => setIsSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <nav className="list-none">
            {menu.map((item) => (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center px-5 py-4 text-[15px] cursor-pointer transition-colors justify-between ${
                    isActive 
                      ? 'bg-white/10 border-l-4 border-ric-red' 
                      : 'hover:bg-white/5 border-l-4 border-transparent text-white/90'
                  }`
                }
              >
                <div className="flex items-center">
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="bg-ric-red text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex flex-col overflow-hidden">
              <span className="text-[14px] font-medium text-white truncate">{userData?.name || userData?.email?.split('@')[0] || 'Usuário'}</span>
              <span className="text-xs text-white/70 capitalize">{userData?.role}</span>
            </div>
            <button 
              onClick={logout}
              className="p-3 text-white/50 hover:text-white rounded-full hover:bg-white/10"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-[240px] flex flex-col min-h-screen relative overflow-y-auto">
        {/* Mobile Header */}
        <header className="md:hidden bg-ric-blue text-white p-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
          <button onClick={() => setIsSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <img 
              src="https://media.licdn.com/dms/image/v2/C4D0BAQG1MVAq9NsJmQ/company-logo_200_200/company-logo_200_200/0/1678299841092/gruporicpr_logo?e=2147483647&v=beta&t=i7G-u_n_6wi5V3PI3ZLF3LfYC_dNwzDjnkMZGMSDKyo" 
              alt="RIC" 
              className="h-8 w-auto rounded-full" 
            />
            <span className="text-[14px] font-bold tracking-wider">PAUTAS</span>
          </div>
          <div className="w-6"></div> {/* Spacer for alignment */}
        </header>

        {unreadRemindersCount > 0 && (
          <div 
            onClick={() => navigate('/reminders')}
            className="bg-[#FEF2F2] border-b border-[#FCA5A5] text-[#991B1B] px-[20px] py-[12px] flex items-center justify-between cursor-pointer hover:bg-[#FEE2E2] transition-colors"
          >
            <div className="flex items-center">
              <AlertCircle size={18} className="mr-2 text-[#EF4444]" />
              <span className="text-[14px] font-bold leading-tight">
                Você tem {unreadRemindersCount} {unreadRemindersCount === 1 ? 'lembrete pendente' : 'lembretes pendentes'}!
              </span>
            </div>
            <span className="text-[11px] font-extrabold uppercase underline whitespace-nowrap ml-2">Ver</span>
          </div>
        )}
        <div className="flex-1 p-[12px] md:p-[20px]">
          <Outlet />
        </div>
      </main>

      {/* Online Chat between editors, pauteiros and newsroom */}
      <EditorialChat />
    </div>
  );
}
