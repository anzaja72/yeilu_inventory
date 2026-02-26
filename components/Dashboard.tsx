
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, MaestroProducto, SedeId, MovementType, UserRole } from '../types';
import { SEDES, N8N_WEBHOOKS, PRODUCT_CATEGORIES } from '../constants';
import { Button, Input, Select, Modal } from './UI';
import { QRScanner } from './QRScanner';
import { ReferenceSearch } from './ReferenceSearch';
import { GoogleGenAI, Type } from "@google/genai";
import { hashPassword } from '../utils';

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
  nombre: '',
  categoria: '',
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

export const Dashboard: React.FC<{ user: User; activeSede: SedeId | 'ALL'; onChangeSede: () => void; onLogout: () => void }> = ({ user, activeSede, onChangeSede, onLogout }) => {
  const [rawProducts, setRawProducts] = useState<any[]>([]);
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [rawUsers, setRawUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isQRVisible, setIsQRVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'history' | 'analytics'>('inventory');
  
  // Inventory Filters & Sort
  const [invSearch, setInvSearch] = useState('');
  const [invDebouncedSearch, setInvDebouncedSearch] = useState('');
  const [invCategory, setInvCategory] = useState('TODOS');
  const [invSort, setInvSort] = useState<{key: string, direction: 'asc' | 'desc'}>({ key: 'referencia', direction: 'asc' });
  const [invPage, setInvPage] = useState(1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // User Modal State
  const [userModalTab, setUserModalTab] = useState<'create' | 'view'>('create');
  const [showPassword, setShowPassword] = useState(false);
  
  const [histFilterType, setHistFilterType] = useState('TODOS');
  const [histFilterSede, setHistFilterSede] = useState<SedeId | 'ALL'>(user.role === 'GERENTE' ? 'ALL' : activeSede);
  const [histFilterDateFrom, setHistFilterDateFrom] = useState('');
  const [histFilterDateTo, setHistFilterDateTo] = useState('');
  const [histSearch, setHistSearch] = useState('');
  const [histPage, setHistPage] = useState(1);
  
  const [isMovModalOpen, setIsMovModalOpen] = useState(false);
  const [isIngresoModalOpen, setIsIngresoModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  
  const [movStep, setMovStep] = useState<1 | 2 | 3>(1);
  const [movPreview, setMovPreview] = useState<any>(null);
  const [ingresoStep, setIngresoStep] = useState<1 | 2 | 3>(1);
  const [ingresoPreview, setIngresoPreview] = useState<any>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState<IAReport | null>(null);
  const [notification, setNotification] = useState<Notification>({ show: false, message: '', type: 'success' });
  const [isOffline, setIsOffline] = useState(false);
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

  const normalizeLogs = (data: any[]): any[] => {
    return data.map(l => ({
      id: getFlexibleValue(l, ['UUID', 'id', 'Id']),
      fecha: getFlexibleValue(l, ['Fecha', 'Date', 'Timestamp', 'fechaHora']),
      operador: getFlexibleValue(l, ['Operador', 'Usuario', 'User']),
      sedeOrigen: getFlexibleValue(l, ['Sede_Origen', 'Origen', 'Sede', 'Bodega']),
      sedeDestino: getFlexibleValue(l, ['Sede_Destino', 'Destino']),
      referencia: String(getFlexibleValue(l, ['Referencia', 'Codigo', 'Producto', 'SKU']) || '').toUpperCase(),
      cantidad: parseSafeNumber(getFlexibleValue(l, ['Cantidad', 'Qty'])),
      tipo: String(getFlexibleValue(l, ['Tipo_Movimiento', 'Tipo', 'Movimiento']) || '').toUpperCase()
    }));
  };

  const normalizeUsers = (data: any[]): any[] => {
    return data.map(u => ({
      nombre: getFlexibleValue(u, ['Nombre', 'Name', 'Usuario', 'User']) || 'Usuario',
      usuario: getFlexibleValue(u, ['Correo', 'Email', 'ID', 'Usuario', 'Login']) || '',
      sede: getFlexibleValue(u, ['Sede', 'Tienda', 'Local']) || 'taller',
      perfil: getFlexibleValue(u, ['Perfil', 'Rol', 'Role']) || 'OPERADOR'
    }));
  };

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const response = await fetch(N8N_WEBHOOKS.CONSULTA_GLOBAL);
      if (!response.ok) {
        if (response.status === 500) throw new Error("Error interno en n8n (revisa tu código en el nodo Code)");
        if (response.status === 404) throw new Error("Webhook no encontrado (404)");
        throw new Error(`Error del servidor: ${response.status}`);
      }
      const data = await response.json();
      
      let sourceArray = Array.isArray(data) ? (data[0]?.productos || data) : (data.productos || [data]);
      let logsArray = Array.isArray(data) ? (data[0]?.logs || []) : (data.logs || []);
      let usersArray = Array.isArray(data) ? (data[0]?.usuarios || []) : (data.usuarios || []);
      
      if (sourceArray.length > 0) {
        setRawProducts(normalizeData(sourceArray));
        setRawLogs(normalizeLogs(logsArray));
        setRawUsers(normalizeUsers(usersArray));
        sessionStorage.setItem('yeilu_cache', JSON.stringify({ data: sourceArray, logs: logsArray, users: usersArray, ts: Date.now() }));
        setIsOffline(false);
        if (!silent) showNotify("Datos actualizados correctamente", "success");
      }
    } catch (error: any) {
      console.error("Error cargando datos:", error);
      const cached = sessionStorage.getItem('yeilu_cache');
      if (cached) {
        const { data, logs, users, ts } = JSON.parse(cached);
        const ageMinutes = (Date.now() - ts) / 1000 / 60;
        setRawProducts(normalizeData(data));
        if (logs) setRawLogs(normalizeLogs(logs));
        if (users) setRawUsers(normalizeUsers(users));
        setIsOffline(true);
        showNotify(`Modo Offline: ${error.message}. Datos de hace ${Math.round(ageMinutes)} min.`, 'warning');
      } else {
        showNotify(`Error crítico: ${error.message}`, "error");
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const criticalCount = useMemo(() => 
    rawProducts.filter(p => {
      const key = activeSede === 'ALL' ? 'total' : mapAppSedeToJsonProperty(activeSede as SedeId);
      return (p.stock[key] || 0) <= p.stockMinimo;
    }).length, [rawProducts, activeSede]);

  const insights = useMemo(() => {
    if (!rawProducts.length) return null;
    const safe = rawProducts.filter(p => p.referencia);
    
    // Determinar qué stock usar para los indicadores basándose en el filtro global
    const getStockForIndicators = (p: any) => {
      if (activeSede === 'ALL') return p.stock.total;
      const key = mapAppSedeToJsonProperty(activeSede);
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
  }, [rawProducts, activeSede]);

  const generateAIReport = async () => {
    setIsGeneratingReport(true);
    setIsReportModalOpen(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const contextoIA = {
        resumen_inventario: {
          total_referencias: rawProducts.length,
          valor_costo_total: insights?.totalCosto || 0,
          valor_venta_proyectado: insights?.totalVenta || 0,
          margen_global_porcentaje: insights?.margen || 0,
          sede_lider: insights?.lider.nombre || 'N/A',
          fecha_analisis: new Date().toLocaleDateString('es-CO')
        },
        alertas_criticas: rawProducts
          .filter(p => p.stock.total <= p.stockMinimo)
          .map(p => ({ ref: p.referencia, nombre: p.nombre, stock: p.stock.total, minimo: p.stockMinimo })),
        productos_sin_movimiento_estimado: rawProducts
          .filter(p => p.stock.total > p.stockMinimo * 3)
          .slice(0, 10)
          .map(p => ({ ref: p.referencia, nombre: p.nombre, stock: p.stock.total })),
        distribucion_por_sede: SEDES.map(s => ({
          sede: s.name,
          valor_inventario: rawProducts.reduce((acc, p) => {
            const key = mapAppSedeToJsonProperty(s.id);
            return acc + ((p.stock[key] || 0) * p.precioVenta);
          }, 0)
        })),
        top_productos_por_valor: rawProducts
          .sort((a, b) => (b.precioVenta * b.stock.total) - (a.precioVenta * a.stock.total))
          .slice(0, 5)
          .map(p => ({ ref: p.referencia, nombre: p.nombre, valor: p.precioVenta * p.stock.total })),
        movimientos_recientes: rawLogs?.slice(0, 30) || []
      };

      const prompt = `Eres un consultor experto en retail de moda colombiano. Analiza estos datos de Yeilu Store (tienda multisede en Colombia) y genera un informe ejecutivo estratégico. Datos: ${JSON.stringify(contextoIA)}. Enfócate en: 1) Alertas que requieren acción inmediata, 2) Oportunidades de rotación de inventario, 3) Rebalanceo entre sedes, 4) Productos estrella vs. productos muertos. Usa lenguaje directo de negocios, no académico.`;
      
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
              },
              recomendaciones: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ['titulo', 'resumen', 'secciones', 'recomendaciones']
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

  const handleReviewMovement = () => {
    if (!movForm.reference) return showNotify("Ref obligatoria", "error");
    if (!movForm.quantity || movForm.quantity <= 0) return showNotify("Cantidad inválida", "error");

    const product = rawProducts.find(p => p.referencia === movForm.reference);
    const sedeTarget = activeSede === 'ALL' ? user.sedeId : activeSede;
    const key = mapAppSedeToJsonProperty(sedeTarget);
    
    const stockActual = product ? ((product.stock as any)[key] ?? 0) : 0;
    const stockMinimo = product ? product.stockMinimo : 0;
    const nombreProducto = product ? product.nombre : 'Producto no encontrado';
    
    let stockResultante = stockActual;
    let destStockActual = 0;
    let destStockResultante = 0;

    if (movForm.type === 'ENTRADA') stockResultante += movForm.quantity;
    if (movForm.type === 'SALIDA') stockResultante -= movForm.quantity;
    if (movForm.type === 'TRASLADO') {
      stockResultante -= movForm.quantity;
      const destKey = mapAppSedeToJsonProperty(movForm.destSede as SedeId);
      destStockActual = product ? ((product.stock as any)[destKey] ?? 0) : 0;
      destStockResultante = destStockActual + movForm.quantity;
    }

    let status = 'OK';
    let warningMsg = '';
    
    if (!product) {
      status = 'WARNING_NOT_FOUND';
      warningMsg = 'Referencia no encontrada en el maestro de productos. Se registrará el movimiento pero el producto podría no existir.';
    } else if ((movForm.type === 'SALIDA' || movForm.type === 'TRASLADO') && movForm.quantity > stockActual) {
      status = 'ERROR_INSUFFICIENT';
      warningMsg = `Stock insuficiente. Solo hay ${stockActual} unidades disponibles en origen.`;
    } else if (stockResultante < stockMinimo) {
      status = 'WARNING_LOW_STOCK';
      warningMsg = `El stock quedará por debajo del mínimo (${stockMinimo} UND).`;
    }

    setMovPreview({
      product,
      nombreProducto,
      stockActual,
      stockMinimo,
      stockResultante,
      destStockActual,
      destStockResultante,
      status,
      warningMsg,
      sedeTarget
    });
    setMovStep(2);
  };

  const handleConfirmMovement = async () => {
    // Optimistic Update
    const sedeTarget = movPreview.sedeTarget;
    const key = mapAppSedeToJsonProperty(sedeTarget);
    const delta = movForm.type === 'ENTRADA' ? movForm.quantity : -movForm.quantity;
    const totalDelta = movForm.type === 'TRASLADO' ? 0 : delta;

    setRawProducts(prev => prev.map(p => {
      if (p.referencia !== movForm.reference) return p;
      const newStock = {
        ...p.stock,
        [key]: Math.max(0, (p.stock[key] || 0) + delta),
        total: Math.max(0, p.stock.total + totalDelta)
      };
      // Handle TRASLADO destination update if applicable
      if (movForm.type === 'TRASLADO' && movForm.destSede) {
        const destKey = mapAppSedeToJsonProperty(movForm.destSede as SedeId);
        newStock[destKey] = Math.max(0, (p.stock[destKey] || 0) + movForm.quantity);
      }
      return { ...p, stock: newStock };
    }));

    setIsSubmitting(true);
    setMovStep(3); // Move to success immediately

    try {
      const res = await fetch(N8N_WEBHOOKS.REGISTRO_MOVIMIENTO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reference: movForm.reference,
          quantity: movForm.quantity,
          type: movForm.type,
          sedeId: movPreview.sedeTarget, 
          destSede: movForm.type === 'TRASLADO' ? movForm.destSede : undefined,
          usuario: user.username,
          notes: movForm.notes
        })
      });
      if (res.ok) { 
        loadData(true); // Silent reload
      } else {
        throw new Error("Error al registrar movimiento");
      }
    } catch { 
      showNotify("Error al registrar. Datos revertidos.", "error");
      loadData(); // Revert changes
      setMovStep(1); // Go back to form
      setIsMovModalOpen(false);
    }
    finally { setIsSubmitting(false); }
  };

  const handleReviewIngreso = () => {
    if (!ingresoForm.referencia) return showNotify("Ref obligatoria", "error");
    if (!ingresoForm.nombre) return showNotify("Nombre obligatorio", "error");
    if (!ingresoForm.categoria) return showNotify("Categoría obligatoria", "error");
    
    const productExists = rawProducts.some(p => p.referencia === ingresoForm.referencia);
    const sedeTarget = activeSede === 'ALL' ? user.sedeId : activeSede;

    setIngresoPreview({
      productExists,
      sedeTarget
    });
    setIngresoStep(2);
  };

  const handleConfirmIngreso = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(N8N_WEBHOOKS.PRODUCTO_CON_IMAGEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ingresoForm, usuario: user.username, sede: ingresoPreview.sedeTarget })
      });
      if (res.ok) { 
        setIngresoStep(3);
        loadData(); 
      } else {
        showNotify("Error al guardar", "error");
      }
    } catch { showNotify("Error al guardar", "error"); }
    finally { setIsSubmitting(false); }
  };

  const handleCreateUser = async () => {
    if (!userForm.nombre || !userForm.correo || !userForm.password) return showNotify("Todos los campos son obligatorios", "error");
    
    setIsSubmitting(true);
    try {
      const hashedPassword = await hashPassword(userForm.password);
      const res = await fetch(N8N_WEBHOOKS.CREAR_USUARIO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: userForm.nombre,
          usuario: userForm.correo.toLowerCase(),
          password: hashedPassword,
          perfil: userForm.perfil,
          sede: userForm.sede
        })
      });
      
      const data = await res.json();
      if (data.success) {
        showNotify("Usuario creado exitosamente", "success");
        setUserForm({ nombre: '', correo: '', password: '', perfil: 'OPERADOR', sede: 'taller' });
        loadData(); // Recargar para ver el nuevo usuario en la lista
      } else {
        showNotify(data.error || "Error al crear usuario", "error");
      }
    } catch {
      showNotify("Error de conexión", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInvSearch(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setInvDebouncedSearch(val);
      setInvPage(1);
    }, 200);
  };

  const handleSort = (key: string) => {
    setInvSort(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const uniqueCategories = useMemo(() => {
    const cats = Array.from(new Set(rawProducts.map(p => p.tipo))).sort();
    return ['TODOS', ...cats];
  }, [rawProducts]);

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
      if (activeSede === 'ALL') return { ...p, stockReal: p.stock.total };
      const key = mapAppSedeToJsonProperty(activeSede);
      return { ...p, stockReal: (p.stock as any)[key] ?? 0 };
    });
  }, [rawProducts, activeSede]);

  const filteredInventory = useMemo(() => {
    let filtered = filteredData;

    if (invCategory !== 'TODOS') {
      filtered = filtered.filter(p => p.tipo === invCategory);
    }

    if (invDebouncedSearch) {
      const term = invDebouncedSearch.toUpperCase();
      filtered = filtered.filter(p => 
        p.referencia.includes(term) || 
        p.nombre.toUpperCase().includes(term) || 
        p.tipo.toUpperCase().includes(term)
      );
    }

    return filtered.sort((a, b) => {
      const valA = a[invSort.key as keyof typeof a];
      const valB = b[invSort.key as keyof typeof b];
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return invSort.direction === 'asc' ? valA - valB : valB - valA;
      }
      return invSort.direction === 'asc' 
        ? String(valA).localeCompare(String(valB)) 
        : String(valB).localeCompare(String(valA));
    });
  }, [filteredData, invCategory, invDebouncedSearch, invSort]);

  const paginatedInventory = useMemo(() => {
    const start = (invPage - 1) * 25;
    return filteredInventory.slice(start, start + 25);
  }, [filteredInventory, invPage]);

  const totalInvPages = Math.ceil(filteredInventory.length / 25);

  const filteredLogs = useMemo(() => {
    let filtered = rawLogs;
    
    if (user.role !== 'GERENTE') {
      const activeSedeName = SEDES.find(s => s.id === activeSede)?.name.replace(/^[0-9]\.\s*/, '').toLowerCase() || '';
      filtered = filtered.filter(l => 
        (l.sedeOrigen && l.sedeOrigen.toLowerCase().includes(activeSedeName)) || 
        (l.sedeDestino && l.sedeDestino.toLowerCase().includes(activeSedeName))
      );
    } else if (histFilterSede !== 'ALL') {
      const filterSedeName = SEDES.find(s => s.id === histFilterSede)?.name.replace(/^[0-9]\.\s*/, '').toLowerCase() || '';
      filtered = filtered.filter(l => 
        (l.sedeOrigen && l.sedeOrigen.toLowerCase().includes(filterSedeName)) || 
        (l.sedeDestino && l.sedeDestino.toLowerCase().includes(filterSedeName))
      );
    }

    if (histFilterType !== 'TODOS') {
      filtered = filtered.filter(l => l.tipo === histFilterType);
    }

    if (histSearch) {
      filtered = filtered.filter(l => l.referencia && l.referencia.includes(histSearch.toUpperCase()));
    }

    if (histFilterDateFrom) {
      filtered = filtered.filter(l => l.fecha && new Date(l.fecha) >= new Date(histFilterDateFrom));
    }
    if (histFilterDateTo) {
      const toDate = new Date(histFilterDateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(l => l.fecha && new Date(l.fecha) <= toDate);
    }

    return filtered.sort((a, b) => {
      const dateA = a.fecha ? new Date(a.fecha).getTime() : 0;
      const dateB = b.fecha ? new Date(b.fecha).getTime() : 0;
      return dateB - dateA;
    });
  }, [rawLogs, user.role, activeSede, histFilterSede, histFilterType, histSearch, histFilterDateFrom, histFilterDateTo]);

  const paginatedLogs = useMemo(() => {
    const start = (histPage - 1) * 20;
    return filteredLogs.slice(start, start + 20);
  }, [filteredLogs, histPage]);

  const totalPages = Math.ceil(filteredLogs.length / 20);

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
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg flex-shrink-0">
            <img src="https://i.imgur.com/ugAX7tI.png" alt="Yeilu Store" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-lg font-black uppercase tracking-tighter text-slate-800 flex items-center gap-2">
            Yeilustore
            {criticalCount > 0 && (
              <button 
                onClick={() => { setActiveTab('inventory'); setInvCategory('TODOS'); setInvSearch(''); }}
                className="bg-rose-500 text-white text-[8px] font-black px-2 py-0.5 rounded-full animate-pulse hover:bg-rose-600 transition-colors"
              >
                {criticalCount} CRÍTICOS
              </button>
            )}
            {isOffline && (
              <button 
                onClick={() => loadData()}
                className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-1 rounded-lg text-[9px] font-bold tracking-widest border border-orange-200 flex items-center gap-2 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                OFFLINE (Reintentar)
              </button>
            )}
          </h1>
          
          <div className="hidden md:flex items-center gap-2 ml-6 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sede:</span>
            <span className="text-xs font-black text-indigo-600 uppercase">
              {activeSede === 'ALL' ? '🌍 GLOBAL' : SEDES.find(s => s.id === activeSede)?.name.replace(/^[0-9]\.\s*/, '')}
            </span>
            <button onClick={onChangeSede} className="ml-2 text-[9px] font-black bg-white border border-slate-200 px-2 py-1 rounded text-slate-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors uppercase">Cambiar</button>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <div className="md:hidden flex items-center gap-2 mr-2">
            <span className="text-[10px] font-black text-indigo-600 uppercase">
              {activeSede === 'ALL' ? '🌍 GLOBAL' : SEDES.find(s => s.id === activeSede)?.name.replace(/^[0-9]\.\s*/, '')}
            </span>
            <button onClick={onChangeSede} className="text-[9px] font-black bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">Cambiar</button>
          </div>
          {user.role === 'GERENTE' && <button onClick={() => setIsUserModalOpen(true)} className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Usuarios</button>}
          <Button variant="secondary" onClick={onLogout} className="text-[10px] font-black h-9 uppercase">Salir</Button>
        </div>
      </header>

      <div className="bg-white border-b px-6 flex gap-6 overflow-x-auto custom-scrollbar sticky top-[72px] z-30">
        <button 
          onClick={() => setActiveTab('inventory')}
          className={`py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          📦 INVENTARIO
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
        >
          📋 HISTORIAL
        </button>
        {user.role === 'GERENTE' && (
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`py-4 text-[11px] font-black uppercase tracking-widest border-b-2 transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
          >
            📊 ANÁLISIS
          </button>
        )}
      </div>

      <main className="max-w-7xl mx-auto p-4 lg:p-8 space-y-8">
        {activeTab === 'inventory' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-2xl">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Inversión Actual ({activeSede === 'ALL' ? 'Global' : activeSede.toUpperCase()})</p>
                 <h2 className="text-4xl font-black">${Math.round(insights?.totalCosto || 0).toLocaleString()}</h2>
              </div>
              <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl">
                 <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200 mb-2">Venta Proyectada ({activeSede === 'ALL' ? 'Global' : activeSede.toUpperCase()})</p>
                 <h2 className="text-4xl font-black">${Math.round(insights?.totalVenta || 0).toLocaleString()}</h2>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-center">
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
              <div className="p-6 border-b space-y-4 bg-slate-50/30">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Existencias Detalladas</h3>
                  <div className="relative w-full md:w-96">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </div>
                    <input 
                      type="text" 
                      className="block w-full pl-10 pr-10 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-indigo-500 focus:border-indigo-500 bg-white" 
                      placeholder="Buscar por referencia, nombre o categoría..." 
                      value={invSearch}
                      onChange={handleSearchChange}
                    />
                    {invSearch && (
                      <button onClick={() => { setInvSearch(''); setInvDebouncedSearch(''); }} className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {uniqueCategories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => { setInvCategory(cat); setInvPage(1); }}
                      className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase whitespace-nowrap transition-colors ${invCategory === cat ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    {invDebouncedSearch || invCategory !== 'TODOS' ? `${filteredInventory.length} resultados` : `Mostrando ${filteredInventory.length} productos`}
                  </p>
                  <button onClick={loadData} className={`p-2 rounded-full hover:bg-slate-100 ${isLoading ? 'animate-spin' : ''}`}><svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9" strokeWidth="2"/></svg></button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b bg-slate-50/50">
                      <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('referencia')}>
                        REF {invSort.key === 'referencia' && (invSort.direction === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="px-8 py-5">Descripción</th>
                      <th className="px-8 py-5 text-center cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('stockReal')}>
                        Existencias {invSort.key === 'stockReal' && (invSort.direction === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="px-8 py-5 text-right cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('precioVenta')}>
                        P. Venta {invSort.key === 'precioVenta' && (invSort.direction === 'asc' ? '▲' : '▼')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginatedInventory.map((s, idx) => (
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
              
              <div className="p-4 border-t flex justify-between items-center bg-slate-50/30">
                <Button variant="secondary" onClick={() => setInvPage(p => Math.max(1, p - 1))} disabled={invPage === 1} className="text-[10px] py-2">Anterior</Button>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Página {invPage} de {totalInvPages || 1}</span>
                <Button variant="secondary" onClick={() => setInvPage(p => Math.min(totalInvPages, p + 1))} disabled={invPage === totalInvPages || totalInvPages === 0} className="text-[10px] py-2">Siguiente</Button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <Select 
                label="Tipo" 
                value={histFilterType} 
                onChange={e => { setHistFilterType(e.target.value); setHistPage(1); }} 
                options={[{value:'TODOS', label:'Todos'}, {value:'ENTRADA', label:'Entrada'}, {value:'SALIDA', label:'Salida'}, {value:'TRASLADO', label:'Traslado'}]} 
              />
              {user.role === 'GERENTE' && (
                <Select 
                  label="Sede" 
                  value={histFilterSede} 
                  onChange={e => { setHistFilterSede(e.target.value as any); setHistPage(1); }} 
                  options={[{value:'ALL', label:'Todas'}, ...SEDES.map(s => ({value:s.id, label: s.name.replace(/^[0-9]\.\s*/, '')}))]} 
                />
              )}
              <Input label="Desde" type="date" value={histFilterDateFrom} onChange={e => { setHistFilterDateFrom(e.target.value); setHistPage(1); }} />
              <Input label="Hasta" type="date" value={histFilterDateTo} onChange={e => { setHistFilterDateTo(e.target.value); setHistPage(1); }} />
              <div className="md:col-span-3 flex gap-2">
                <Input label="Buscar Referencia" value={histSearch} onChange={e => { setHistSearch(e.target.value); setHistPage(1); }} className="flex-1" />
              </div>
              <div className="md:col-span-1">
                <Button fullWidth onClick={loadData} disabled={isLoading} className="h-[42px] text-[10px]">
                  {isLoading ? 'Actualizando...' : '🔄 Actualizar Datos'}
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
              <div className="p-4 border-b flex justify-between items-center bg-slate-50/30">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registros encontrados: {filteredLogs.length}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b bg-slate-50/50">
                      <th className="px-6 py-5">Fecha/Hora</th>
                      <th className="px-6 py-5">Operador</th>
                      <th className="px-6 py-5">Tipo</th>
                      <th className="px-6 py-5">Producto</th>
                      <th className="px-6 py-5 text-center">Cantidad</th>
                      <th className="px-6 py-5">Origen</th>
                      <th className="px-6 py-5">Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {paginatedLogs.length > 0 ? (
                      paginatedLogs.map((l, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-all">
                          <td className="px-6 py-4 text-[10px] font-bold text-slate-500">{l.fecha ? new Date(l.fecha).toLocaleString() : '-'}</td>
                          <td className="px-6 py-4 text-[11px] font-black text-slate-700">{l.operador}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black tracking-widest ${
                              l.tipo === 'ENTRADA' ? 'bg-emerald-100 text-emerald-700' :
                              l.tipo === 'SALIDA' ? 'bg-rose-100 text-rose-700' :
                              l.tipo === 'TRASLADO' ? 'bg-indigo-100 text-indigo-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {l.tipo}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-black text-[11px] text-indigo-600">{l.referencia}</td>
                          <td className="px-6 py-4 text-center font-black text-[11px] text-slate-700">{l.cantidad}</td>
                          <td className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">{l.sedeOrigen}</td>
                          <td className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase">{l.sedeDestino || '-'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm font-bold">
                          No se encontraron registros con los filtros actuales.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t flex justify-between items-center bg-slate-50/30">
                <Button variant="secondary" onClick={() => setHistPage(p => Math.max(1, p - 1))} disabled={histPage === 1} className="text-[10px] py-2">Anterior</Button>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Página {histPage} de {totalPages || 1}</span>
                <Button variant="secondary" onClick={() => setHistPage(p => Math.min(totalPages, p + 1))} disabled={histPage === totalPages || totalPages === 0} className="text-[10px] py-2">Siguiente</Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && user.role === 'GERENTE' && insights && (
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
      </main>

      <Modal isOpen={isMovModalOpen} onClose={() => { setIsMovModalOpen(false); setMovStep(1); setMovForm({ reference: '', quantity: 1, type: 'SALIDA', destSede: '', notes: '' }); }} title="📦 MOVIMIENTO">
         {movStep === 1 && (
           <div className="space-y-4">
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <ReferenceSearch 
                    value={movForm.reference} 
                    onChange={(ref, prod) => {
                      setMovForm(prev => ({ 
                        ...prev, 
                        reference: ref,
                        notes: (!prev.notes && prod) ? prod.nombre : prev.notes 
                      }));
                    }}
                    productos={filteredData}
                    allowNew={false}
                  />
                </div>
                <button onClick={() => setIsQRVisible(true)} className="mt-6 bg-slate-100 p-3 rounded-xl"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 4v1" strokeWidth="2"/></svg></button>
              </div>
             <div className="grid grid-cols-2 gap-4">
               <Input label="Cantidad" type="number" value={movForm.quantity} onChange={e => setMovForm({...movForm, quantity: Number(e.target.value)})} />
               <Select label="Tipo" value={movForm.type} onChange={e => setMovForm({...movForm, type: e.target.value as any})} options={[{value:'ENTRADA', label:'Entrada'}, {value:'SALIDA', label:'Salida'}, {value:'TRASLADO', label:'Traslado'}]} />
             </div>
             
             {movForm.type === 'TRASLADO' && (
               <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                 <Select 
                   label="Sede de destino" 
                   value={movForm.destSede} 
                   onChange={e => setMovForm({...movForm, destSede: e.target.value as SedeId})} 
                   options={[
                     {value: '', label: 'Selecciona destino...'},
                     ...SEDES.filter(s => s.id !== (activeSede === 'ALL' ? user.sedeId : activeSede)).map(s => ({value: s.id, label: s.name.replace(/^[0-9]\.\s*/, '')}))
                   ]} 
                 />
                 <div className="bg-indigo-50 p-3 rounded-xl flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest text-indigo-600 border border-indigo-100">
                   <span>{SEDES.find(s => s.id === (activeSede === 'ALL' ? user.sedeId : activeSede))?.name.replace(/^[0-9]\.\s*/, '')}</span>
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/></svg>
                   <span>{movForm.destSede ? SEDES.find(s => s.id === movForm.destSede)?.name.replace(/^[0-9]\.\s*/, '') : '???'}</span>
                 </div>
               </div>
             )}

             <Input 
               label="Observaciones / Motivo (Opcional)" 
               value={movForm.notes} 
               onChange={e => setMovForm({...movForm, notes: e.target.value})} 
               placeholder="Ej: Venta, Traslado a Centro, Ajuste de inventario..."
               className="text-xs"
             />
             <Button 
               fullWidth 
               onClick={handleReviewMovement}
               disabled={movForm.type === 'TRASLADO' && !movForm.destSede}
               title={movForm.type === 'TRASLADO' && !movForm.destSede ? "Selecciona la sede de destino" : ""}
             >
               Revisar movimiento
             </Button>
           </div>
         )}
         {movStep === 2 && movPreview && (
           <div className="space-y-4">
             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Producto encontrado</h4>
               <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                 <p className="font-black text-indigo-600 text-sm">🏷️ REF: {movForm.reference}</p>
                 <p className="font-bold text-slate-700 text-xs mt-1">📦 Nombre: {movPreview.nombreProducto}</p>
                 <p className="text-xs text-slate-600 mt-1">🏪 Stock actual en {movPreview.sedeTarget}: <span className="font-black">{movPreview.stockActual} UND</span></p>
                 <p className="text-xs text-slate-600 mt-1">📊 Stock mínimo: {movPreview.stockMinimo} UND</p>
               </div>
             </div>

             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Movimiento a registrar</h4>
               <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                 <p>Tipo: <span className="font-black">{movForm.type}</span></p>
                 <p>Cantidad: <span className="font-black">{movForm.quantity} UND</span></p>
                 <p>Sede: <span className="font-black">{movPreview.sedeTarget}</span></p>
                 <p>Operador: <span className="font-black">{user.name}</span></p>
               </div>
             </div>

             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
               <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Stock resultante proyectado</h4>
               
               {movForm.type === 'TRASLADO' ? (
                 <div className="space-y-3 mb-2">
                   <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                     <span className="text-xs font-bold text-slate-600">Origen ({movPreview.sedeTarget})</span>
                     <span className="text-sm font-black text-slate-800">{movPreview.stockActual} → {movPreview.stockResultante}</span>
                   </div>
                   <div className="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-100">
                     <span className="text-xs font-bold text-slate-600">Destino ({movForm.destSede})</span>
                     <span className="text-sm font-black text-slate-800">{movPreview.destStockActual} → {movPreview.destStockResultante}</span>
                   </div>
                 </div>
               ) : (
                 <p className="text-lg font-black text-slate-800 mb-2">{movPreview.stockActual} → {movPreview.stockResultante}</p>
               )}
               
               {movPreview.status === 'OK' && (
                 <div className="flex items-center gap-2 text-emerald-600 text-xs font-black bg-emerald-50 p-2 rounded-lg">
                   ✅ Stock OK. Movimiento validado correctamente.
                 </div>
               )}
               {movPreview.status === 'WARNING_LOW_STOCK' && (
                 <div className="flex items-center gap-2 text-amber-600 text-xs font-black bg-amber-50 p-2 rounded-lg">
                   ⚠️ {movPreview.warningMsg}
                 </div>
               )}
               {movPreview.status === 'WARNING_NOT_FOUND' && (
                 <div className="flex items-center gap-2 text-orange-600 text-xs font-black bg-orange-50 p-2 rounded-lg">
                   ⚠️ {movPreview.warningMsg}
                 </div>
               )}
               {movPreview.status === 'ERROR_INSUFFICIENT' && (
                 <div className="flex items-center gap-2 text-rose-600 text-xs font-black bg-rose-50 p-2 rounded-lg">
                   🔴 {movPreview.warningMsg}
                 </div>
               )}
             </div>

             <div className="flex gap-3 pt-2">
               <Button variant="secondary" fullWidth onClick={() => setMovStep(1)}>← Editar</Button>
               <Button 
                 fullWidth 
                 onClick={handleConfirmMovement} 
                 disabled={isSubmitting}
                 className={movPreview.status === 'ERROR_INSUFFICIENT' ? 'bg-rose-600 hover:bg-rose-700' : ''}
               >
                 {isSubmitting ? 'Enviando...' : (movPreview.status === 'ERROR_INSUFFICIENT' ? 'Confirmar de todas formas' : '✅ Confirmar envío')}
               </Button>
             </div>
           </div>
         )}
         {movStep === 3 && (
           <div className="py-8 flex flex-col items-center text-center space-y-4">
             <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
               <span className="text-4xl">✅</span>
             </div>
             <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">¡Movimiento registrado exitosamente!</h3>
             <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 w-full text-left text-xs text-slate-600 space-y-1">
               <p><strong>Tipo:</strong> {movForm.type}</p>
               <p><strong>Producto:</strong> {movForm.reference}</p>
               <p><strong>Cantidad:</strong> {movForm.quantity} UND</p>
               <p><strong>Sede:</strong> {movPreview?.sedeTarget}</p>
               <p><strong>Hora:</strong> {new Date().toLocaleTimeString()}</p>
             </div>
             <div className="flex gap-3 w-full pt-4">
               <Button variant="secondary" fullWidth onClick={() => { setMovStep(1); setMovForm({ reference: '', quantity: 1, type: 'SALIDA', destSede: '', notes: '' }); }}>Registrar otro</Button>
               <Button fullWidth onClick={() => { setIsMovModalOpen(false); setMovStep(1); setMovForm({ reference: '', quantity: 1, type: 'SALIDA', destSede: '', notes: '' }); }}>Cerrar</Button>
             </div>
           </div>
         )}
      </Modal>

      <Modal isOpen={isIngresoModalOpen} onClose={() => { setIsIngresoModalOpen(false); setIngresoStep(1); setIngresoForm(INITIAL_INGRESO_STATE); }} title="✨ NUEVO INGRESO">
        {ingresoStep === 1 && (
          <div className="space-y-4">
            <div>
              <ReferenceSearch 
                value={ingresoForm.referencia} 
                onChange={(ref, prod) => {
                  setIngresoForm(prev => {
                    const newState = { ...prev, referencia: ref };
                    if (prod) {
                      newState.nombre = prod.nombre;
                      newState.categoria = prod.tipo;
                      newState.costo_unitario = prod.precioCosto || 0;
                      newState.precio_venta = prod.precioVenta || 0;
                    }
                    return newState;
                  });
                }}
                productos={filteredData}
                allowNew={true}
              />
              {rawProducts.some(p => p.referencia === ingresoForm.referencia) && (
                <div className="mt-2 text-[10px] font-bold text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  ⚠️ Esta referencia ya existe. Se actualizará el stock del producto.
                </div>
              )}
            </div>
            <Input label="Nombre / Descripción" value={ingresoForm.nombre} onChange={e => setIngresoForm({...ingresoForm, nombre: e.target.value})} />
            <Select 
              label="Categoría" 
              value={ingresoForm.categoria} 
              onChange={e => setIngresoForm({...ingresoForm, categoria: e.target.value})} 
              options={[{value: '', label: 'Seleccionar...'}, ...PRODUCT_CATEGORIES.map(c => ({value: c, label: c}))]} 
            />
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
            <Button fullWidth onClick={handleReviewIngreso}>Previsualizar ingreso</Button>
          </div>
        )}
        {ingresoStep === 2 && ingresoPreview && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Resumen del Ingreso</h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <p>Referencia: <span className="font-black">{ingresoForm.referencia}</span></p>
                <p>Nombre: <span className="font-black">{ingresoForm.nombre}</span></p>
                <p>Categoría: <span className="font-black">{ingresoForm.categoria}</span></p>
                <p>Cantidad: <span className="font-black">{ingresoForm.cantidad} UND</span></p>
                <p>Costo: <span className="font-black">${ingresoForm.costo_unitario}</span></p>
                <p>Venta: <span className="font-black">${ingresoForm.precio_venta}</span></p>
                <p>Sede: <span className="font-black">{ingresoPreview.sedeTarget}</span></p>
              </div>
              {ingresoForm.imagen && <p className="text-xs text-emerald-600 font-black mt-2">✅ Imagen adjunta</p>}
            </div>

            {ingresoPreview.productExists && (
              <div className="flex items-center gap-2 text-amber-600 text-xs font-black bg-amber-50 p-3 rounded-xl border border-amber-200">
                ⚠️ Referencia duplicada: esto actualizará el producto existente o podría crear un duplicado.
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setIngresoStep(1)}>← Editar</Button>
              <Button fullWidth onClick={handleConfirmIngreso} disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : '✅ Confirmar envío'}
              </Button>
            </div>
          </div>
        )}
        {ingresoStep === 3 && (
          <div className="py-8 flex flex-col items-center text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
              <span className="text-4xl">✅</span>
            </div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">¡Ingreso registrado exitosamente!</h3>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 w-full text-left text-xs text-slate-600 space-y-1">
              <p><strong>Referencia:</strong> {ingresoForm.referencia}</p>
              <p><strong>Cantidad:</strong> {ingresoForm.cantidad} UND</p>
              <p><strong>Sede:</strong> {ingresoPreview?.sedeTarget}</p>
            </div>
            <div className="flex gap-3 w-full pt-4">
              <Button variant="secondary" fullWidth onClick={() => { setIngresoStep(1); setIngresoForm(INITIAL_INGRESO_STATE); }}>Registrar otro</Button>
              <Button fullWidth onClick={() => { setIsIngresoModalOpen(false); setIngresoStep(1); setIngresoForm(INITIAL_INGRESO_STATE); }}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={isUserModalOpen} onClose={() => setIsUserModalOpen(false)} title="👥 GESTIÓN DE USUARIOS">
        <div className="flex gap-4 border-b border-slate-100 mb-6">
          <button onClick={() => setUserModalTab('create')} className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-colors ${userModalTab === 'create' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400'}`}>➕ Crear Usuario</button>
          <button onClick={() => setUserModalTab('view')} className={`pb-2 text-[10px] font-black uppercase tracking-widest transition-colors ${userModalTab === 'view' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-400'}`}>👥 Ver Usuarios</button>
        </div>

        {userModalTab === 'create' ? (
          <div className="space-y-4">
            <Input label="Nombre Completo" value={userForm.nombre} onChange={e => setUserForm({...userForm, nombre: e.target.value})} placeholder="Ej: Juan Perez" />
            <Input label="Usuario (Login)" value={userForm.correo} onChange={e => setUserForm({...userForm, correo: e.target.value.toLowerCase()})} placeholder="Ej: juanperez" />
            <div className="relative">
              <Input label="Contraseña" type={showPassword ? "text" : "password"} value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-8 text-slate-400 text-xs uppercase font-bold">{showPassword ? 'Ocultar' : 'Mostrar'}</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Select label="Perfil" value={userForm.perfil} onChange={e => setUserForm({...userForm, perfil: e.target.value as any})} options={[{value:'OPERADOR', label:'Operador'}, {value:'GERENTE', label:'Gerente'}]} />
              <Select label="Sede Base" value={userForm.sede} onChange={e => setUserForm({...userForm, sede: e.target.value as any})} options={SEDES.map(s => ({value: s.id, label: s.name.replace(/^[0-9]\.\s*/, '')}))} />
            </div>
            <Button fullWidth onClick={handleCreateUser} disabled={isSubmitting}>{isSubmitting ? 'Creando...' : 'Crear Usuario'}</Button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b bg-slate-50/50">
                  <th className="px-4 py-3">Nombre</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Sede</th>
                  <th className="px-4 py-3">Perfil</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rawUsers.map((u, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700">{u.nombre}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{u.usuario}</td>
                    <td className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase">{u.sede}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase ${u.perfil === 'GERENTE' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>
                        {u.perfil}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            {reportData.recomendaciones && reportData.recomendaciones.length > 0 && (
              <div className="bg-slate-900 p-6 rounded-2xl text-white">
                <h5 className="font-black text-[10px] uppercase tracking-widest text-indigo-300 mb-4">Recomendaciones Estratégicas</h5>
                <ol className="list-decimal pl-4 space-y-2 text-xs font-medium text-slate-300">
                  {reportData.recomendaciones.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
