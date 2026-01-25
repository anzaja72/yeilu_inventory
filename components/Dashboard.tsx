
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, MaestroProducto, SedeId, MovementType, UserRole } from '../types';
import { SEDES, N8N_WEBHOOKS } from '../constants';
import { Button, Input, Select, Modal } from './UI';
import { QRScanner } from './QRScanner';
import { GoogleGenAI, Type } from "@google/genai";

interface IASection {
  tag: string;
  titulo: string;
  contenido: string;
  estado: 'success' | 'warning' | 'danger' | 'info';
}

interface IAReport {
  titulo: string;
  resumen: string;
  secciones: IASection[];
  recomendaciones: string[];
}

interface Notification {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

const INITIAL_INGRESO_STATE = {
  referencia: '',
  cantidad: 1,
  costo_unitario: 0,
  precio_venta: 0,
  stock_minimo: 5,
  imagen: null as string | null
};

// Función para limpiar símbolos y evitar NaN
const parseSafeNumber = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const sanitized = String(val).replace(/[^0-9.-]+/g, "");
  const parsed = parseFloat(sanitized);
  return isNaN(parsed) ? 0 : parsed;
};

export const Dashboard: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  const [rawProducts, setRawProducts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQRVisible, setIsQRVisible] = useState(false);
  const [filterSede, setFilterSede] = useState<SedeId | 'ALL'>(user.role === 'GERENTE' ? 'ALL' : user.sedeId);
  
  const [isMovModalOpen, setIsMovModalOpen] = useState(false);
  const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState<IAReport | null>(null);
  const [notification, setNotification] = useState<Notification>({ show: false, message: '', type: 'success' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [movForm, setMovForm] = useState({
    reference: '', 
    quantity: 1, 
    type: 'SALIDA' as MovementType, 
    destSede: '' as SedeId | '', 
    notes: '' 
  });

  const [ingresoForm, setIngresoForm] = useState(INITIAL_INGRESO_STATE);

  const [userForm, setUserForm] = useState({
    nombre: '',
    correo: '',
    password: '',
    perfil: 'OPERADOR' as UserRole,
    sede: 'taller' as SedeId
  });

  const showNotify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 4000);
  };

  const getFlexibleValue = (obj: any, aliases: string[]) => {
    if (!obj || typeof obj !== 'object') return null;
    const keys = Object.keys(obj);
    for (const alias of aliases) {
      const foundKey = keys.find(k => k.trim().toLowerCase() === alias.toLowerCase().trim());
      if (foundKey !== undefined) return obj[foundKey];
    }
    return null;
  };

  const mapAppSedeToJsonProperty = (sedeId: SedeId): string => {
    const map: Record<string, string> = {
      'taller': 'taller', 'country': 'country', 'plaza_sol': 'plazaDelSol', 'portal_prado': 'portalDelPrado', 'centro': 'centro'
    };
    return map[sedeId] || sedeId;
  };

  const normalizeData = (data: any[]): any[] => {
    return data.map(p => {
      const stockObj = getFlexibleValue(p, ['stock', 'Inventario', 'Existencias', 'Sedes', 'stocks']) || p;
      const totalStockVal = typeof stockObj === 'number' 
        ? stockObj 
        : (getFlexibleValue(stockObj, ['total', 'Cantidad', 'Suma', 'Total_Existencias']) ?? 
           getFlexibleValue(p, ['Stock_Actual', 'Cantidad_Total', 'Existencias', 'Stock', 'total']) ?? 0);

      return {
        referencia: String(getFlexibleValue(p, ['referencia', 'codigo', 'sku', 'id', 'Codigo']) || '').toUpperCase(),
        nombre: String(getFlexibleValue(p, ['nombre', 'descripcion', 'producto', 'Descripcion']) || 'Sin Nombre'),
        tipo: String(getFlexibleValue(p, ['tipo', 'categoria', 'familia', 'Categoria']) || 'Otros'),
        precioCosto: parseSafeNumber(getFlexibleValue(p, ['precioCosto', 'costo', 'valor_compra', 'Costo'])),
        precioVenta: parseSafeNumber(getFlexibleValue(p, ['precioVenta', 'venta', 'valor_venta', 'Venta'])),
        stockMinimo: parseSafeNumber(getFlexibleValue(p, ['stockMinimo', 'minimo', 'alerta', 'Stock_Minimo']) ?? 5),
        stock: {
          total: parseSafeNumber(totalStockVal),
          taller: parseSafeNumber(getFlexibleValue(stockObj, ['taller', 'Taller', 'bodega1', 'BODEGA 1'])),
          country: parseSafeNumber(getFlexibleValue(stockObj, ['country', 'Country', 'bodega2', 'BODEGA 2'])),
          plazaDelSol: parseSafeNumber(getFlexibleValue(stockObj, ['plaza_sol', 'plazaDelSol', 'plaza_del_sol', 'Plaza del Sol', 'bodega3', 'BODEGA 3'])),
          portalDelPrado: parseSafeNumber(getFlexibleValue(stockObj, ['portal_prado', 'portalDelPrado', 'portal_del_prado', 'Portal del Prado', 'bodega4', 'BODEGA 4'])),
          centro: parseSafeNumber(getFlexibleValue(stockObj, ['centro', 'Centro', 'bodega5', 'BODEGA 5']))
        }
      };
    });
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(N8N_WEBHOOKS.CONSULTA_GLOBAL);
      const data = await response.json();
      let sourceArray = Array.isArray(data) ? (data[0]?.productos || data) : (data.productos || [data]);
      if (sourceArray.length > 0) setRawProducts(normalizeData(sourceArray));
    } catch (error) {
      showNotify("Error de sincronización", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const insights = useMemo(() => {
    if (!rawProducts.length) return null;
    const safe = rawProducts.filter(p => p.referencia);
    
    // Determinar qué stock usar para los indicadores basándose en el filtro global
    const getStockForIndicators = (p: any) => {
      if (filterSede === 'ALL') return p.stock.total;
      const key = mapAppSedeToJsonProperty(filterSede);
      return (p.stock as any)[key] ?? 0;
    };

    const totalVenta = safe.reduce((acc, p) => acc + (p.precioVenta * getStockForIndicators(p)), 0);
    const totalCosto = safe.reduce((acc, p) => acc + (p.precioCosto * getStockForIndicators(p)), 0);
    
    // Sede líder siempre se calcula sobre el global para saber cuál es la mejor
    const sedesData = SEDES.map(s => {
      const key = mapAppSedeToJsonProperty(s.id);
      return { 
        name: s.name.replace(/^[0-9].\s*/, ''), 
        total: safe.reduce((acc, p) => acc + ((p.stock[key] || 0) * p.precioVenta), 0) 
      };
    });
    const liderSede = [...sedesData].sort((a,b) => b.total - a.total)[0];

    return {
      totalVenta,
      totalCosto,
      margen: totalVenta > 0 ? Math.round(((totalVenta - totalCosto) / totalVenta) * 100) : 0,
      lider: { nombre: liderSede?.name || 'N/A', valor: liderSede?.total || 0 },
      estrella: safe.sort((a,b) => (b.precioVenta * getStockForIndicators(b)) - (a.precioVenta * getStockForIndicators(a)))[0],
      critico: safe.sort((a,b) => getStockForIndicators(a) - getStockForIndicators(b))[0],
      volumen: safe.sort((a,b) => getStockForIndicators(b) - getStockForIndicators(a))[0],
      categoria: Object.entries(safe.reduce((acc:any, p) => { 
        const stock = getStockForIndicators(p);
        acc[p.tipo] = (acc[p.tipo]||0) + stock; 
        return acc; 
      }, {})).sort((a:any, b:any) => b[1]-a[1])[0]
    };
  }, [rawProducts, filterSede]);

  const generateAIReport = async () => {
    setIsGeneratingReport(true);
    setIsReportModalOpen(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Actúa como un experto en analítica de inventarios para Yeilustore. Analiza estos datos: ${JSON.stringify(rawProducts.slice(0, 20))}. Genera un informe estratégico que incluya: un título profesional, un resumen ejecutivo de la situación y secciones con recomendaciones específicas. Usa estados 'success', 'warning', 'danger' o 'info' según corresponda.`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              titulo: { type: Type.STRING },
              resumen: { type: Type.STRING },
              secciones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    titulo: { type: Type.STRING },
                    contenido: { type: Type.STRING },
                    estado: { type: Type.STRING, description: "Debe ser: success, warning, danger o info" }
                  },
                  required: ['titulo', 'contenido', 'estado']
                }
              }
            },
            required: ['titulo', 'resumen', 'secciones']
          }
        }
      });
      
      const resultText = response.text;
      if (resultText) {
        setReportData(JSON.parse(resultText));
      }
    } catch (error) {
      console.error(error);
      showNotify("Error al generar informe IA", "error");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleRegisterMovement = async () => {
    if (!movForm.reference) return showNotify("Ref obligatoria", "error");
    setIsSubmitting(true);
    const sedeTarget = filterSede === 'ALL' ? user.sedeId : filterSede;
    try {
      const res = await fetch(N8N_WEBHOOKS.REGISTRO_MOVIMIENTO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...movForm, sedeId: sedeTarget, usuario: user.username })
      });
      if (res.ok) { 
        showNotify("¡Movimiento registrado!"); 
        setIsMovModalOpen(false); 
        setMovForm({ reference: '', quantity: 1, type: 'SALIDA', destSede: '', notes: '' });
        loadData(); 
      }
    } catch { showNotify("Error de red", "error"); }
    finally { setIsSubmitting(false); }
  };

  const handleIngresoInventario = async () => {
    if (!ingresoForm.referencia) return showNotify("Ref obligatoria", "error");
    setIsSubmitting(true);
    const sedeTarget = filterSede === 'ALL' ? user.sedeId : filterSede;
    try {
      const res = await fetch(N8N_WEBHOOKS.PRODUCTO_CON_IMAGEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ingresoForm, usuario: user.username, sede: sedeTarget })
      });
      if (res.ok) { 
        showNotify("¡Producto ingresado!"); 
        setIsIngresoModalOpen(false); 
        setIngresoForm(INITIAL_INGRESO_STATE);
        loadData(); 
      }
    } catch { showNotify("Error al guardar", "error"); }
    finally { setIsSubmitting(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setIngresoForm(p => ({ ...p, imagen: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  const filteredData = useMemo(() => {
    return rawProducts.map(p => {
      if (filterSede === 'ALL') return { ...p, stockReal: p.stock.total };
      const key = mapAppSedeToJsonProperty(filterSede);
      return { ...p, stockReal: (p.stock as any)[key] ?? 0 };
    });
  }, [rawProducts, filterSede]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans pb-10">
      {notification.show && (
        <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 ${notification.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'} text-white`}>
           <span className="text-[10px] font-black uppercase tracking-widest">{notification.message}</span>
        </div>
      )}

      {isQRVisible && <QRScanner onScan={(txt) => { setMovForm(p => ({ ...p, reference: txt.toUpperCase() })); setIsQRVisible(false); setIsMovModalOpen(true); }} onClose={() => setIsQRVisible(false)} />}
      
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" strokeWidth="2"/></svg></div>
          <h1 className="text-lg font-black uppercase tracking-tighter text-slate-800">Yeilustore</h1>
        </div>
        <div className="flex gap-3">
          {user.role === 'GERENTE' && <button onClick={() => setIsUserModalOpen(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Usuarios</button>}
          <Button variant="secondary" onClick={onLogout} className="text-[10px] font-black h-9 uppercase">Salir</Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl">
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Inversión Actual ({filterSede === 'ALL' ? 'Global' : filterSede.toUpperCase()})</p>
             <h2 className="text-4xl font-black">${Math.round(insights?.totalCosto || 0).toLocaleString()}</h2>
          </div>
          <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl">
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200 mb-2">Venta Proyectada ({filterSede === 'ALL' ? 'Global' : filterSede.toUpperCase()})</p>
             <h2 className="text-4xl font-black">${Math.round(insights?.totalVenta || 0).toLocaleString()}</h2>
          </div>
        </div>

        {user.role === 'GERENTE' && insights && (
          <section className="grid grid-cols-2 lg:grid-cols-3 gap-6">
             {[
               { icon: '🏆', lab: 'Sede Líder', val: insights.lider.nombre, sub: `$${Math.round(insights.lider.valor).toLocaleString()}` },
               { icon: '⭐', lab: 'Estrella', val: insights.estrella?.nombre || 'N/A', sub: insights.estrella?.referencia || '' },
               { icon: '⚠️', lab: 'Alerta Stock', val: insights.critico?.referencia || 'N/A', sub: `${insights.critico?.stockReal || 0} UND` },
               { icon: '📊', lab: 'Mayor Volumen', val: insights.volumen?.nombre || 'N/A', sub: `${insights.volumen?.stockReal || 0} UND` },
               { icon: '🏷️', lab: 'Top Categoría', val: insights.categoria?.[0] || 'N/A', sub: 'Líder en ventas' },
               { icon: '📈', lab: 'Margen Global', val: `${insights.margen}%`, sub: 'Rendimiento' }
             ].map((kpi, i) => (
               <div key={i} className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">{kpi.icon}</span><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{kpi.lab}</p></div>
                  <h4 className="text-sm font-black text-slate-800 truncate uppercase">{kpi.val}</h4>
                  <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{kpi.sub}</p>
               </div>
             ))}
          </section>
        )}

        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="w-full md:w-56">
            <Select 
              value={filterSede} 
              onChange={e => setFilterSede(e.target.value as any)}
              options={[{value:'ALL', label:'🌍 GLOBAL'}, ...SEDES.map(s => ({value:s.id, label: `📍 ${s.name.replace(/^[0-9].\s*/, '').toUpperCase()}`}))]}
              className="font-black text-[10px] text-indigo-600 bg-white h-[52px] rounded-2xl shadow-sm"
            />
          </div>
          <div className="flex flex-1 gap-2 w-full">
            <button onClick={() => setIsIngresoModalOpen(true)} className="flex-1 p-4 rounded-2xl bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" strokeWidth="3"/></svg>
              <span>Ingreso</span>
            </button>
            <button onClick={() => setIsMovModalOpen(true)} className="flex-1 p-4 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16V4m0 0L3 8m4-4l4 4" strokeWidth="3"/></svg>
              <span>Movimiento</span>
            </button>
            {user.role === 'GERENTE' && (
              <button onClick={generateAIReport} className="flex-1 p-4 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                <span>Informe IA</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
          <div className="p-6 md:p-8 border-b flex justify-between items-center bg-slate-50/30">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Existencias Detalladas</h3>
            <button onClick={loadData} className={`p-2 rounded-full ${isLoading ? 'animate-spin' : ''}`}><svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9" strokeWidth="2"/></svg></button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b bg-slate-50/50">
                  <th className="px-8 py-5">REF</th>
                  <th className="px-8 py-5">Descripción</th>
                  <th className="px-8 py-5 text-center">Existencias</th>
                  <th className="px-8 py-5 text-right">P. Venta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredData.map((s, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-all">
                    <td className="px-8 py-4 font-black text-[11px] text-indigo-600">{s.referencia}</td>
                    <td className="px-8 py-4">
                      <p className="font-bold text-[11px] text-slate-700 uppercase">{s.nombre}</p>
                      <p className="text-[9px] text-slate-400 uppercase font-black">{s.tipo}</p>
                    </td>
                    <td className="px-8 py-4 text-center">
                       <span className={`inline-block px-4 py-1 rounded-full text-[10px] font-black ${s.stockReal <= s.stockMinimo ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                         {s.stockReal} UND
                       </span>
                    </td>
                    <td className="px-8 py-4 text-right font-black text-slate-700 text-[11px]">${Math.round(s.precioVenta).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Modal isOpen={isMovModalOpen} onClose={() => setIsMovModalOpen(false)} title="📦 MOVIMIENTO">
         <div className="space-y-4">
           <div className="flex gap-2">
             <Input label="Referencia" value={movForm.reference} onChange={e => setMovForm({...movForm, reference: e.target.value.toUpperCase()})} />
             <button onClick={() => setIsQRVisible(true)} className="mt-8 bg-slate-100 p-3 rounded-xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v1" strokeWidth="2"/></svg></button>
           </div>
           <div className="grid grid-cols-2 gap-4">
             <Input label="Cantidad" type="number" value={movForm.quantity} onChange={e => setMovForm({...movForm, quantity: Number(e.target.value)})} />
             <Select label="Tipo" value={movForm.type} onChange={e => setMovForm({...movForm, type: e.target.value as any})} options={[{value:'ENTRADA', label:'Entrada'}, {value:'SALIDA', label:'Salida'}, {value:'TRASLADO', label:'Traslado'}]} />
           </div>
           <Input 
             label="Observaciones / Motivo (Opcional)" 
             value={movForm.notes} 
             onChange={e => setMovForm({...movForm, notes: e.target.value})} 
             placeholder="Ej: Venta, Traslado a Centro, Ajuste de inventario..."
             className="text-xs"
           />
           <Button fullWidth onClick={handleRegisterMovement} disabled={isSubmitting}>Confirmar</Button>
         </div>
      </Modal>

      <Modal isOpen={isIngresoModalOpen} onClose={() => setIsIngresoModalOpen(false)} title="✨ NUEVO INGRESO">
        <div className="space-y-4">
          <Input label="Referencia" value={ingresoForm.referencia} onChange={e => setIngresoForm({...ingresoForm, referencia: e.target.value.toUpperCase()})} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Cantidad" type="number" value={ingresoForm.cantidad} onChange={e => setIngresoForm({...ingresoForm, cantidad: Number(e.target.value)})} />
            <Input label="Mínimo Alerta" type="number" value={ingresoForm.stock_minimo} onChange={e => setIngresoForm({...ingresoForm, stock_minimo: Number(e.target.value)})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Costo" type="number" value={ingresoForm.costo_unitario} onChange={e => setIngresoForm({...ingresoForm, costo_unitario: Number(e.target.value)})} />
            <Input label="Venta" type="number" value={ingresoForm.precio_venta} onChange={e => setIngresoForm({...ingresoForm, precio_venta: Number(e.target.value)})} />
          </div>
          <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl text-center">
            {ingresoForm.imagen ? (
              <div className="relative inline-block">
                <img src={ingresoForm.imagen} className="w-20 h-20 object-cover rounded-xl shadow-md" />
                <button onClick={() => setIngresoForm(p => ({...p, imagen: null}))} className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 text-[8px]">X</button>
              </div>
            ) : <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Añadir Foto</button>}
            <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} accept="image/*" />
          </div>
          <Button fullWidth onClick={handleIngresoInventario} disabled={isSubmitting}>Guardar Producto</Button>
        </div>
      </Modal>

      <Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} title="🚀 INFORME IA">
        {isGeneratingReport ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
             <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
             <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Analizando...</p>
          </div>
        ) : reportData && (
          <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
            <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
               <h4 className="text-indigo-600 font-black text-[10px] uppercase mb-1 tracking-widest">{reportData.titulo}</h4>
               <p className="text-sm text-slate-600 font-medium">{reportData.resumen}</p>
            </div>
            {reportData.secciones.map((sec, i) => (
              <div key={i} className={`p-5 rounded-2xl border-l-4 ${sec.estado === 'danger' ? 'bg-rose-50 border-rose-500' : sec.estado === 'warning' ? 'bg-amber-50 border-amber-500' : 'bg-emerald-50 border-emerald-500'}`}>
                 <h5 className="font-black text-sm uppercase text-slate-800">{sec.titulo}</h5>
                 <p className="text-xs text-slate-600 mt-1">{sec.contenido}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};
