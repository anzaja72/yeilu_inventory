
import React, { useState, useEffect } from 'react';
import { AuthState, SedeId, User } from './types';
import { STORAGE_KEYS, N8N_WEBHOOKS } from './constants';
import { Input, Button } from './components/UI';
import { Dashboard } from './components/Dashboard';
import { SedeSelector } from './components/SedeSelector';
import { HashGenerator } from './components/HashGenerator';

import { hashPassword } from './utils';

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AUTH);
    const parsed = saved ? JSON.parse(saved) : { user: null, isAuthenticated: false };
    const savedSede = localStorage.getItem('yeilu_active_sede');
    if (savedSede && parsed.isAuthenticated) {
      parsed.activeSede = savedSede as SedeId | 'ALL';
    }
    return parsed;
  });

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showHashGen, setShowHashGen] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(authState));
    if (authState.activeSede) {
      localStorage.setItem('yeilu_active_sede', authState.activeSede);
    } else {
      localStorage.removeItem('yeilu_active_sede');
    }
  }, [authState]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const performLogin = async (password: string) => {
      try {
        // Enviamos el usuario tal cual lo escribe el usuario (sin toLowerCase) para respetar mayúsculas/minúsculas de la Hoja de Cálculo
        const usuarioPayload = loginForm.email.trim();
        
        console.log(`[Login] Intentando login con URL: ${N8N_WEBHOOKS.LOGIN}`);
        console.log(`[Login] Payload:`, { usuario: usuarioPayload, passwordLength: password.length });
        
        const res = await fetch(N8N_WEBHOOKS.LOGIN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            // Enviamos múltiples alias para asegurar compatibilidad con el workflow de n8n
            usuario: usuarioPayload, 
            username: usuarioPayload,
            email: usuarioPayload,
            password: password,
            clave: password
          })
        });
        
        console.log(`[Login] Status: ${res.status} ${res.statusText}`);
        
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          const text = await res.text();
          console.error(`[Login] Respuesta no JSON:`, text.substring(0, 200));
          throw new Error(`Respuesta del servidor no válida (${res.status}): ${text.substring(0, 50)}...`);
        }

        const data = await res.json();
        console.log(`[Login] Data recibida:`, data);
        
        // Si falla, agregamos información de depuración al error
        if (!data.success) {
           data.error = `${data.error || 'Credenciales incorrectas'} (Usuario enviado: "${usuarioPayload}")`;
        }
        
        return { ...data, _status: res.status, _ok: res.ok };
      } catch (err: any) {
        console.error(`[Login] Error de red/fetch:`, err);
        throw new Error(err.message === 'Failed to fetch' ? 'Error de conexión (posible bloqueo CORS o servidor caído)' : err.message);
      }
    };

    try {
      let hashedPassword = loginForm.password.trim();
      try {
        hashedPassword = await hashPassword(loginForm.password.trim());
      } catch (cryptoError) {
        console.warn("Crypto API no disponible, usando texto plano:", cryptoError);
      }

      let lastError = null;

      // 1. Intentar con Hash (Estándar nuevo)
      try {
        const data = await performLogin(hashedPassword);
        if (data.success) {
          setAuthState({ user: data.user, isAuthenticated: true });
          return;
        }
        lastError = data.error || 'Credenciales incorrectas';
      } catch (err: any) {
        console.error("Hash login failed:", err);
        lastError = err.message;
      }

      // 2. Fallback a Texto Plano (si falló el hash y son diferentes)
      if (hashedPassword !== loginForm.password.trim()) {
        console.log("Intentando fallback texto plano...");
        try {
          const data = await performLogin(loginForm.password.trim());
          if (data.success) {
            console.log("Login exitoso con texto plano (Legacy)");
            setAuthState({ user: data.user, isAuthenticated: true });
            return;
          }
        } catch (err) {
          console.error("Fallback login failed:", err);
        }
      }

      // Si llegamos aquí, ambos fallaron
      throw new Error(lastError || 'Error desconocido al iniciar sesión');

    } catch (err: any) {
      console.error("Login Error:", err);
      setError(err.message || 'Error inesperado al validar credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthState({ user: null, isAuthenticated: false });
  };

  const handleSelectSede = (sede: SedeId | 'ALL') => {
    setAuthState(prev => ({ ...prev, activeSede: sede }));
  };

  const handleChangeSede = () => {
    setAuthState(prev => ({ ...prev, activeSede: undefined }));
  };

  if (authState.isAuthenticated && authState.user) {
    if (!authState.activeSede) {
      return <SedeSelector user={authState.user} onSelectSede={handleSelectSede} />;
    }
    return <Dashboard user={authState.user} activeSede={authState.activeSede} onChangeSede={handleChangeSede} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 p-10 text-white text-center">
          <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md overflow-hidden">
             <img src="https://i.imgur.com/ugAX7tI.png" alt="Yeilu Store Logo" className="w-16 h-16 object-contain" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Yeilu Store</h2>
          <p className="text-indigo-100 mt-2 font-bold tracking-widest text-[10px] uppercase opacity-80">Inventory Intelligence v2.3</p>
        </div>
        
        <form onSubmit={handleLogin} className="p-10 space-y-6">
          {error && (
            <div className="bg-rose-50 border border-rose-100 text-rose-600 text-[11px] font-black p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
              {error}
            </div>
          )}

          <div className="space-y-4">
            <Input 
              label="Usuario o Correo" 
              type="text"
              placeholder="Ej: admintaller" 
              value={loginForm.email}
              onChange={e => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
              required
              className="rounded-xl py-3"
            />
            <Input 
              label="Contraseña" 
              type="password" 
              placeholder="••••••••" 
              value={loginForm.password}
              onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
              required
              className="rounded-xl py-3"
            />
          </div>

          <Button type="submit" fullWidth disabled={isLoading} className="py-4 text-[11px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 rounded-2xl">
            {isLoading ? (
              <span className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Sincronizando...
              </span>
            ) : 'Iniciar Sesión'}
          </Button>

          <div className="pt-8 border-t border-slate-50 text-center">
            <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-black leading-relaxed">
              VINCULADO A N8N WEBHOOKS<br/>
              SISTEMA CENTRALIZADO
            </p>
            <button 
              type="button"
              onClick={() => setShowHashGen(true)}
              className="mt-4 text-[9px] text-indigo-300 hover:text-indigo-500 font-bold uppercase tracking-widest transition-colors"
            >
              🛠️ Herramientas Admin
            </button>
          </div>
        </form>
      </div>
      <HashGenerator isOpen={showHashGen} onClose={() => setShowHashGen(false)} />
    </div>
  );
};

export default App;
