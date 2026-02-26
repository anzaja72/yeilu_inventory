import React from 'react';
import { User, SedeId } from '../types';
import { SEDES } from '../constants';

interface SedeSelectorProps {
  user: User;
  onSelectSede: (sede: SedeId | 'ALL') => void;
}

const SEDE_ICONS: Record<string, string> = {
  taller: '🏭',
  country: '🏙️',
  plaza_sol: '☀️',
  portal_prado: '🏛️',
  centro: '🏪'
};

export const SedeSelector: React.FC<SedeSelectorProps> = ({ user, onSelectSede }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center p-4">
      <div className="w-full max-w-3xl mt-10">
        <div className="bg-indigo-600 p-10 rounded-[2.5rem] text-white text-center shadow-2xl shadow-indigo-200 mb-8">
          <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md overflow-hidden">
             <img src="https://i.imgur.com/ugAX7tI.png" alt="Yeilu Store Logo" className="w-16 h-16 object-contain" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">¿Dónde estás trabajando hoy?</h2>
          <p className="text-indigo-100 mt-2 font-bold tracking-widest text-[10px] uppercase opacity-80">
            Hola, {user.name}. Selecciona tu ubicación actual.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
          {user.role === 'GERENTE' && (
            <button
              onClick={() => onSelectSede('ALL')}
              className="bg-white p-8 rounded-[2rem] shadow-lg shadow-slate-200 border border-slate-100 flex flex-col items-center justify-center gap-4 hover:border-indigo-500 hover:scale-[1.03] transition-all group"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">🌍</span>
              <span className="font-black text-slate-800 uppercase tracking-widest text-sm">GLOBAL</span>
            </button>
          )}
          
          {SEDES.map(sede => (
            <button
              key={sede.id}
              onClick={() => onSelectSede(sede.id)}
              className="bg-white p-8 rounded-[2rem] shadow-lg shadow-slate-200 border border-slate-100 flex flex-col items-center justify-center gap-4 hover:border-indigo-500 hover:scale-[1.03] transition-all group"
            >
              <span className="text-5xl group-hover:scale-110 transition-transform">
                {SEDE_ICONS[sede.id] || '📍'}
              </span>
              <span className="font-black text-slate-800 uppercase tracking-widest text-sm text-center">
                {sede.name.replace(/^[0-9]\.\s*/, '')}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
