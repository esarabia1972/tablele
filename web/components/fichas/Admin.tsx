"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { sumarDias, type Ficha, type TipoFicha } from "@/lib/fichas";
import {
  api,
  enlaceInvitacion,
  getAdmin,
  salirAdmin,
  setAdmin,
  type SesionAdmin,
  type Tablero,
  type VinculoListado,
} from "@/lib/fichas-cliente";
import DarFicha from "./DarFicha";
import ListaFichas from "./ListaFichas";
import ModoChico from "./ModoChico";
import Visualizador from "./Visualizador";
import { btn, btnGris, card, errorTxt, fechaCorta, fechaDia, input, titulo } from "./ui";

type Pestana = "tablero" | "personas" | "objetivo";

// ---------------------------------------------------------------------------
// Entrada: correo y "cómo te llama el chico"
// ---------------------------------------------------------------------------

function Login({ onListo }: { onListo: (s: SesionAdmin) => void }) {
  const [email, setEmail] = useState("");
  const [miNombre, setMiNombre] = useState("");
  const [paso, setPaso] = useState<"correo" | "nombre">("correo");
  const [pendiente, setPendiente] = useState<SesionAdmin | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const validar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCargando(true);
    setError("");
    const r = await api.cuenta(email.trim().toLowerCase());
    setCargando(false);
    if (!r.ok) {
      setError(r.message || "No se pudo validar el correo.");
      return;
    }
    if (r.chicos.length === 0) {
      setError("Tu correo todavía no tiene chicos en Tablele.");
      return;
    }
    setPendiente({ email: r.email, miNombre: "", chicos: r.chicos, actual: 0 });
    setPaso("nombre");
  };

  const guardarNombre = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendiente || !miNombre.trim()) return;
    const s = { ...pendiente, miNombre: miNombre.trim().slice(0, 40) };
    setAdmin(s);
    onListo(s);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md gap-4">
      <h1 className="text-brand-dark text-[2.2rem] font-bold text-center drop-shadow-[2px_2px_0_#fff]">
        Fichas 🏅
      </h1>
      {paso === "correo" ? (
        <form onSubmit={validar} className={card}>
          <p className="text-brand-blue text-center">Entrá con el mismo correo que usás en Tablele.</p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu correo"
            className={`${input} lowercase`}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={cargando}
          />
          {error && <div className={errorTxt}>{error}</div>}
          <button type="submit" disabled={cargando} className={btn}>
            {cargando ? "Validando..." : "Entrar"}
          </button>
        </form>
      ) : (
        <form onSubmit={guardarNombre} className={card}>
          <p className="text-brand-blue text-center">
            ¿Cómo te dice {pendiente?.chicos[0]?.username}? Así va a ver quién le dio cada ficha.
          </p>
          <input
            value={miNombre}
            onChange={(e) => setMiNombre(e.target.value)}
            placeholder="Mamá, Seño Leti…"
            className={input}
            maxLength={40}
            required
            autoFocus
          />
          <button type="submit" className={btn}>
            Listo
          </button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Tablero
// ---------------------------------------------------------------------------

function PestanaTablero({
  s,
  t,
  recargar,
  irAObjetivo,
}: {
  s: SesionAdmin;
  t: Tablero;
  recargar: () => void;
  irAObjetivo: () => void;
}) {
  const [persona, setPersona] = useState("");
  const [clase, setClase] = useState<"todas" | "estrellas" | "caritas">("todas");
  const [anulando, setAnulando] = useState<Ficha | null>(null);
  const [error, setError] = useState("");

  const personas = useMemo(
    () => Array.from(new Set(t.fichas.map((f) => f.dada_por_nombre))).sort(),
    [t.fichas]
  );

  const filtradas = t.fichas.filter(
    (f) =>
      (!persona || f.dada_por_nombre === persona) &&
      (clase === "todas" ||
        (clase === "estrellas" ? f.tipo === "estrella" || f.tipo === "doble" : f.tipo === "feliz" || f.tipo === "triste"))
  );

  // Informe de caritas: por persona, sin las anuladas.
  const caritas = useMemo(() => {
    const m = new Map<string, { feliz: number; triste: number }>();
    for (const f of t.fichas) {
      if (f.anulada_at || (f.tipo !== "feliz" && f.tipo !== "triste")) continue;
      const x = m.get(f.dada_por_nombre) ?? { feliz: 0, triste: 0 };
      x[f.tipo]++;
      m.set(f.dada_por_nombre, x);
    }
    return Array.from(m.entries());
  }, [t.fichas]);

  const dar = async (tipo: TipoFicha, comentario: string) => {
    const r = await api.dar(s, tipo, comentario);
    if (!r.ok) return r.message || "No se pudo guardar.";
    recargar();
    return null;
  };

  const confirmarAnular = async () => {
    if (!anulando) return;
    const r = await api.anular(s, anulando.id);
    setAnulando(null);
    if (!r.ok) setError(r.message || "No se pudo anular.");
    else recargar();
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className={card}>
        {t.objetivo ? (
          <Visualizador
            acumuladas={t.objetivo.acumuladas}
            meta={t.objetivo.meta}
            premio={t.objetivo.premio}
            fin={t.objetivo.fin}
            diasRestantes={t.objetivo.diasRestantes}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-brand-dark">No hay un objetivo en curso. Las fichas se registran igual.</p>
            <button type="button" className={btn} onClick={irAObjetivo}>
              Crear objetivo
            </button>
          </div>
        )}
      </div>

      <DarFicha nombreChico={t.chico.nombre} onDar={dar} />

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={titulo}>Quién le dio</div>
          <div className="text-sm opacity-60">
            {fechaDia(t.rango.inicio)} – {fechaDia(t.rango.fin)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={persona} onChange={(e) => setPersona(e.target.value)} className="rounded-xl p-2 bg-white border-2 border-brand-blue/20">
            <option value="">Todas las personas</option>
            {personas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {(["todas", "estrellas", "caritas"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClase(c)}
              className={`rounded-full px-4 py-2 font-bold ${clase === c ? "bg-brand-blue text-white" : "bg-white text-brand-blue"}`}
            >
              {c === "todas" ? "Todo" : c === "estrellas" ? "⭐ Estrellas" : "🙂🙁 Caritas"}
            </button>
          ))}
        </div>
        {anulando && (
          <div className="bg-[#ffe3ef] rounded-2xl p-3 flex flex-wrap items-center gap-3">
            <span className="flex-1">
              ¿Anular la ficha de <b>{anulando.dada_por_nombre}</b> del {fechaCorta(anulando.created_at)}? Queda tachada y deja de contar.
            </span>
            <button type="button" className="bg-brand-pink text-white rounded-xl px-4 py-2 font-bold" onClick={() => void confirmarAnular()}>
              Anular
            </button>
            <button type="button" className={btnGris} onClick={() => setAnulando(null)}>
              No
            </button>
          </div>
        )}
        {error && <div className={errorTxt}>{error}</div>}
        <ListaFichas fichas={filtradas} puedeAnular={() => true} onAnular={setAnulando} />
      </div>

      <div className={card}>
        <div className={titulo}>Caritas</div>
        {caritas.length === 0 ? (
          <p className="text-brand-blue opacity-80">Sin caritas en este período.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="text-sm opacity-60">
                <th className="font-normal">Persona</th>
                <th className="font-normal text-center">🙂</th>
                <th className="font-normal text-center">🙁</th>
              </tr>
            </thead>
            <tbody>
              {caritas.map(([nombre, c]) => (
                <tr key={nombre} className="border-t border-brand-blue/10">
                  <td className="py-2 font-bold text-brand-dark">{nombre}</td>
                  <td className="text-center">{c.feliz}</td>
                  <td className="text-center">{c.triste}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Personas (vinculados)
// ---------------------------------------------------------------------------

function PestanaPersonas({ s, nombreChico }: { s: SesionAdmin; nombreChico: string }) {
  const [lista, setLista] = useState<VinculoListado[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [enlace, setEnlace] = useState<{ nombre: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await api.vinculos(s);
    if (r.ok) setLista(r.vinculos);
    else setError(r.message || "No se pudo cargar la lista.");
  }, [s]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API
    void cargar();
  }, [cargar]);

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const n = nombre.trim();
    const r = await api.invitar(s, n);
    if (!r.ok) {
      setError(r.message || "No se pudo crear la invitación.");
      return;
    }
    setEnlace({ nombre: n, url: enlaceInvitacion(r.token) });
    setNombre("");
    setCopiado(false);
    void cargar();
  };

  const revocar = async (v: VinculoListado) => {
    const r = await api.revocar(s, v.id);
    if (!r.ok) setError(r.message || "No se pudo revocar.");
    void cargar();
  };

  const textoWhatsapp = enlace
    ? `Hola ${enlace.nombre}! Con este enlace podés darle fichas a ${nombreChico} cuando se porte bien: ${enlace.url}`
    : "";

  return (
    <div className="flex flex-col gap-5 w-full">
      <form onSubmit={invitar} className={card}>
        <div className={titulo}>Invitar a alguien</div>
        <p className="text-brand-blue">
          La persona invitada puede darle fichas y caritas a {nombreChico}. No ve el informe de Tablele ni lo que dieron otros.
        </p>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="¿Cómo la conoce? Seño Ana, Abuela Marta…"
          className={input}
          maxLength={40}
          required
        />
        <button type="submit" className={btn}>
          Crear invitación
        </button>
        {error && <div className={errorTxt}>{error}</div>}
      </form>

      {enlace && (
        <div className={`${card} border-4 border-brand-green`}>
          <div className="font-bold text-brand-dark">Enlace para {enlace.nombre}</div>
          <p className="text-sm text-brand-pink font-bold">
            Se muestra una sola vez. Quien tenga este enlace puede darle fichas a {nombreChico}.
          </p>
          <div className="bg-white rounded-xl p-3 break-all text-sm select-all">{enlace.url}</div>
          <div className="flex flex-wrap gap-3">
            <a
              className={`${btn} text-center`}
              href={`https://wa.me/?text=${encodeURIComponent(textoWhatsapp)}`}
              target="_blank"
              rel="noreferrer"
            >
              Mandar por WhatsApp
            </a>
            <button
              type="button"
              className={btnGris}
              onClick={() => {
                void navigator.clipboard?.writeText(enlace.url).then(() => setCopiado(true));
              }}
            >
              {copiado ? "¡Copiado!" : "Copiar"}
            </button>
            <button type="button" className={btnGris} onClick={() => setEnlace(null)}>
              Listo
            </button>
          </div>
        </div>
      )}

      <div className={card}>
        <div className={titulo}>Personas invitadas</div>
        {lista === null ? (
          <p className="opacity-60">Cargando…</p>
        ) : lista.length === 0 ? (
          <p className="text-brand-blue opacity-80">Todavía no invitaste a nadie.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lista.map((v) => (
              <li key={v.id} className={`flex items-center gap-3 bg-white rounded-2xl p-3 ${v.activo ? "" : "opacity-50"}`}>
                <div className="flex-1">
                  <div className="font-bold text-brand-dark">{v.nombre}</div>
                  <div className="text-sm opacity-60">
                    {v.fichas} {v.fichas === 1 ? "ficha" : "fichas"} · desde {fechaCorta(v.created_at)}
                    {!v.activo && " · revocada"}
                  </div>
                </div>
                {v.activo && (
                  <button type="button" className="text-brand-pink font-bold px-2" onClick={() => void revocar(v)}>
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Objetivo
// ---------------------------------------------------------------------------

function PestanaObjetivo({ s, t, recargar }: { s: SesionAdmin; t: Tablero; recargar: () => void }) {
  const [meta, setMeta] = useState(20);
  const [premio, setPremio] = useState("");
  const [inicio, setInicio] = useState(t.hoy);
  const [fin, setFin] = useState(sumarDias(t.hoy, 6));
  const [error, setError] = useState("");
  const [confirmarCierre, setConfirmarCierre] = useState(false);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const r = await api.crearObjetivo(s, { meta, premio, inicio, fin });
    if (!r.ok) setError(r.message || "No se pudo crear el objetivo.");
    else {
      setPremio("");
      recargar();
    }
  };

  const cerrar = async () => {
    const r = await api.cerrarObjetivo(s);
    setConfirmarCierre(false);
    if (!r.ok) setError(r.message || "No se pudo cerrar.");
    recargar();
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {t.objetivo ? (
        <div className={card}>
          <div className={titulo}>Objetivo en curso</div>
          <Visualizador
            acumuladas={t.objetivo.acumuladas}
            meta={t.objetivo.meta}
            premio={t.objetivo.premio}
            fin={t.objetivo.fin}
            diasRestantes={t.objetivo.diasRestantes}
          />
          <div className="text-sm opacity-70">
            Del {fechaDia(t.objetivo.inicio)} al {fechaDia(t.objetivo.fin)}. Se cierra solo al terminar el último día.
          </div>
          {confirmarCierre ? (
            <div className="flex gap-3 items-center flex-wrap">
              <span>¿Cerrarlo ahora? Queda en el historial como {t.objetivo.acumuladas >= t.objetivo.meta ? "cumplido" : "no cumplido"}.</span>
              <button type="button" className="bg-brand-pink text-white rounded-xl px-4 py-2 font-bold" onClick={() => void cerrar()}>
                Cerrar
              </button>
              <button type="button" className={btnGris} onClick={() => setConfirmarCierre(false)}>
                No
              </button>
            </div>
          ) : (
            <button type="button" className={btnGris} onClick={() => setConfirmarCierre(true)}>
              Cerrar antes de tiempo
            </button>
          )}
        </div>
      ) : (
        <form onSubmit={crear} className={card}>
          <div className={titulo}>Nuevo objetivo</div>
          <label className="flex flex-col gap-1">
            <span className="font-bold text-brand-dark">¿Cuántas estrellas tiene que juntar?</span>
            <input type="number" min={1} max={1000} value={meta} onChange={(e) => setMeta(Number(e.target.value))} className={input} required />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-bold text-brand-dark">¿Cuál es el premio?</span>
            <input value={premio} onChange={(e) => setPremio(e.target.value)} placeholder="Ir al cine" maxLength={120} className={input} required />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-bold text-brand-dark">Desde</span>
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={input} required />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-bold text-brand-dark">Hasta</span>
              <input type="date" value={fin} min={inicio} onChange={(e) => setFin(e.target.value)} className={input} required />
            </label>
          </div>
          {error && <div className={errorTxt}>{error}</div>}
          <button type="submit" className={btn}>
            Crear objetivo
          </button>
        </form>
      )}

      <div className={card}>
        <div className={titulo}>Historial</div>
        {t.historial.length === 0 ? (
          <p className="text-brand-blue opacity-80">Todavía no hay objetivos terminados.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {t.historial.map((o) => (
              <li key={o.id} className="bg-white rounded-2xl p-3 flex items-center gap-3">
                <span className="text-2xl">{o.cumplido ? "🏆" : "➖"}</span>
                <span className="flex-1">
                  <b>{o.meta} ⭐ → {o.premio}</b>
                  <span className="block text-sm opacity-60">
                    {fechaDia(o.inicio)} – {fechaDia(o.fin)} · {o.cumplido ? "cumplido" : "no cumplido"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function Admin() {
  const [s, setS] = useState<SesionAdmin | null>(null);
  const [listo, setListo] = useState(false);
  const [t, setT] = useState<Tablero | null>(null);
  const [error, setError] = useState("");
  const [pestana, setPestana] = useState<Pestana>("tablero");
  const [modoChico, setModoChico] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage sólo existe en el cliente
    setS(getAdmin());
    setListo(true);
  }, []);

  const recargar = useCallback(async () => {
    if (!s) return;
    const r = await api.tablero(s);
    if (r.ok) {
      setT(r);
      setError("");
    } else if (r.motivo === "sin-acceso") {
      setError("Ya no tenés acceso a este chico.");
    } else {
      setError(r.message || "No se pudo cargar el tablero.");
    }
  }, [s]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga desde la API
    void recargar();
  }, [recargar]);

  if (!listo) return null;
  if (!s) return <Login onListo={setS} />;

  const chico = s.chicos[s.actual];
  const cambiarChico = (i: number) => {
    const n = { ...s, actual: i };
    setAdmin(n);
    setT(null);
    setS(n);
  };

  if (modoChico && t) {
    return <ModoChico tablero={t} onSalir={() => setModoChico(false)} />;
  }

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4 pt-4">
      <header className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-brand-dark text-[2rem] font-bold drop-shadow-[2px_2px_0_#fff]">
          Fichas de {t?.chico.nombre ?? chico?.username} 🏅
        </h1>
        <button
          type="button"
          className="text-sm text-brand-dark/60 underline"
          onClick={() => {
            salirAdmin();
            setS(null);
            setT(null);
          }}
        >
          Salir ({s.miNombre})
        </button>
      </header>

      {s.chicos.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {s.chicos.map((c, i) => (
            <button
              key={`${c.accountId}/${c.username}`}
              type="button"
              onClick={() => cambiarChico(i)}
              className={`rounded-full px-5 py-2 font-bold ${i === s.actual ? "bg-brand-blue text-white" : "bg-white text-brand-blue"}`}
            >
              {c.username}
            </button>
          ))}
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        {(
          [
            ["tablero", "Tablero"],
            ["personas", "Personas"],
            ["objetivo", "Objetivo"],
          ] as const
        ).map(([k, txt]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPestana(k)}
            className={`rounded-[16px] px-5 py-2 font-bold shadow-[0_3px_0_rgba(0,0,0,0.12)] ${
              pestana === k ? "bg-brand-dark text-white" : "bg-white text-brand-dark"
            }`}
          >
            {txt}
          </button>
        ))}
        <button
          type="button"
          disabled={!t}
          onClick={() => setModoChico(true)}
          className="rounded-[16px] px-5 py-2 font-bold bg-[#ffd23f] text-brand-dark shadow-[0_3px_0_rgba(0,0,0,0.12)] disabled:opacity-50"
        >
          Mostrarle a {t?.chico.nombre ?? chico?.username} 👀
        </button>
      </nav>

      {error && <div className={errorTxt}>{error}</div>}
      {!t && !error && <p className="opacity-60">Cargando…</p>}

      {t && pestana === "tablero" && (
        <PestanaTablero s={s} t={t} recargar={() => void recargar()} irAObjetivo={() => setPestana("objetivo")} />
      )}
      {t && pestana === "personas" && <PestanaPersonas s={s} nombreChico={t.chico.nombre} />}
      {t && pestana === "objetivo" && <PestanaObjetivo s={s} t={t} recargar={() => void recargar()} />}
    </div>
  );
}
