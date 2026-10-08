import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { PREDEFINED_USERS } from '../lib/constants';
import toast from 'react-hot-toast';
import { Film } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return toast.error('Preencha os campos');
    setLoading(true);

    const cleanUsername = username.trim().toLowerCase();
    const email = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@ric.com.br`;
    const searchUsername = cleanUsername.includes('@') ? cleanUsername.split('@')[0] : cleanUsername;

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      // Update their profile to ensure it matches constants if they are a predefined user
      const predefined = PREDEFINED_USERS.find(u => u.username === searchUsername);
      if (predefined) {
        try {
          await setDoc(doc(db, 'users', result.user.uid), {
            name: predefined.name,
            email: email,
            role: predefined.role,
          }, { merge: true });
        } catch (e) {
          console.error("Failed to update predefined user data", e);
        }
      }
      // handled by AuthContext
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
        const predefined = PREDEFINED_USERS.find(u => u.username === searchUsername);
        if (predefined) {
          try {
            // Auto register the predefined user
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, 'users', cred.user.uid), {
              name: predefined.name,
              email: email,
              role: predefined.role,
            });
            toast.success('Usuário criado e logado!');
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              toast.error('Usuário já existe. Senha incorreta.');
            } else {
              toast.error(createErr.message);
            }
          }
        } else {
          toast.error('Usuário ou senha incorretos.');
        }
      } else {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-ric-bg p-4 font-sans">
      <div className="w-full max-w-md bg-ric-card border border-ric-border rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.1)] p-8">
        <div className="text-center mb-8 flex flex-col items-center">
          <img 
             src="https://media.licdn.com/dms/image/v2/C4D0BAQG1MVAq9NsJmQ/company-logo_200_200/company-logo_200_200/0/1678299841092/gruporicpr_logo?e=2147483647&v=beta&t=i7G-u_n_6wi5V3PI3ZLF3LfYC_dNwzDjnkMZGMSDKyo" 
             alt="RIC Logo" 
             className="h-24 w-auto object-contain mb-4 rounded-full" 
          />
          <h1 className="text-[24px] font-black text-ric-blue tracking-tighter uppercase">Central de Pautas</h1>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-[13px] font-bold text-ric-text uppercase mb-1">Usuário</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-ric-bg border border-ric-border rounded shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-1 focus:ring-ric-red focus:border-ric-red text-[14px]"
              placeholder="Ex: ricardop"
            />
          </div>

          <div>
            <label className="block text-[13px] font-bold text-ric-text uppercase mb-1">Senha</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-ric-bg border border-ric-border rounded shadow-[inset_0_1px_2px_rgba(0,0,0,0.05)] focus:outline-none focus:ring-1 focus:ring-ric-red focus:border-ric-red text-[14px]"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full flex justify-center py-[10px] px-4 border border-transparent rounded shadow-sm text-[14px] font-bold text-white bg-ric-red hover:bg-[#c90000] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ric-red disabled:opacity-50 transition-colors uppercase cursor-pointer"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        {/* Quick Access for Image Editors */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-black uppercase text-ric-blue tracking-wider flex items-center gap-1.5">
              <Film size={14} className="text-ric-blue" /> Ilhas de Edição (Editores)
            </span>
            <span className="text-[10px] font-bold text-gray-400">Senha: 123456</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { id: 'zand', name: 'Zand' },
              { id: 'jamir', name: 'Jamir' },
              { id: 'jean', name: 'Jean' },
              { id: 'vagner', name: 'Vagner' },
              { id: 'valdeilton', name: 'Valdeilton' },
            ].map(ed => (
              <button
                key={ed.id}
                type="button"
                onClick={() => {
                  setUsername(ed.id);
                  setPassword('123456');
                }}
                disabled={loading}
                title={`Entrar como ${ed.name} (Ilhas de Edição)`}
                className="py-2.5 px-0.5 flex flex-col items-center justify-center bg-blue-50/70 hover:bg-ric-blue hover:text-white border border-blue-200/80 rounded-xl text-[11px] font-bold text-slate-800 transition-all cursor-pointer active:scale-95 shadow-2xs group"
              >
                <span className="truncate group-hover:text-white">{ed.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
