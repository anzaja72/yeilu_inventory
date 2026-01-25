
import React, { useEffect, useState, useRef } from 'react';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({ onScan, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const scannerRef = useRef<any>(null);

  const startScanner = async () => {
    setIsInitializing(true);
    setError(null);

    try {
      // 1. Verificar contexto seguro (HTTPS o localhost)
      if (!window.isSecureContext) {
        throw new Error("La cámara solo está disponible en sitios seguros (HTTPS).");
      }

      // 2. Verificar disponibilidad de dispositivos
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Tu navegador no soporta el acceso a la cámara.");
      }

      const html5QrCode = new (window as any).Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const config = { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      };

      await html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        (decodedText: string) => {
          onScan(decodedText);
          stopScanner();
        },
        () => {
          // Callback de error de escaneo silencioso (no es error de cámara)
        }
      );
      
      setIsInitializing(false);
    } catch (err: any) {
      console.error("Error QR:", err);
      setIsInitializing(false);
      
      const errorMsg = err?.toString() || "";
      if (errorMsg.includes("NotAllowedError") || errorMsg.includes("Permission denied")) {
        setError("Acceso Denegado: Debes permitir el uso de la cámara en la barra de direcciones del navegador (haz clic en el icono del candado o la cámara).");
      } else if (errorMsg.includes("NotFoundError")) {
        setError("No se detectó ninguna cámara en este dispositivo.");
      } else if (errorMsg.includes("NotReadableError")) {
        setError("La cámara está siendo usada por otra aplicación.");
      } else {
        setError(err.message || "Error desconocido al iniciar la cámara.");
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (e) {
        console.error("Error stopping scanner", e);
      }
    }
  };

  useEffect(() => {
    startScanner();
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] overflow-hidden relative shadow-2xl border border-white/10">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 z-[70] bg-slate-900/60 hover:bg-slate-900 text-white p-3 rounded-full transition-all active:scale-95"
          aria-label="Cerrar escáner"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>

        <div className="relative">
          <div id="reader" className="w-full aspect-square bg-slate-900 overflow-hidden"></div>
          
          {isInitializing && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-white">
              <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-60">Iniciando Cámara...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
              <div className="bg-rose-100 text-rose-600 p-5 rounded-3xl mb-6">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter mb-3">Permiso Requerido</h4>
              <p className="text-xs text-slate-500 mb-8 leading-relaxed font-medium px-4">{error}</p>
              
              <div className="flex flex-col gap-3 w-full">
                <button 
                  onClick={startScanner} 
                  className="bg-indigo-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95"
                >
                  Intentar de nuevo
                </button>
                <button 
                  onClick={() => window.location.reload()} 
                  className="bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95"
                >
                  Recargar Aplicación
                </button>
              </div>
            </div>
          )}
        </div>

        {!error && !isInitializing && (
          <div className="p-8 text-center bg-white border-t border-slate-50 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-progress origin-left"></div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Escáner de Referencia</h3>
            <p className="text-[9px] font-bold text-slate-400 mt-2 uppercase tracking-tight">Centra el código QR en el recuadro para detectar el producto</p>
          </div>
        )}
      </div>
    </div>
  );
};
