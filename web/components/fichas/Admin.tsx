"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MAX_CONDUCTAS_ACTIVAS,
  informePorConducta,
  type Conducta,
  type Ficha,
  type Movimiento,
  type Premio,
  type TipoFicha,
} from "@/lib/fichas";
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
import { CATALOGO } from "@/lib/catalogo-conductas";
import DarFicha from "./DarFicha";
import ListaFichas from "./ListaFichas";
import ModoChico from "./ModoChico";
import Picto from "./Picto";
import PictoPicker, { type Imagen } from "./PictoPicker";
import Tienda from "./Tienda";
import { btn, btnGris, card, errorTxt, fechaCorta, fechaDia, input, titulo } from "./ui";

type Pestana = "tablero" | "informe" | "ajustes" | "personas";

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
// Pestaña Tablero: saldo, tienda, dar fichas y lista
// ---------------------------------------------------------------------------

type Confirmar =
  | { que: "ficha"; f: Ficha }
  | { que: "mov"; m: Movimiento }
  | { que: "canje"; p: Premio }
  | { que: "cero" };

function PestanaTablero({
  s,
  t,
  recargar,
  irAAjustes,
}: {
  s: SesionAdmin;
  t: Tablero;
  recargar: () => void;
  irAAjustes: () => void;
}) {
  const [persona, setPersona] = useState("");
  const [clase, setClase] = useState<"todas" | "estrellas" | "caritas" | "canjes">("todas");
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [error, setError] = useState("");

  const activas = t.conductas.filter((c) => c.activa);
  const premios = t.premios.filter((p) => p.activo);
  const personas = useMemo(() => Array.from(new Set(t.fichas.map((f) => f.dada_por_nombre))).sort(), [t.fichas]);

  const fichas = t.fichas.filter(
    (f) =>
      clase !== "canjes" &&
      (!persona || f.dada_por_nombre === persona) &&
      (clase === "todas" ||
        (clase === "estrellas" ? f.tipo === "estrella" || f.tipo === "doble" : f.tipo === "feliz" || f.tipo === "triste"))
  );
  const movs = clase === "todas" || clase === "canjes" ? t.movimientos.filter((m) => !persona || m.hecho_por_nombre === persona) : [];

  const dar = async (tipo: TipoFicha, comentario: string, conductaId: string | null) => {
    const r = await api.dar(s, tipo, comentario, conductaId);
    if (!r.ok) {
      if (r.motivo === "conducta-inactiva") recargar();
      return r.message || "No se pudo guardar.";
    }
    recargar();
    return null;
  };

  const ejecutar = async () => {
    if (!confirmar) return;
    const c = confirmar;
    setConfirmar(null);
    const r =
      c.que === "ficha"
        ? await api.anular(s, c.f.id)
        : c.que === "mov"
          ? await api.anularMovimiento(s, c.m.id)
          : c.que === "canje"
            ? await api.canjear(s, c.p.id)
            : await api.cero(s);
    if (!r.ok) setError(r.message || "No se pudo hacer.");
    else setError("");
    recargar();
  };

  const textoConfirmar = !confirmar
    ? ""
    : confirmar.que === "ficha"
      ? `¿Anular la ficha de ${confirmar.f.dada_por_nombre} del ${fechaCorta(confirmar.f.created_at)}? Queda tachada y deja de contar.`
      : confirmar.que === "mov"
        ? confirmar.m.tipo === "canje"
          ? `¿Deshacer el canje de "${confirmar.m.premio_nombre}"? Vuelven ${confirmar.m.costo} estrellas.`
          : "¿Deshacer la puesta en cero? Vuelven las estrellas que tenía."
        : confirmar.que === "canje"
          ? `¿Canjear "${confirmar.p.nombre}" por ${confirmar.p.precio} estrellas? Le quedan ${Math.max(0, t.saldo) - confirmar.p.precio}.`
          : `¿Poner en cero? Tiene ${Math.max(0, t.saldo)} estrellas y las pierde. Queda registrado y se puede deshacer.`;

  return (
    <div className="flex flex-col gap-5 w-full">
      {confirmar && (
        <div className="bg-[#ffe3ef] rounded-2xl p-4 flex flex-wrap items-center gap-3 sticky top-2 z-10 shadow-lg">
          <span className="flex-1 min-w-[200px]">{textoConfirmar}</span>
          <button type="button" className="bg-brand-pink text-white rounded-xl px-4 py-2 font-bold" onClick={() => void ejecutar()}>
            Sí
          </button>
          <button type="button" className={btnGris} onClick={() => setConfirmar(null)}>
            No
          </button>
        </div>
      )}

      <div className={card}>
        <Tienda saldo={t.saldo} premios={premios} onCanjear={(p) => setConfirmar({ que: "canje", p })} />
        <div className="flex flex-wrap justify-between gap-2 items-center">
          {premios.length === 0 ? (
            <button type="button" className={btn} onClick={irAAjustes}>
              Cargar premios
            </button>
          ) : (
            <span className="text-sm opacity-60">Canjear descuenta el precio. Lo decide la familia.</span>
          )}
          <button type="button" className={btnGris} disabled={t.saldo <= 0} onClick={() => setConfirmar({ que: "cero" })}>
            Poner en cero
          </button>
        </div>
      </div>

      <DarFicha
        nombreChico={t.chico.nombre}
        conductas={activas}
        sinConductas="Todavía no hay conductas activas. Activalas en Conductas y premios."
        onDar={dar}
      />

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={titulo}>Quién le dio y por qué</div>
          <div className="text-sm opacity-60">últimas 8 semanas</div>
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
          {(["todas", "estrellas", "caritas", "canjes"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setClase(c)}
              className={`rounded-full px-4 py-2 font-bold ${clase === c ? "bg-brand-blue text-white" : "bg-white text-brand-blue"}`}
            >
              {c === "todas" ? "Todo" : c === "estrellas" ? "⭐ Estrellas" : c === "caritas" ? "🙂🙁 Caritas" : "🎁 Canjes"}
            </button>
          ))}
        </div>
        {error && <div className={errorTxt}>{error}</div>}
        <ListaFichas
          fichas={fichas}
          movimientos={movs}
          puedeAnular={() => true}
          onAnular={(f) => setConfirmar({ que: "ficha", f })}
          onAnularMov={(m) => setConfirmar({ que: "mov", m })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Informe: estrellas por conducta y semana, y caritas
// ---------------------------------------------------------------------------

function PestanaInforme({ t }: { t: Tablero }) {
  const inf = useMemo(() => informePorConducta(t.fichas, t.hoy), [t.fichas, t.hoy]);
  const conductaDe = useMemo(() => new Map(t.conductas.map((c) => [c.id, c])), [t.conductas]);
  const caritas = t.fichas.filter((f) => !f.anulada_at && (f.tipo === "feliz" || f.tipo === "triste"));
  const max = Math.max(1, ...inf.filas.flatMap((f) => Object.values(f.porSemana)));

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className={card}>
        <div className={titulo}>Estrellas por conducta</div>
        {inf.filas.length === 0 ? (
          <p className="text-brand-blue opacity-80">Todavía no hay estrellas en las últimas 8 semanas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="opacity-60">
                  <th className="font-normal py-1">Conducta</th>
                  {inf.semanas.map((w) => (
                    <th key={w} className="font-normal text-center px-1 whitespace-nowrap">
                      {fechaDia(w)}
                    </th>
                  ))}
                  <th className="font-normal text-center px-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {inf.filas.map((f) => (
                  <tr key={f.clave} className="border-t border-brand-blue/10">
                    <td className="py-2 pr-2">
                      <span className="flex items-center gap-2 font-bold text-brand-dark">
                        <Picto id={conductaDe.get(f.clave)?.picto} foto={conductaDe.get(f.clave)?.foto} tam={28} />
                        {f.texto}
                      </span>
                    </td>
                    {inf.semanas.map((w) => {
                      const v = f.porSemana[w] ?? 0;
                      return (
                        <td key={w} className="text-center px-1">
                          <span
                            className="inline-block min-w-[28px] rounded-md py-1"
                            style={{ background: v ? `rgba(255,210,63,${0.25 + (0.75 * v) / max})` : "transparent" }}
                          >
                            {v || "·"}
                          </span>
                        </td>
                      );
                    })}
                    <td className="text-center font-bold">{f.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs opacity-60 mt-2">Cada columna es una semana (desde el lunes). El Vale Doble cuenta 2.</p>
          </div>
        )}
      </div>

      <div className={card}>
        <div className={titulo}>Caritas</div>
        <ListaFichas fichas={caritas} vacio="Sin caritas en las últimas 8 semanas." />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pestaña Conductas y premios
// ---------------------------------------------------------------------------

function EditorItem({
  s,
  tipo,
  inicial,
  onGuardar,
  onCancelar,
}: {
  s: SesionAdmin;
  tipo: "conducta" | "premio";
  inicial?: { texto: string; precio?: number; picto: number | null; foto: string | null };
  onGuardar: (d: { texto: string; precio: number; picto: number | null; foto: string | null }) => Promise<string | null>;
  onCancelar?: () => void;
}) {
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [precio, setPrecio] = useState(inicial?.precio ?? 10);
  const [imagen, setImagen] = useState<Imagen>({ picto: inicial?.picto ?? null, foto: inicial?.foto ?? null });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [agregado, setAgregado] = useState("");
  // Cambiar la key del buscador lo vuelve a montar vacío (búsqueda y resultados).
  const [vuelta, setVuelta] = useState(0);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const err = await onGuardar({ texto: texto.trim(), precio, picto: imagen.picto, foto: imagen.foto });
    setGuardando(false);
    if (err) setError(err);
    else if (!inicial) {
      setAgregado(`Agregado: ${texto.trim()}`);
      setTimeout(() => setAgregado(""), 2500);
      setTexto("");
      setPrecio(10);
      setImagen({ picto: null, foto: null });
      setError("");
      setVuelta((v) => v + 1);
    }
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3 bg-white/60 rounded-2xl p-3">
      <div className="flex gap-2 items-center">
        {tipo === "conducta" && <span className="font-bold text-brand-dark shrink-0">¡Gracias por</span>}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={
            tipo === "conducta"
              ? inicial
                ? "conducta"
                : "escribí una conducta nueva…"
              : inicial
                ? "premio"
                : "escribí un premio nuevo…"
          }
          maxLength={60}
          className={input}
          required
        />
        {tipo === "premio" && (
          <label className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              min={1}
              max={1000}
              value={precio}
              onChange={(e) => setPrecio(Number(e.target.value))}
              className={`${input} w-24`}
              required
            />
            <span>⭐</span>
          </label>
        )}
      </div>
      <PictoPicker
        key={vuelta}
        valor={imagen}
        onCambio={setImagen}
        sugerencia={texto.split(" ").slice(-1)[0] ?? ""}
        subirFoto={async (dataUrl) => {
          const r = await api.foto(s, dataUrl);
          return r.ok ? { url: r.url } : { error: r.message };
        }}
      />
      {error && <div className={errorTxt}>{error}</div>}
      {agregado && <div className="text-brand-green font-bold">✓ {agregado}</div>}
      <div className="flex gap-2">
        <button type="submit" className={btn} disabled={guardando}>
          {inicial ? "Guardar" : "Agregar"}
        </button>
        {onCancelar && (
          <button type="button" className={btnGris} onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function ItemBiblioteca({
  texto,
  picto,
  foto,
  propia,
  lleno,
  onActivar,
  onEditar,
}: {
  texto: string;
  picto: number | null;
  foto: string | null;
  propia: boolean;
  lleno: boolean;
  onActivar: (doble: boolean) => void;
  onEditar?: () => void;
}) {
  return (
    <li className="flex items-center gap-2 bg-white/70 rounded-2xl p-2">
      <Picto id={picto} foto={foto} tam={36} respaldo="⭐" />
      <span className="flex-1 min-w-0 text-brand-dark leading-tight">
        {texto}
        {propia && <span className="text-xs opacity-60"> · propia</span>}
      </span>
      {onEditar && (
        <button type="button" className="text-brand-blue text-sm font-bold px-1" onClick={onEditar}>
          Editar
        </button>
      )}
      <button
        type="button"
        disabled={lleno}
        onClick={() => onActivar(false)}
        className="bg-brand-green text-white rounded-xl px-3 py-1 text-sm font-bold disabled:opacity-40"
      >
        Activar
      </button>
      <button
        type="button"
        disabled={lleno}
        onClick={() => onActivar(true)}
        title="Activar como Vale Doble"
        className="bg-brand-orange text-white rounded-xl px-2 py-1 text-sm font-bold disabled:opacity-40"
      >
        ⭐⭐
      </button>
    </li>
  );
}

function PestanaAjustes({ s, t, recargar }: { s: SesionAdmin; t: Tablero; recargar: () => void }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [verArchivo, setVerArchivo] = useState(false);

  const activas = t.conductas.filter((c) => c.activa);
  const desactivadas = t.conductas.filter((c) => !c.activa);
  const usadas = new Set(t.conductas.map((c) => c.catalogo).filter(Boolean));
  const delCatalogo = CATALOGO.filter((i) => !usadas.has(i.clave));
  const lleno = activas.length >= MAX_CONDUCTAS_ACTIVAS;
  const premios = t.premios.filter((p) => p.activo);
  const premiosArch = t.premios.filter((p) => !p.activo);

  const resultado = (r: { ok: boolean; message?: string }) => {
    if (!r.ok) return r.message || "No se pudo guardar.";
    setEditando(null);
    recargar();
    return null;
  };

  const accion = async (r: Promise<{ ok: boolean; message?: string }>) => {
    const res = await r;
    setError(res.ok ? "" : res.message || "No se pudo.");
    recargar();
  };

  const mover = (c: Conducta, delta: number) => {
    const ids = activas.map((x) => x.id);
    const i = ids.indexOf(c.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void accion(api.conducta(s, "ordenar", { ids }));
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className={card}>
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div className={titulo}>Trabajando ahora</div>
          <div className={`font-bold ${lleno ? "text-brand-pink" : "text-brand-dark/60"}`}>
            {activas.length} de {MAX_CONDUCTAS_ACTIVAS}
          </div>
        </div>
        <p className="text-brand-blue">
          Las conductas que se trabajan ahora con {t.chico.nombre}. Son las únicas que ve quien le da fichas, y valen 1 ⭐. Marcá como{" "}
          <b>Vale Doble</b> las que más cuestan: valen 2.
        </p>
        {error && <div className={errorTxt}>{error}</div>}
        {activas.length === 0 && <p className="text-brand-pink font-bold">Todavía no hay ninguna. Activá alguna de la biblioteca.</p>}
        <ul className="flex flex-col gap-2">
          {activas.map((c, i) =>
            editando === c.id ? (
              <li key={c.id}>
                <EditorItem
                  s={s}
                  tipo="conducta"
                  inicial={{ texto: c.texto, picto: c.picto, foto: c.foto }}
                  onGuardar={async (d) =>
                    resultado(await api.conducta(s, "editar", { conductaId: c.id, texto: d.texto, picto: d.picto, foto: d.foto }))
                  }
                  onCancelar={() => setEditando(null)}
                />
              </li>
            ) : (
              <li
                key={c.id}
                className={`flex items-center gap-2 rounded-2xl p-2 flex-wrap border-4 ${
                  c.doble ? "bg-[#fff1e4] border-brand-orange" : "bg-white border-transparent"
                }`}
              >
                <Picto id={c.picto} foto={c.foto} tam={44} respaldo="⭐" />
                <span className="flex-1 min-w-[160px] font-bold text-brand-dark">¡Gracias por {c.texto}!</span>
                <button
                  type="button"
                  onClick={() => void accion(api.conducta(s, "doble", { conductaId: c.id, doble: !c.doble }))}
                  className={`rounded-full px-3 py-1 font-bold text-sm border-2 ${
                    c.doble ? "bg-brand-orange text-white border-brand-orange" : "bg-white text-brand-orange border-brand-orange/50"
                  }`}
                  aria-pressed={c.doble}
                >
                  {c.doble ? "⭐⭐ Vale doble" : "⭐ Simple"}
                </button>
                <button type="button" aria-label="Subir" className="px-2 text-lg disabled:opacity-20" disabled={i === 0} onClick={() => mover(c, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Bajar"
                  className="px-2 text-lg disabled:opacity-20"
                  disabled={i === activas.length - 1}
                  onClick={() => mover(c, 1)}
                >
                  ↓
                </button>
                <button type="button" className="text-brand-blue font-bold px-2" onClick={() => setEditando(c.id)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="text-brand-pink font-bold px-2"
                  onClick={() => void accion(api.conducta(s, "desactivar", { conductaId: c.id }))}
                >
                  Quitar
                </button>
              </li>
            )
          )}
        </ul>
      </div>

      <div className={card}>
        <div className={titulo}>Biblioteca de conductas</div>
        <p className="text-brand-blue">
          {lleno
            ? `Ya hay ${MAX_CONDUCTAS_ACTIVAS} trabajándose. Quitá alguna de arriba para activar otra.`
            : "Tocá Activar para empezar a trabajar una. Lo que quites de arriba vuelve acá."}
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {desactivadas.map((c) =>
            editando === c.id ? (
              <li key={c.id} className="sm:col-span-2">
                <EditorItem
                  s={s}
                  tipo="conducta"
                  inicial={{ texto: c.texto, picto: c.picto, foto: c.foto }}
                  onGuardar={async (d) =>
                    resultado(await api.conducta(s, "editar", { conductaId: c.id, texto: d.texto, picto: d.picto, foto: d.foto }))
                  }
                  onCancelar={() => setEditando(null)}
                />
              </li>
            ) : (
              <ItemBiblioteca
                key={c.id}
                texto={c.texto}
                picto={c.picto}
                foto={c.foto}
                propia={!c.catalogo}
                lleno={lleno}
                onActivar={(doble) => void accion(api.conducta(s, "activar", { conductaId: c.id, doble }))}
                onEditar={() => setEditando(c.id)}
              />
            )
          )}
          {delCatalogo.map((it) => (
            <ItemBiblioteca
              key={it.clave}
              texto={it.texto}
              picto={it.picto}
              foto={null}
              propia={false}
              lleno={lleno}
              onActivar={(doble) => void accion(api.conducta(s, "catalogo", { clave: it.clave, doble }))}
            />
          ))}
        </ul>
        <div className="font-bold text-brand-dark mt-2">Agregar una conducta propia</div>
        <EditorItem
          s={s}
          tipo="conducta"
          onGuardar={async (d) => resultado(await api.conducta(s, "crear", { texto: d.texto, picto: d.picto, foto: d.foto }))}
        />
        {lleno && <p className="text-sm opacity-60 -mt-2">Como ya hay {MAX_CONDUCTAS_ACTIVAS} activas, la nueva queda en la biblioteca.</p>}
      </div>

      <div className={card}>
        <div className={titulo}>Tienda de premios</div>
        <p className="text-brand-blue">
          Mejor si los eligen con {t.chico.nombre}. Conviene que haya premios baratos (algo para hoy) y caros (algo para esperar).
        </p>
        <ul className="flex flex-col gap-2">
          {premios.map((p) =>
            editando === p.id ? (
              <li key={p.id}>
                <EditorItem
                  s={s}
                  tipo="premio"
                  inicial={{ texto: p.nombre, precio: p.precio, picto: p.picto, foto: p.foto }}
                  onGuardar={async (d) =>
                    resultado(await api.premio(s, "editar", { premioId: p.id, nombre: d.texto, precio: d.precio, picto: d.picto, foto: d.foto }))
                  }
                  onCancelar={() => setEditando(null)}
                />
              </li>
            ) : (
              <li key={p.id} className="flex items-center gap-2 bg-white rounded-2xl p-2">
                <Picto id={p.picto} foto={p.foto} tam={40} respaldo="🎁" />
                <span className="flex-1 font-bold text-brand-dark">{p.nombre}</span>
                <span className="shrink-0">{p.precio} ⭐</span>
                <button type="button" className="text-brand-blue font-bold px-2" onClick={() => setEditando(p.id)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="text-brand-pink font-bold px-2"
                  onClick={() => void accion(api.premio(s, "archivar", { premioId: p.id }))}
                >
                  Archivar
                </button>
              </li>
            )
          )}
        </ul>
        <EditorItem
          s={s}
          tipo="premio"
          onGuardar={async (d) => resultado(await api.premio(s, "crear", { nombre: d.texto, precio: d.precio, picto: d.picto, foto: d.foto }))}
        />
      </div>

      {premiosArch.length > 0 && (
        <div className={card}>
          <button type="button" className="text-left font-bold text-brand-dark" onClick={() => setVerArchivo(!verArchivo)}>
            {verArchivo ? "▾" : "▸"} Premios archivados ({premiosArch.length})
          </button>
          {verArchivo && (
            <ul className="flex flex-col gap-2">
              {premiosArch.map((p) => (
                <li key={p.id} className="flex items-center gap-2 bg-white/60 rounded-2xl p-2">
                  <Picto id={p.picto} foto={p.foto} tam={32} respaldo="🎁" />
                  <span className="flex-1">
                    {p.nombre} · {p.precio} ⭐
                  </span>
                  <button
                    type="button"
                    className="text-brand-blue font-bold px-2"
                    onClick={() => void accion(api.premio(s, "activar", { premioId: p.id }))}
                  >
                    Reactivar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
// Panel
// ---------------------------------------------------------------------------

export default function Admin({ onIrAVinculo }: { onIrAVinculo?: () => void } = {}) {
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
  if (!s) {
    return (
      <>
        <Login onListo={setS} />
        {onIrAVinculo && (
          <button type="button" onClick={onIrAVinculo} className="text-sm text-brand-dark/60 underline pb-6">
            Volver a dar fichas con la invitación
          </button>
        )}
      </>
    );
  }

  const chico = s.chicos[s.actual];
  const cambiarChico = (i: number) => {
    const n = { ...s, actual: i };
    setAdmin(n);
    setT(null);
    setS(n);
  };

  if (modoChico && t) {
    return (
      <ModoChico
        tablero={t}
        onSalir={() => setModoChico(false)}
        onCanjear={async (p) => {
          const r = await api.canjear(s, p.id);
          await recargar();
          return r.ok ? null : r.message || "No se pudo canjear.";
        }}
      />
    );
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
        {onIrAVinculo && (
          <button type="button" className="text-sm text-brand-dark/60 underline" onClick={onIrAVinculo}>
            Ver como invitado
          </button>
        )}
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
            ["informe", "Informe"],
            ["ajustes", "Conductas y premios"],
            ["personas", "Personas"],
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
        <PestanaTablero s={s} t={t} recargar={() => void recargar()} irAAjustes={() => setPestana("ajustes")} />
      )}
      {t && pestana === "personas" && <PestanaPersonas s={s} nombreChico={t.chico.nombre} />}
      {t && pestana === "informe" && <PestanaInforme t={t} />}
      {t && pestana === "ajustes" && <PestanaAjustes s={s} t={t} recargar={() => void recargar()} />}
    </div>
  );
}
