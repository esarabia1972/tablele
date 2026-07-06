"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import { getConfig, saveConfig, clearSessionData, ConfigTablero } from "@/lib/storage";
import { PALABRAS_DEFAULT, SUGERENCIAS_EMOJI, PalabraDefault } from "@/data/palabras-default";

export default function ConfigPage() {
  const router = useRouter();
  const [config, setConfig] = useState<ConfigTablero | null>(null);

  useEffect(() => {
    setConfig(getConfig());
  }, []);

  const handleWordChange = (letra: string, newValue: string) => {
    if (!config) return;
    const newPalabras = config.palabras.map((p) => {
      if (p.letra === letra) {
        // Auto-suggest emoji if it matches dictionary
        const suggestion = SUGERENCIAS_EMOJI[newValue.toLowerCase()];
        return { 
          ...p, 
          palabra: newValue,
          emoji: suggestion ? suggestion : p.emoji 
        };
      }
      return p;
    });
    const newConfig = { ...config, palabras: newPalabras };
    setConfig(newConfig);
  };

  const handleEmojiChange = (letra: string, newValue: string) => {
    if (!config) return;
    const newPalabras = config.palabras.map((p) => 
      p.letra === letra ? { ...p, emoji: newValue } : p
    );
    setConfig({ ...config, palabras: newPalabras });
  };

  const handleUsarChange = (letra: string, usar: boolean) => {
    if (!config) return;
    const newPalabras = config.palabras.map((p) => 
      p.letra === letra ? { ...p, usar } : p
    );
    setConfig({ ...config, palabras: newPalabras });
  };

  const handleSave = () => {
    if (config) {
      saveConfig(config);
      router.push("/jugar");
    }
  };

  const handleRestore = () => {
    const newConfig = { ...config!, palabras: PALABRAS_DEFAULT };
    setConfig(newConfig);
  };

  const handleLogout = () => {
    clearSessionData();
    router.push("/");
  };

  if (!config) return null; // loading state

  return (
    <>
      <TopBar backTo="/jugar" />
      <div className="flex-1 flex flex-col items-center w-full max-w-[1100px] px-4 pb-12 mt-[2vh]">
        
        <div className="flex gap-4 w-full mb-8">
          <button
            onClick={() => router.push("/config/informe")}
            className="flex-1 bg-brand-blue text-white border-none rounded-[22px] py-3 text-lg font-bold shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none"
          >
            Ver Informe
          </button>
          
          <button
            onClick={handleSave}
            className="flex-1 bg-brand-green text-white border-none rounded-[22px] py-3 text-lg font-bold shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none"
          >
            Guardar
          </button>
        </div>

        <h1 className="text-brand-dark text-[2rem] font-bold text-center mb-6">
          Configuración
        </h1>

        <div className="bg-white/80 rounded-[26px] p-6 shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full mb-6">
          <div className="mb-4">
            <label className="block text-brand-blue font-bold mb-1">Nombre del niño/a</label>
            <input
              type="text"
              value={config.nombre ?? ""}
              onChange={(e) => setConfig({ ...config, nombre: e.target.value })}
              placeholder="Manu"
              className="w-full p-3 rounded-xl border-2 border-brand-blue/20 outline-none focus:border-brand-blue bg-white text-brand-dark font-bold"
            />
            <p className="text-sm text-gray-500 mt-1">Se usa en los mensajes de aliento de los juegos.</p>
          </div>
          <div className="mb-4">
            <label className="block text-brand-blue font-bold mb-1">Método</label>
            <select 
              value={config.metodo} 
              disabled
              className="w-full p-3 rounded-xl border-2 border-brand-blue/20 bg-gray-50 outline-none text-brand-dark font-bold opacity-80"
            >
              <option value="SELEC">SELEC (Etapa Global)</option>
            </select>
          </div>
          <div className="mb-2">
            <label className="block text-brand-blue font-bold mb-1">Nivel</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="nivel" value="Global" checked readOnly className="w-5 h-5 accent-brand-blue" />
                <span className="font-bold text-brand-dark">Global</span>
              </label>
              <label className="flex items-center gap-2 opacity-50 cursor-not-allowed" title="Próximamente">
                <input type="radio" name="nivel" value="Silabica" disabled className="w-5 h-5" />
                <span className="font-bold text-gray-500">Silábica (próximamente)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white/80 rounded-[26px] p-4 shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full overflow-hidden">
          <h2 className="text-brand-blue text-xl font-bold mb-4 text-center">Palabras (una por letra)</h2>
          
          <div>
            <div className="grid grid-cols-1 lg:grid-cols-3 md:grid-cols-2 gap-3">
              {config.palabras.map((p) => (
                <div key={p.letra} className="flex items-center gap-1.5 bg-white p-2 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="w-6 font-bold text-lg text-center text-brand-blue uppercase shrink-0">{p.letra}</div>
                  <input
                    type="text"
                    value={p.palabra}
                    onChange={(e) => handleWordChange(p.letra, e.target.value.toLowerCase())}
                    className="flex-1 min-w-0 p-1.5 rounded-lg border-2 border-brand-blue/10 outline-none focus:border-brand-blue text-[0.95rem]"
                    placeholder="palabra"
                  />
                  <input
                    type="text"
                    value={p.emoji}
                    onChange={(e) => handleEmojiChange(p.letra, e.target.value)}
                    className="w-10 shrink-0 text-center text-[1.1rem] p-1.5 rounded-lg border-2 border-brand-blue/10 outline-none focus:border-brand-blue"
                    maxLength={2}
                  />
                  <label className="flex items-center gap-1 cursor-pointer shrink-0">
                    <input 
                      type="checkbox" 
                      checked={p.usar}
                      onChange={(e) => handleUsarChange(p.letra, e.target.checked)}
                      className="w-4 h-4 accent-brand-green"
                    />
                    <span className="text-[0.65rem] text-gray-500 font-bold uppercase tracking-wider">Usar</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="w-full mt-8 bg-gray-200 text-gray-600 border-none rounded-xl p-3 text-[1rem] font-bold cursor-pointer transition-transform active:translate-y-1"
        >
          Salir (cambiar usuario)
        </button>
      </div>
    </>
  );
}
