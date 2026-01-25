

export type SedeId = 'taller' | 'country' | 'plaza_sol' | 'portal_prado' | 'centro';
export type UserRole = 'OPERADOR' | 'GERENTE';
export type MovementType = 'ENTRADA' | 'SALIDA' | 'TRASLADO' | 'AJUSTE';

export interface Sede {
  id: SedeId;
  name: string;
}

export interface MaestroProducto {
  Codigo: string;       // Antes Referencia
  Descripcion: string;  // Antes Nombre
  Categoria: string;    // Antes Tipo
  Costo: number;
  Venta: number;        // Antes Precio_Venta
  Activo: string;       // "SI" o "NO"
  Stock_Minimo: number;
}

// Added Movement interface to fix import errors in storageService.ts
export interface Movement {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  sedeId: SedeId;
  reference: string;
  type: string;
  movementType: MovementType;
  quantity: number;
  cost: number;
  salePrice: number;
  margin: number;
  notes: string;
}

export interface LogMovimiento {
  Fecha: string;
  Operador: string;
  Tipo: string;         // ENTRADA / SALIDA / TRASLADO
  Codigo: string;
  Cantidad: number;
  Bodega: string;       // Sede Origen
  Destino: string;      // Sede Destino (opcional)
  Observaciones: string;
}

export interface ProductStock extends MaestroProducto {
  Stock_Actual: number;
  SedeId: SedeId;
}

export interface User {
  id: string;
  username: string;
  sedeId: SedeId;
  role: UserRole;
  name: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}