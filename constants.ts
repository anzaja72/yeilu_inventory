
import { Sede } from './types';

/**
 * CONFIGURACIÓN n8n
 */
export const N8N_WEBHOOKS = {
  CONSULTA_GLOBAL: 'https://icad-n8n.ltubgr.easypanel.host/webhook/api/consulta-inventario',
  REGISTRO_MOVIMIENTO: 'https://icad-n8n.ltubgr.easypanel.host/webhook/api/movimiento',
  GESTION_MAESTRO: 'https://icad-n8n.ltubgr.easypanel.host/webhook/api/producto-nuevo',
  PRODUCTO_CON_IMAGEN: 'https://icad-n8n.ltubgr.easypanel.host/webhook/api/producto-con-imagen',
  CREAR_USUARIO: 'https://icad-n8n.ltubgr.easypanel.host/webhook/api/crear-usuario',
  INFORME_IA: 'https://icad-n8n.ltubgr.easypanel.host/webhook/692386ed-2848-4323-a6d4-1f2f7a5f0349'
};

export const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzYf1o2Q0DNm2hGPksEYP8GQ5nOhVRt48mnDp41n6igS5mdq3uezQA40BRQWvIYjQlVnA/exec';

export const SEDES: Sede[] = [
  { id: 'taller', name: '1. Taller' },
  { id: 'country', name: '2. Country' },
  { id: 'plaza_sol', name: '3. Plaza del Sol' },
  { id: 'portal_prado', name: '4. Portal del Prado' },
  { id: 'centro', name: '5. Centro' }
];

export const PRODUCT_CATEGORIES = [
  'Vestidos',
  'Blusas / Tops',
  'Pantalones / Jeans',
  'Faldas',
  'Chaquetas / Abrigos',
  'Calzado',
  'Accesorios',
  'Lencería / Intima',
  'Vestidos de Baño'
];

export const STORAGE_KEYS = {
  AUTH: 'yeilu_auth_state',
  CACHED_DATA: 'yeilu_cached_data',
  MOVEMENTS: 'yeilu_movements_data'
};
