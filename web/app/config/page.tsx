"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/TopBar";
import {
  getConfig,
  saveConfig,
  clearSessionData,
  getSessionData,
  getCuenta,
  salirDeCuenta,
  limpiarDatosLocales,
  ConfigTablero,
  NIVEL_SILABICA,
  esNivelSilabica,
} from "@/lib/storage";
import { syncFromServer, flushPush, cerrarSesionSync } from "@/lib/sync";
import { palabrasDefault, SUGERENCIAS_EMOJI } from "@/data/palabras-default";
import { esElegibleSilabas } from "@/lib/silabas";

// Reduce la foto a 512px máx. y la devuelve como JPEG base64
async function comprimirImagen(file: File, max = 512): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ConfigPage() {
  const router = useRouter();
  const [config, setConfig] = useState<ConfigTablero | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null); // letra en proceso
  const [guardando, setGuardando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [usuario, setUsuario] = useState("");
  const [cuentaId, setCuentaId] = useState("");
  const [cuentaEmail, setCuentaEmail] = useState("");
  // Candado adulto para cambiar de cuenta: la misma suma de dos dígitos que
  // protege el borrado del historial.
  const [cambioOpen, setCambioOpen] = useState(false);
  const [pregunta, setPregunta] = useState({ a: 2, b: 3 });
  const [resp, setResp] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const letraFotoRef = useRef<string>("");

  useEffect(() => {
    const s = getSessionData();
    // Sin sesión no se entra: antes esta pantalla leía y escribía en la clave
    // compartida sin usuario, y esa config terminaba siendo de otro chico.
    if (!s) {
      router.replace("/");
      return;
    }
    (async () => {
      setUsuario(s.username);
      setCuentaId(s.accountId);
      setCuentaEmail(getCuenta()?.email ?? "");
      await syncFromServer(s.accountId, s.username);
      setConfig(getConfig());
    })();
  }, [router]);

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

  const elegirFoto = (letra: string) => {
    letraFotoRef.current = letra;
    fileRef.current?.click();
  };

  const handleFotoElegida = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const letra = letraFotoRef.current;
    if (!file || !letra || !config) return;

    const s = getSessionData();
    if (!s) return;

    setSubiendo(letra);
    try {
      const dataUrl = await comprimirImagen(file);
      const res = await fetch("/api/foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: s.accountId, username: s.username, dataUrl }),
      });
      const data = await res.json();
      if (data.ok && data.url) {
        setConfig((c) =>
          c
            ? {
                ...c,
                palabras: c.palabras.map((p) =>
                  p.letra === letra ? { ...p, foto: data.url } : p
                ),
              }
            : c
        );
      } else {
        alert("No se pudo subir la foto" + (data.message ? `: ${data.message}` : ""));
      }
    } catch {
      alert("No se pudo subir la foto");
    } finally {
      setSubiendo(null);
    }
  };

  const quitarFoto = (letra: string) => {
    if (!config) return;
    setConfig({
      ...config,
      palabras: config.palabras.map((p) =>
        p.letra === letra ? { ...p, foto: undefined } : p
      ),
    });
  };

  const handleUsarChange = (letra: string, usar: boolean) => {
    if (!config) return;
    const newPalabras = config.palabras.map((p) => 
      p.letra === letra ? { ...p, usar } : p
    );
    setConfig({ ...config, palabras: newPalabras });
  };

  const handleSave = async () => {
    if (!config || guardando) return;
    setGuardando(true);
    setAviso("");
    saveConfig(config); // local primero: nunca se pierde lo que el adulto escribió
    try {
      await flushPush(); // subir al servidor antes de salir
      router.push("/jugar");
    } catch {
      // El guardado local YA está hecho; lo que falló es la sincronización.
      setAviso(
        "Se guardó en esta tablet, pero no se pudo sincronizar con el servidor. " +
          "Revisá la conexión: se va a reintentar solo."
      );
    } finally {
      setGuardando(false);
    }
  };

  const handleRestore = () => {
    setConfig({ ...config!, palabras: palabrasDefault() });
  };

  const handleLogout = async () => {
    if (saliendo) return;
    setSaliendo(true);
    setAviso("");
    // Sube lo pendiente bajo el username de ESTE chico antes de soltar la sesión.
    const aSalvo = await cerrarSesionSync();
    if (!aSalvo) {
      // Algo no llegó al servidor: no se sale ni se borra nada, porque al
      // volver a entrar eso no se podría recuperar.
      setAviso(
        "Todavía hay cambios sin subir. Revisá la conexión y probá de nuevo en un momento."
      );
      setSaliendo(false);
      return;
    }
    // Ya está todo en el servidor: la tablet queda limpia y al volver a entrar
    // se baja de nuevo.
    if (cuentaId && usuario) limpiarDatosLocales(cuentaId, usuario);
    clearSessionData();
    router.push("/");
  };

  const abrirCambioDeCuenta = () => {
    setPregunta({
      a: 1 + Math.floor(Math.random() * 9),
      b: 1 + Math.floor(Math.random() * 9),
    });
    setResp("");
    setCambioOpen(true);
  };

  const respuestaOk = parseInt(resp) === pregunta.a + pregunta.b;

  const cambiarDeCuenta = async () => {
    if (!respuestaOk) return;
    // Sube lo pendiente antes de soltar todo. Si no llegó, no se borra nada.
    const aSalvo = await cerrarSesionSync();
    if (!aSalvo) {
      setCambioOpen(false);
      setAviso(
        "Todavía hay cambios sin subir. Revisá la conexión y probá de nuevo en un momento."
      );
      return;
    }
    salirDeCuenta();
    router.push("/");
  };

  if (!config) return null; // loading state

  // Palabras activas con más de una sílaba: son las únicas jugables en "Armo la palabra".
  // F6: esElegibleSilabas() es la misma función que usan GameEngine y app/jugar,
  // así el override manual de p.silabas se respeta igual en los tres lugares.
  const palabrasElegiblesSilabas = config.palabras.filter(
    (p) => p.usar && esElegibleSilabas(p)
  );

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFotoElegida}
      />
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
            disabled={guardando}
            className="flex-1 bg-brand-green text-white border-none rounded-[22px] py-3 text-lg font-bold shadow-[0_5px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 active:shadow-none disabled:opacity-60"
          >
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </div>

        {aviso && (
          <div className="w-full mb-6 bg-brand-orange/15 border-2 border-brand-orange/40 text-brand-dark rounded-[18px] p-4 text-center font-bold">
            {aviso}
          </div>
        )}

        <h1 className="text-brand-dark text-[2rem] font-bold text-center mb-1">
          Configuración
        </h1>
        <p className="text-brand-blue text-center mb-6">
          Usuario: <b>{usuario}</b>
        </p>

        <div className="bg-white/80 rounded-[26px] p-6 shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full mb-6">
          <div className="mb-4">
            <label className="block text-brand-blue font-bold mb-1">Nombre del niño/a</label>
            <input
              type="text"
              value={config.nombre ?? ""}
              onChange={(e) => setConfig({ ...config, nombre: e.target.value })}
              placeholder="escribí el nombre"
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
          <div className="mb-4">
            <label className="block text-brand-blue font-bold mb-1">Etapa</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nivel"
                  value="Global"
                  checked={!esNivelSilabica(config.nivel)}
                  onChange={() => setConfig({ ...config, nivel: "Global" })}
                  className="w-5 h-5 accent-brand-blue"
                />
                <span className="font-bold text-brand-dark">Global</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nivel"
                  value={NIVEL_SILABICA}
                  checked={esNivelSilabica(config.nivel)}
                  onChange={() => setConfig({ ...config, nivel: NIVEL_SILABICA })}
                  className="w-5 h-5 accent-brand-blue"
                />
                <span className="font-bold text-brand-dark">Silábica</span>
              </label>
            </div>
            {esNivelSilabica(config.nivel) && palabrasElegiblesSilabas.length < 2 && (
              <p className="text-sm text-brand-pink mt-1.5">
                Activá al menos 2 palabras de más de una sílaba para poder jugar &quot;Armo la palabra&quot;.
              </p>
            )}
          </div>
          <div className="mb-2">
            <label className="block text-brand-blue font-bold mb-1">Nivel</label>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nivelPalabra"
                  checked={config.nivelPalabra === "inicial"}
                  onChange={() => setConfig({ ...config, nivelPalabra: "inicial" })}
                  className="w-5 h-5 accent-brand-blue"
                />
                <span className="font-bold text-brand-dark">
                  Inicial <span className="font-normal text-gray-500">(solo la primera letra)</span>
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="nivelPalabra"
                  checked={config.nivelPalabra !== "inicial"}
                  onChange={() => setConfig({ ...config, nivelPalabra: "intermedio" })}
                  className="w-5 h-5 accent-brand-blue"
                />
                <span className="font-bold text-brand-dark">
                  Intermedio <span className="font-normal text-gray-500">(palabra completa)</span>
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-white/80 rounded-[26px] p-4 shadow-[0_6px_0_rgba(0,0,0,0.12)] w-full overflow-hidden">
          <h2 className="text-brand-blue text-xl font-bold mb-1 text-center">Palabras (una por letra)</h2>
          <div className="flex justify-center mb-4">
            <button
              onClick={handleRestore}
              className="text-brand-blue text-sm font-bold underline underline-offset-2 opacity-80 hover:opacity-100 py-1 px-2"
            >
              Restaurar las palabras por defecto
            </button>
          </div>
          
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
                  {p.foto ? (
                    <div className="relative shrink-0">
                      <img
                        src={p.foto}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                      />
                      <button
                        onClick={() => quitarFoto(p.letra)}
                        title="Quitar foto (vuelve al emoji)"
                        className="absolute -top-1.5 -right-1.5 bg-brand-pink text-white rounded-full w-4.5 h-4.5 min-w-[18px] min-h-[18px] text-[11px] leading-none flex items-center justify-center shadow"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={p.emoji}
                        onChange={(e) => handleEmojiChange(p.letra, e.target.value)}
                        className="w-10 shrink-0 text-center text-[1.1rem] p-1.5 rounded-lg border-2 border-brand-blue/10 outline-none focus:border-brand-blue"
                        maxLength={2}
                      />
                      <button
                        onClick={() => elegirFoto(p.letra)}
                        disabled={subiendo !== null}
                        title="Usar una foto en vez del emoji"
                        className="shrink-0 text-[1.15rem] opacity-60 hover:opacity-100 disabled:opacity-30 px-0.5"
                      >
                        {subiendo === p.letra ? "⏳" : "📷"}
                      </button>
                    </>
                  )}
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
          onClick={() => void handleLogout()}
          disabled={saliendo}
          className="w-full mt-8 bg-gray-200 text-gray-600 border-none rounded-xl p-3 text-[1rem] font-bold cursor-pointer transition-transform active:translate-y-1 disabled:opacity-60"
        >
          {saliendo ? "Guardando..." : "Salir (cambiar usuario)"}
        </button>

        <button
          onClick={abrirCambioDeCuenta}
          className="w-full mt-3 bg-transparent text-gray-400 border-none p-2 text-sm font-bold cursor-pointer underline underline-offset-2"
        >
          Cambiar de cuenta{cuentaEmail ? ` (${cuentaEmail})` : ""}
        </button>

        <p className="text-center text-gray-400 text-xs mt-4">Tablele v0.10.0</p>
      </div>

      {cambioOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={() => setCambioOpen(false)}
        >
          <div
            className="bg-white rounded-[26px] p-6 w-full max-w-[340px] shadow-xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-brand-dark font-bold text-lg text-center">
              Pregunta para adultos
            </h3>
            <p className="text-brand-blue text-center">
              Se cierran todos los chicos de esta cuenta en esta tablet.
              <br />
              <b className="text-[1.6rem] text-brand-dark">
                ¿Cuánto es {pregunta.a} + {pregunta.b}?
              </b>
            </p>
            <input
              type="number"
              inputMode="numeric"
              value={resp}
              onChange={(e) => setResp(e.target.value)}
              className="w-full text-center text-2xl p-3 rounded-xl border-2 border-brand-blue/20 outline-none focus:border-brand-blue"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setCambioOpen(false)}
                className="flex-1 bg-gray-200 text-gray-600 rounded-[18px] p-3 font-bold active:translate-y-1"
              >
                Cancelar
              </button>
              <button
                onClick={() => void cambiarDeCuenta()}
                disabled={!respuestaOk}
                className="flex-1 bg-brand-pink text-white rounded-[18px] p-3 font-bold shadow-[0_4px_0_rgba(0,0,0,0.18)] active:translate-y-1 active:shadow-none disabled:opacity-40 disabled:shadow-none"
              >
                Cambiar
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
