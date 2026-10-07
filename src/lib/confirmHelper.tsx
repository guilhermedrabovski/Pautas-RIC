import React from 'react';
import toast from 'react-hot-toast';

export const confirmAction = (message: string, onConfirm: () => void) => {
  toast((t) => (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] font-medium text-gray-800">{message}</p>
      <div className="flex gap-2 mt-1">
        <button 
          className="bg-gray-100 text-gray-600 px-4 py-2.5 flex-1 rounded-[4px] text-[13px] font-bold hover:bg-gray-200 transition-colors" 
          onClick={() => toast.dismiss(t.id)}
        >
          Cancelar
        </button>
        <button 
          className="bg-ric-red text-white flex-1 px-4 py-2.5 rounded-[4px] text-[13px] font-bold hover:bg-red-700 transition-colors" 
          onClick={() => { 
            onConfirm(); 
            toast.dismiss(t.id); 
          }}
        >
          Confirmar
        </button>
      </div>
    </div>
  ), { 
    duration: 8000, 
    id: `confirm-${Date.now()}`,
    position: 'top-center'
  });
};
