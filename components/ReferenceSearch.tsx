import React, { useState, useEffect, useRef } from 'react';

interface ProductoSugerido {
  referencia: string;
  nombre: string;
  tipo: string;
  stockReal?: number;
  stockMinimo?: number;
  precioCosto?: number;
  precioVenta?: number;
}

interface ReferenceSearchProps {
  value: string;
  onChange: (referencia: string, producto?: ProductoSugerido) => void;
  productos: any[];
  placeholder?: string;
  label?: string;
  allowNew?: boolean;
}

export const ReferenceSearch: React.FC<ReferenceSearchProps> = ({
  value,
  onChange,
  productos,
  placeholder = "Buscar referencia...",
  label = "Referencia",
  allowNew = false,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<ProductoSugerido[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductoSugerido | null>(null);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Sync with external value changes (e.g. QR scanner)
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Search and Validation Logic
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!inputValue.trim()) {
        setSuggestions([]);
        setShowDropdown(false);
        setIsValid(null);
        setSelectedProduct(null);
        return;
      }

      const term = inputValue.toUpperCase();
      
      // Validation: Check for exact match
      const exactMatch = productos.find(p => p.referencia.toUpperCase() === term);
      if (exactMatch) {
        setIsValid(true);
        setSelectedProduct(exactMatch);
        // Notify parent of exact match with product data (safe to call due to debounce and ref)
        onChangeRef.current(term, exactMatch);
      } else {
        setIsValid(false);
        setSelectedProduct(null);
        // We don't call onChange here to avoid overriding user input with "undefined" product if they are just typing
        // But handleInputChange already called it with undefined.
      }

      // Search Suggestions
      const results = productos.filter(p => 
        p.referencia.toUpperCase().includes(term) ||
        p.nombre.toUpperCase().includes(term) ||
        p.tipo.toUpperCase().includes(term)
      ).slice(0, 6);

      setSuggestions(results);
      
      if (results.length > 0) {
          setShowDropdown(true);
      } else {
          setShowDropdown(false);
      }

    }, 150);

    return () => clearTimeout(timer);
  }, [inputValue, productos]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputValue(text);
    onChange(text, undefined); // Update parent immediately
    setShowDropdown(true);
  };

  const handleSelect = (product: ProductoSugerido) => {
    setInputValue(product.referencia);
    setSuggestions([]);
    setShowDropdown(false);
    setIsValid(true);
    setSelectedProduct(product);
    onChange(product.referencia, product);
  };

  // Determine border color
  let borderColor = "border-slate-200 focus:border-indigo-500";
  if (isValid === true) {
    borderColor = "border-emerald-400 focus:border-emerald-500";
  } else if (isValid === false) {
    borderColor = allowNew ? "border-amber-400 focus:border-amber-500" : "border-rose-400 focus:border-rose-500";
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => inputValue && setShowDropdown(true)}
          placeholder={placeholder}
          className={`block w-full px-4 py-3 rounded-xl border ${borderColor} text-xs font-medium focus:ring-0 outline-none transition-colors uppercase`}
        />
        {isValid === true && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
            ✅
          </div>
        )}
      </div>

      {/* Validation Messages */}
      {isValid === false && inputValue && (
        <div className={`mt-1 text-[10px] font-bold ${allowNew ? 'text-amber-600' : 'text-rose-600'}`}>
          {allowNew 
            ? "⚠️ Producto nuevo — se creará en el maestro al guardar." 
            : "⚠️ Referencia no encontrada en el maestro de productos."}
        </div>
      )}

      {/* Stock Info for Movimiento Modal */}
      {!allowNew && isValid === true && selectedProduct && (
        <div className={`mt-1 text-[10px] font-bold ${
          (selectedProduct.stockReal || 0) > (selectedProduct.stockMinimo || 0) 
            ? 'text-emerald-600' 
            : 'text-rose-600'
        }`}>
          📦 {selectedProduct.nombre} · Stock: {selectedProduct.stockReal || 0} UND
        </div>
      )}

      {/* Dropdown Suggestions */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((product, idx) => (
            <div
              key={idx}
              onClick={() => handleSelect(product)}
              className="p-3 border-b border-slate-50 hover:bg-indigo-50 cursor-pointer transition-colors flex justify-between items-center"
            >
              <div>
                <p className="text-[11px] font-black text-indigo-600">{product.referencia}</p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{product.nombre}</p>
              </div>
              <div className="text-right">
                <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black ${
                  (product.stockReal || 0) > (product.stockMinimo || 0) 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {product.stockReal || 0} UND
                </span>
                <p className="text-[9px] text-slate-400 mt-0.5 uppercase">{product.tipo}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
