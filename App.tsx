
import React, { useState, useEffect } from 'react';
import { AuthState, SedeId, User, UserRole } from './types';
import { STORAGE_KEYS, GAS_WEB_APP_URL } from './constants';
import { Input, Button } from './components/UI';
import { Dashboard } from './components/Dashboard';

const App: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.AUTH);
    return saved ? JSON.parse(saved) : { user: null, isAuthenticated: false };
  });

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(authState));
  }, [authState]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.includes('EJEMPLO')) {
      setError('Configuración incompleta: URL de Google Sheets no válida.');
      setIsLoading(false);
      return;
    }

    try {
      // Consultamos los datos al script de Google
      const response = await fetch(`${GAS_WEB_APP_URL}?action=GET_ALL`, {
        method: 'GET',
        mode: 'cors'
      });
      
      if (!response.ok) throw new Error("Error de conexión con el servidor de datos.");
      
      const data = await response.json();
      const usersTable = data.usuarios || [];

      if (!Array.isArray(usersTable) || usersTable.length === 0) {
        throw new Error("No se pudo leer la tabla de usuarios. Verifica que la pestaña 'Usuarios' exista y tenga datos.");
      }

      // Helper ultra-flexible para obtener valores de columnas sin importar variaciones de nombre
      const getFlexibleValue = (obj: any, aliases: string[]) => {
        if (!obj || typeof obj !== 'object') return null;
        const keys = Object.keys(obj);
        for (const alias of aliases) {
          const foundKey = keys.find(k => k.trim().toLowerCase() === alias.toLowerCase());
          if (foundKey !== undefined) {
            const val = obj[foundKey];
            return val !== null && val !== undefined ? val : null;
          }
        }
        return null;
      };

      const normalize = (val: any) => String(val ?? '').trim();

      const foundUser = usersTable.find((u: any) => {
        if (!u) return false;
        
        // Buscamos el identificador (puede ser correo, usuario, id, nombre, etc)
        const identityInSheet = normalize(getFlexibleValue(u, ['Correo', 'Email', 'Usuario', 'ID', 'Login', 'User', 'Nombre', 'Name'])).toLowerCase();
        const passInSheet = normalize(getFlexibleValue(u, ['Contraseña', 'Contrasena', 'Password', 'Clave', 'Pass', 'Clave Acceso']));
        
        const inputIdentity = normalize(loginForm.email).toLowerCase();
        const inputPass = normalize(loginForm.password);
        
        return identityInSheet === inputIdentity && passInSheet === inputPass;
      });

      if (!foundUser) {
        // Ayuda a depurar si las credenciales no coinciden por diferencias sutiles
        console.debug("Intento de login fallido para:", loginForm.email);
        console.debug("Headers detectados en el Excel:", Object.keys(usersTable[0] || {}));
        throw new Error("Credenciales no encontradas. Verifica que el Usuario y la Clave coincidan exactamente con lo registrado en el Excel.");
      }

      // Mapeo seguro de datos del usuario
      const rawSede = normalize(getFlexibleValue(foundUser, ['Sede', 'Tienda', 'Local', 'Ubicacion', 'Bodega']));
      // Limpiamos la sede de prefijos numéricos o espacios
      const cleanSedeId = rawSede.toLowerCase().replace(/^[0-9]\.?\s*/, '').replace(/\s+/g, '_') as SedeId;
      
      const userData: User = {
        id: normalize(getFlexibleValue(foundUser, ['Correo', 'Email', 'ID', 'Usuario', 'Login']) || Date.now().toString()),
        username: normalize(getFlexibleValue(foundUser, ['Nombre', 'Name', 'Usuario', 'User']) || 'Usuario'),
        sedeId: (cleanSedeId as any) || 'taller',
        role: (normalize(getFlexibleValue(foundUser, ['Perfil', 'Rol', 'Role', 'Nivel']) || 'OPERADOR').toUpperCase()) as UserRole,
        name: normalize(getFlexibleValue(foundUser, ['Nombre', 'Name']) || 'Usuario')
      };

      setAuthState({ user: userData, isAuthenticated: true });
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

  if (authState.isAuthenticated && authState.user) {
    return <Dashboard user={authState.user} onLogout={handleLogout} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden">
        <div className="bg-indigo-600 p-10 text-white text-center">
          <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 backdrop-blur-md">
             <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2-2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
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
              VINCULADO A GOOGLE SHEETS<br/>
              TABLA: "Usuarios"
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default App;
