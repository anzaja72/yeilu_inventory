

import { Movement, ProductStock, SedeId, MovementType } from '../types';
import { STORAGE_KEYS } from '../constants';

// Simulamos latencia de red para preparar la UX para Supabase
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export const getMovements = async (): Promise<Movement[]> => {
  await delay(200);
  const data = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
  return data ? JSON.parse(data) : [];
};

export const registerMovement = async (movement: Movement): Promise<void> => {
  await delay(300);
  const movements = await getMovements();
  movements.push({ ...movement, timestamp: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(movements));
};

export const calculateStock = async (sedeId?: SedeId): Promise<ProductStock[]> => {
  const movements = await getMovements();
  const filteredMovements = sedeId ? movements.filter(m => m.sedeId === sedeId) : movements;
  
  const stockMap: Record<string, ProductStock> = {};

  filteredMovements.forEach(m => {
    const key = `${m.reference}_${m.sedeId}`;
    if (!stockMap[key]) {
      // Fixed: mapping movement fields to the PascalCase properties defined in MaestroProducto/ProductStock
      stockMap[key] = {
        Codigo: m.reference,
        Descripcion: 'Producto Desconocido',
        Categoria: m.type,
        Costo: m.cost,
        Venta: m.salePrice,
        Activo: 'SI',
        Stock_Minimo: 0,
        Stock_Actual: 0,
        SedeId: m.sedeId
      };
    }

    if (m.movementType === 'ENTRADA' || m.movementType === 'AJUSTE') {
      stockMap[key].Stock_Actual += m.quantity;
    } else if (m.movementType === 'SALIDA') {
      stockMap[key].Stock_Actual -= m.quantity;
    }
    
    stockMap[key].Costo = m.cost;
    stockMap[key].Venta = m.salePrice;
  });

  return Object.values(stockMap);
};

export const executeTransfer = async (
  userId: string, 
  username: string,
  reference: string, 
  type: string,
  quantity: number, 
  originSede: SedeId, 
  destSede: SedeId,
  cost: number,
  salePrice: number
): Promise<void> => {
  // 1. Salida de Origen
  await registerMovement({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    userId,
    username,
    sedeId: originSede,
    reference,
    type,
    movementType: 'SALIDA',
    quantity,
    cost,
    salePrice,
    margin: salePrice - cost,
    notes: `Traslado hacia ${destSede}`
  });

  // 2. Entrada en Destino
  await registerMovement({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    userId,
    username,
    sedeId: destSede,
    reference,
    type,
    movementType: 'ENTRADA',
    quantity,
    cost,
    salePrice,
    margin: salePrice - cost,
    notes: `Traslado recibido desde ${originSede}`
  });
};