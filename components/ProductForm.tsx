

import React, { useState, useEffect } from 'react';
import { MaestroProducto, SedeId } from '../types';
import { Input, Button } from './UI';

interface ProductFormProps {
  // Fixed: Changed non-existent Product type to MaestroProducto
  onSubmit: (data: MaestroProducto) => void;
  initialData?: MaestroProducto | null;
  onCancel: () => void;
}

export const ProductForm: React.FC<ProductFormProps> = ({ onSubmit, initialData, onCancel }) => {
  // Fixed: Aligned initial state with correct MaestroProducto interface fields
  const [formData, setFormData] = useState<MaestroProducto>({
    Codigo: '',
    Descripcion: '',
    Categoria: '',
    Costo: 0,
    Venta: 0,
    Activo: 'SI',
    Stock_Minimo: 5,
  });

  useEffect(() => {
    if (initialData) {
      setFormData({
        Codigo: initialData.Codigo,
        Descripcion: initialData.Descripcion,
        Categoria: initialData.Categoria,
        Costo: initialData.Costo,
        Venta: initialData.Venta,
        Activo: initialData.Activo,
        Stock_Minimo: initialData.Stock_Minimo,
      });
    }
  }, [initialData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input 
        label="Referencia / SKU" 
        name="Codigo" 
        value={formData.Codigo} 
        onChange={handleChange} 
        required 
        placeholder="Eje: PROD-123"
      />
      <Input 
        label="Nombre del Producto" 
        name="Descripcion" 
        value={formData.Descripcion} 
        onChange={handleChange} 
        required 
        placeholder="Eje: Vestido de Gala"
      />
      <Input 
        label="Tipo / Categoría" 
        name="Categoria" 
        value={formData.Categoria} 
        onChange={handleChange} 
        required 
        placeholder="Eje: Vestidos"
      />
      <div className="grid grid-cols-3 gap-3">
        <Input 
          label="Stock Mínimo" 
          name="Stock_Minimo" 
          type="number" 
          value={formData.Stock_Minimo} 
          onChange={handleChange} 
          required 
          min="0"
        />
        <Input 
          label="Costo ($)" 
          name="Costo" 
          type="number" 
          value={formData.Costo} 
          onChange={handleChange} 
          required 
          min="0"
        />
        <Input 
          label="Venta ($)" 
          name="Venta" 
          type="number" 
          value={formData.Venta} 
          onChange={handleChange} 
          required 
          min="0"
        />
      </div>
      <div className="flex gap-3 mt-4">
        <Button type="button" variant="secondary" fullWidth onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" fullWidth>{initialData ? 'Actualizar' : 'Crear Producto'}</Button>
      </div>
    </form>
  );
};