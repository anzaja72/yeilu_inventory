import React, { useState } from 'react';
import { hashPassword } from '../utils';
import { Button, Input, Modal } from './UI';

interface HashGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HashGenerator: React.FC<HashGeneratorProps> = ({ isOpen, onClose }) => {
  const [input, setInput] = useState('');
  const [hash, setHash] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!input) return;
    const generated = await hashPassword(input.trim());
    setHash(generated);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🔐 Generador de Hash SHA-256">
      <div className="space-y-6">
        <div className="bg-indigo-50 p-4 rounded-xl text-indigo-800 text-xs leading-relaxed">
          <p className="font-bold mb-2">Instrucciones para el Administrador:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Ingrese la contraseña actual del usuario (ej: "admin123").</li>
            <li>Haga clic en <strong>Generar Hash</strong>.</li>
            <li>Copie el código largo resultante.</li>
            <li>Vaya a su Google Sheet y <strong>reemplace</strong> la contraseña en texto plano con este código.</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Input 
            label="Contraseña Texto Plano" 
            value={input} 
            onChange={(e) => { setInput(e.target.value); setHash(''); }}
            placeholder="Escriba la contraseña aquí..."
          />
          <Button fullWidth onClick={handleGenerate} disabled={!input}>
            Generar Hash
          </Button>
        </div>

        {hash && (
          <div className="animate-in fade-in slide-in-from-top-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Hash Generado (SHA-256)
            </label>
            <div 
              onClick={handleCopy}
              className="bg-slate-900 text-emerald-400 font-mono text-[10px] p-4 rounded-xl break-all cursor-pointer hover:bg-slate-800 transition-colors relative group"
            >
              {hash}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white text-slate-900 text-[9px] font-bold px-2 py-1 rounded">
                {copied ? '¡COPIADO!' : 'CLIC PARA COPIAR'}
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 text-center">
              Este es el valor que debe guardar en la columna <strong>Password</strong> de su hoja de usuarios.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
};
