import {
  useContext, useEffect, useMemo, useRef, useState,
  type FormEvent
} from "react";
import {
  MapContainer, TileLayer, CircleMarker, Popup
} from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";
import {
  Activity, CalendarDays, Filter, MapPinned,
  RefreshCw, Search, X, ExternalLink
} from "lucide-react";
import { TokenContext } from "./AuthGate";
import "leaflet/dist/leaflet.css";
import "./catalog.css";

type Evento = {
  id: string;
  id_externo: string;
  fuente: string;
  fecha_utc: string;
  latitud: number;
  longitud: number;
  magnitud: number;
  tipo_magnitud: string | null;
  profundidad_km: number | null;
  lugar: string | null;
  estado_revision: string;
  url: string | null;
  fecha_recepcion_utc: string | null;
  fuente_organizacion?: string;
  fuente_url?: string;
  region?: string | null;
  huella_origen_calculada?: string;
};

type Resultado = {
  total: number;
  limite: number;
  offset: number;
  consultado_utc: string;
  eventos: Evento[];
};

type Filtros = {
  fecha_desde: string;
  fecha_hasta: string;
  min_magnitude: string;
  max_magnitude: string;
  min_depth: string;
  max_depth: string;
  fuente: string;
};

type Zona = {
  lat_min: string;
  lat_max: string;
  lon_min: string;
  lon_max: string;
};

function filtrosIniciales(): Filtros {
  return {
    fecha_desde: new Date(
      Date.now() - 30 * 86400000
    ).toISOString().slice(0, 10),
    fecha_hasta: "",
    min_magnitude: "",
    max_magnitude: "",
    min_depth: "",
    max_depth: "",
    fuente: ""
  };
}

function fecha(valor: string | null, utc = false) {
  if (!valor) return "Sin registro";

  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "No disponible";

  return d.toLocaleString("es-PE", {
    timeZone: utc ? "UTC" : "America/Lima",
    dateStyle: "medium",
    timeStyle: "short"
  }) + (utc ? " UTC" : "");
}

function color(magnitud: number) {
  return magnitud >= 5
    ? "#df9748"
    : magnitud >= 3
      ? "#10b7bd"
      : "#438be1";
}

export default function CatalogWorkspace({
  modo,
  peru
}: {
  modo: "eventos" | "mapa";
  peru: boolean;
}) {
  const token = useContext(TokenContext);
  const mapaRef = useRef<LeafletMap | null>(null);

  const [formulario, setFormulario] =
    useState<Filtros>(filtrosIniciales);

  const [filtros, setFiltros] =
    useState<Filtros>(filtrosIniciales);

  const [zona, setZona] = useState<Zona | null>(null);
  const [pagina, setPagina] = useState(1);
  const [revision, setRevision] = useState(0);

  const [datos, setDatos] = useState<Resultado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Evento | null>(null);
  const [errorDetalle, setErrorDetalle] = useState("");

  const limite = modo === "mapa" ? 500 : 25;

  useEffect(() => {
    setPagina(1);
    setZona(null);
    setSeleccionado(null);
    setDetalle(null);
  }, [modo, peru]);

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();
    const params = new URLSearchParams({
      peru: String(peru),
      limite: String(limite),
      offset: String((pagina - 1) * limite)
    });

    Object.entries(filtros).forEach(([clave, valor]) => {
      if (valor) params.set(clave, valor);
    });

    if (modo === "mapa" && zona) {
      Object.entries(zona).forEach(([clave, valor]) => {
        params.set(clave, valor);
      });
    }

    async function cargar() {
      setCargando(true);
      setError("");

      try {
        const respuesta = await fetch(
          `/api/v1/catalog/${modo === "mapa" ? "map" : "events"}?${params}`,
          {
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!respuesta.ok) {
          throw Error(`No se pudieron cargar los eventos (HTTP ${respuesta.status})`);
        }

        const resultado: Resultado = await respuesta.json();

        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error ? e.message : "Error de consulta"
          );
          setDatos(null);
        }
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }

    void cargar();
    return () => ctrl.abort();
  }, [token, modo, peru, filtros, zona, pagina, revision, limite]);

  useEffect(() => {
    if (!token || !seleccionado) return;

    const ctrl = new AbortController();

    async function consultarDetalle() {
      setDetalle(null);
      setErrorDetalle("");

      try {
        const respuesta = await fetch(
          `/api/v1/catalog/${modo === "mapa" ? "map" : "events"}/${seleccionado}`,
          {
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!respuesta.ok) {
          throw Error(`No se pudo consultar el detalle (HTTP ${respuesta.status})`);
        }

        const resultado: Evento = await respuesta.json();

        if (!ctrl.signal.aborted) setDetalle(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setErrorDetalle(
            e instanceof Error ? e.message : "Error de detalle"
          );
        }
      }
    }

    void consultarDetalle();
    return () => ctrl.abort();
  }, [token, seleccionado, modo]);

  function aplicar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const numerico = (valor: string) =>
      valor.trim() === "" ? null : Number(valor);

    if (
      formulario.fecha_desde &&
      formulario.fecha_hasta &&
      formulario.fecha_desde > formulario.fecha_hasta
    ) {
      setError("La fecha inicial no puede superar la final.");
      return;
    }

    for (const [minimo, maximo] of [
      [formulario.min_magnitude, formulario.max_magnitude],
      [formulario.min_depth, formulario.max_depth]
    ]) {
      const a = numerico(minimo);
      const b = numerico(maximo);

      if (a !== null && b !== null && a > b) {
        setError("Revisa los valores mínimos y máximos.");
        return;
      }
    }

    setError("");
    setPagina(1);
    setFiltros({ ...formulario });
    setRevision(v => v + 1);
  }

  function limpiar() {
    const inicial = filtrosIniciales();
    setFormulario(inicial);
    setFiltros(inicial);
    setZona(null);
    setPagina(1);
    setError("");
    setRevision(v => v + 1);
  }

  function buscarZona() {
    const bounds = mapaRef.current?.getBounds();
    if (!bounds) return;

    setZona({
      lat_min: bounds.getSouth().toFixed(5),
      lat_max: bounds.getNorth().toFixed(5),
      lon_min: bounds.getWest().toFixed(5),
      lon_max: bounds.getEast().toFixed(5)
    });

    setPagina(1);
  }

  const grupos = useMemo(() => {
    if (modo !== "mapa") return [];

    const mapa = new Map<string, Evento[]>();
    const escala = peru ? 0.35 : 1.5;

    for (const e of datos?.eventos ?? []) {
      const clave = [
        Math.floor(e.latitud / escala),
        Math.floor(e.longitud / escala)
      ].join(":");

      const lista = mapa.get(clave) ?? [];
      lista.push(e);
      mapa.set(clave, lista);
    }

    return [...mapa.values()].map(lista => ({
      eventos: lista,
      latitud: lista.reduce((s, e) => s + e.latitud, 0) / lista.length,
      longitud: lista.reduce((s, e) => s + e.longitud, 0) / lista.length,
      magnitud: Math.max(...lista.map(e => e.magnitud))
    }));
  }, [datos, modo, peru]);

  const total = datos?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / limite));

  return (
    <section className="cat-root">
      <header className="cat-header">
        <div>
          <span className="cat-eyebrow">
            {modo === "mapa" ? <MapPinned size={15}/> : <Activity size={15}/>}
            MONITOREO SÍSMICO
          </span>

          <h1>
            {modo === "mapa"
              ? "Mapa sísmico interactivo"
              : "Eventos sísmicos"}
          </h1>

          <p>
            Registros reales de USGS e IGP ·
            {" "}{peru ? "Perú" : "Mundo"}
          </p>
        </div>

        <button
          className="cat-update"
          type="button"
          disabled={cargando}
          onClick={() => setRevision(v => v + 1)}
        >
          <RefreshCw size={16}/>
          Actualizar
        </button>
      </header>

      <form className="cat-filters" onSubmit={aplicar}>
        <div className="cat-filter-title">
          <Filter size={18}/>
          Filtros de búsqueda
        </div>

        <div className="cat-fields">
          <label>
            Desde (UTC)
            <input
              type="date"
              value={formulario.fecha_desde}
              onChange={e => setFormulario(v => ({
                ...v, fecha_desde: e.target.value
              }))}
            />
          </label>

          <label>
            Hasta (UTC)
            <input
              type="date"
              value={formulario.fecha_hasta}
              onChange={e => setFormulario(v => ({
                ...v, fecha_hasta: e.target.value
              }))}
            />
          </label>

          <label>
            Magnitud mín.
            <input
              type="number" step="0.1" min="-2" max="10"
              placeholder="Cualquiera"
              value={formulario.min_magnitude}
              onChange={e => setFormulario(v => ({
                ...v, min_magnitude: e.target.value
              }))}
            />
          </label>

          <label>
            Magnitud máx.
            <input
              type="number" step="0.1" min="-2" max="10"
              placeholder="Cualquiera"
              value={formulario.max_magnitude}
              onChange={e => setFormulario(v => ({
                ...v, max_magnitude: e.target.value
              }))}
            />
          </label>

          <label>
            Profundidad mín. (km)
            <input
              type="number" min="0" max="750"
              placeholder="Cualquiera"
              value={formulario.min_depth}
              onChange={e => setFormulario(v => ({
                ...v, min_depth: e.target.value
              }))}
            />
          </label>

          <label>
            Profundidad máx. (km)
            <input
              type="number" min="0" max="750"
              placeholder="Cualquiera"
              value={formulario.max_depth}
              onChange={e => setFormulario(v => ({
                ...v, max_depth: e.target.value
              }))}
            />
          </label>

          <label>
            Fuente
            <select
              value={formulario.fuente}
              onChange={e => setFormulario(v => ({
                ...v, fuente: e.target.value
              }))}
            >
              <option value="">Todas</option>
              <option value="USGS">USGS</option>
              <option value="IGP">IGP</option>
            </select>
          </label>
        </div>

        <div className="cat-filter-actions">
          <button type="submit" className="cat-primary">
            <Search size={16}/>
            Aplicar filtros
          </button>

          <button type="button" onClick={limpiar}>
            Limpiar filtros
          </button>
        </div>
      </form>

      {error && <p role="alert" className="cat-error">{error}</p>}
      {cargando && <p role="status" className="cat-loading">Consultando eventos...</p>}

      <div className="cat-summary">
        <article>
          <span>Eventos encontrados</span>
          <strong>{total.toLocaleString("es-PE")}</strong>
        </article>

        <article>
          <span>Registros en pantalla</span>
          <strong>{datos?.eventos.length ?? 0}</strong>
        </article>

        <article>
          <span>Última consulta</span>
          <strong className="cat-summary-date">
            {fecha(datos?.consultado_utc ?? null)}
          </strong>
        </article>
      </div>

      {modo === "mapa" && (
        <section className="cat-card">
          <div className="cat-section-head">
            <div>
              <h2>Epicentros registrados</h2>
              <p>
                {datos?.eventos.length ?? 0} ubicaciones consultadas
                {total > limite && " · Hay más resultados disponibles"}
              </p>
            </div>

            <button
              type="button"
              onClick={buscarZona}
              disabled={cargando}
            >
              <Search size={15}/>
              Buscar en esta zona
            </button>
          </div>

          {zona && (
            <div className="cat-zone">
              <span>Filtro: área visible del mapa</span>

              <button
                type="button"
                onClick={() => {
                  setZona(null);
                  setPagina(1);
                }}
              >
                Quitar filtro
              </button>
            </div>
          )}

          <div className="cat-map">
            <MapContainer
              key={peru ? "catalogo-pe" : "catalogo-global"}
              ref={mapaRef}
              center={peru ? [-9.2, -75] : [15, 0]}
              zoom={peru ? 5 : 2}
              scrollWheelZoom
              style={{ width: "100%", height: "100%" }}
            >
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {grupos.map((grupo, i) => (
                <CircleMarker
                  key={i}
                  center={[grupo.latitud, grupo.longitud]}
                  radius={Math.min(
                    19,
                    5 + Math.sqrt(grupo.eventos.length) * 3
                  )}
                  pathOptions={{
                    color: color(grupo.magnitud),
                    fillColor: color(grupo.magnitud),
                    fillOpacity: 0.65,
                    weight: 2
                  }}
                >
                  <Popup>
                    <strong>
                      {grupo.eventos.length === 1
                        ? grupo.eventos[0].lugar || "Epicentro"
                        : `${grupo.eventos.length} eventos agrupados`}
                    </strong>

                    <p>
                      Magnitud máxima observada:
                      {" "}{grupo.magnitud.toFixed(1)}
                    </p>

                    {grupo.eventos.slice(0, 5).map(e => (
                      <button
                        type="button"
                        className="cat-popup-button"
                        key={e.id}
                        onClick={() => setSeleccionado(e.id)}
                      >
                        M {e.magnitud.toFixed(1)}
                        {" · "}
                        {e.lugar || "Sin localidad"}
                      </button>
                    ))}

                    {grupo.eventos.length > 5 && (
                      <p>
                        Otros {grupo.eventos.length - 5} eventos
                        en este grupo.
                      </p>
                    )}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>

          <div className="cat-legend">
            <span><i style={{background: "#438be1"}}/>Magnitud menor a 3</span>
            <span><i style={{background: "#10b7bd"}}/>Magnitud 3 a 4,9</span>
            <span><i style={{background: "#df9748"}}/>Magnitud 5 o más</span>
          </div>

          <p className="cat-footnote">
            Los puntos cercanos se agrupan para facilitar la lectura.
            Los colores indican magnitud observada, no riesgo ni zonas
            de impacto. El mapa muestra hasta 500 registros por página.
          </p>
        </section>
      )}

      <section className="cat-card">
        <div className="cat-section-head">
          <div>
            <h2>
              {modo === "mapa"
                ? "Eventos del mapa"
                : "Catálogo de eventos"}
            </h2>
            <p>
              Selecciona un registro para consultar todos sus datos.
            </p>
          </div>
          <CalendarDays size={19}/>
        </div>

        <div className="cat-table-wrap">
          <table className="cat-table">
            <thead>
              <tr>
                <th>Fecha UTC</th>
                <th>Ubicación</th>
                <th>Magnitud</th>
                <th>Profundidad</th>
                <th>Fuente</th>
                <th>Detalle</th>
              </tr>
            </thead>

            <tbody>
              {datos?.eventos.map(e => (
                <tr key={e.id}>
                  <td>{fecha(e.fecha_utc, true)}</td>
                  <td>{e.lugar || "No especificada"}</td>
                  <td>
                    <span className="cat-mag" style={{
                      color: color(e.magnitud),
                      borderColor: color(e.magnitud)
                    }}>
                      {e.magnitud.toFixed(1)}
                    </span>
                  </td>
                  <td>
                    {e.profundidad_km === null
                      ? "—"
                      : `${e.profundidad_km} km`}
                  </td>
                  <td>{e.fuente}</td>
                  <td>
                    <button
                      type="button"
                      className="cat-view"
                      onClick={() => setSeleccionado(e.id)}
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}

              {!cargando && !datos?.eventos.length && (
                <tr>
                  <td colSpan={6} className="cat-empty">
                    No se encontraron sismos con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="cat-pagination">
          <button
            type="button"
            disabled={cargando || pagina <= 1}
            onClick={() => setPagina(p => Math.max(1, p - 1))}
          >
            Anterior
          </button>

          <span>
            Página {pagina} de {paginas}
          </span>

          <button
            type="button"
            disabled={cargando || pagina >= paginas}
            onClick={() => setPagina(p => p + 1)}
          >
            Siguiente
          </button>
        </div>
      </section>

      {seleccionado && (
        <div
          className="cat-overlay"
          onClick={() => setSeleccionado(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del evento sísmico"
            className="cat-dialog"
            onClick={e => e.stopPropagation()}
          >
            <header className="cat-dialog-head">
              <div>
                <span className="cat-eyebrow">FICHA DEL EVENTO</span>
                <h2>Información del sismo</h2>
              </div>

              <button
                type="button"
                aria-label="Cerrar detalle"
                onClick={() => setSeleccionado(null)}
              >
                <X size={22}/>
              </button>
            </header>

            {errorDetalle && (
              <p className="cat-error">{errorDetalle}</p>
            )}

            {!detalle && !errorDetalle && (
              <p className="cat-loading">Cargando ficha...</p>
            )}

            {detalle && (
              <>
                <div className="cat-detail-grid">
                  {[
                    ["ID externo", detalle.id_externo],
                    ["Proveedor", detalle.fuente],
                    ["Organización", detalle.fuente_organizacion || "—"],
                    ["Fecha y hora UTC", fecha(detalle.fecha_utc, true)],
                    ["Hora de Perú", fecha(detalle.fecha_utc)],
                    ["Magnitud", detalle.magnitud.toFixed(1)],
                    ["Tipo de magnitud", detalle.tipo_magnitud || "No informado"],
                    [
                      "Profundidad",
                      detalle.profundidad_km === null
                        ? "No informada"
                        : `${detalle.profundidad_km} km`
                    ],
                    ["Localidad", detalle.lugar || "No informada"],
                    ["Región estructurada", detalle.region || "No disponible"],
                    ["Latitud", String(detalle.latitud)],
                    ["Longitud", String(detalle.longitud)],
                    ["Revisión", detalle.estado_revision],
                    ["Recepción", fecha(detalle.fecha_recepcion_utc, true)]
                  ].map(([nombre, contenido]) => (
                    <div key={nombre} className="cat-detail-field">
                      <small>{nombre}</small>
                      <strong>{contenido}</strong>
                    </div>
                  ))}
                </div>

                <div className="cat-detail-map">
                  <MapContainer
                    center={[detalle.latitud, detalle.longitud]}
                    zoom={7}
                    scrollWheelZoom={false}
                    style={{width: "100%", height: "100%"}}
                  >
                    <TileLayer
                      attribution="&copy; OpenStreetMap contributors"
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <CircleMarker
                      center={[detalle.latitud, detalle.longitud]}
                      radius={10}
                      pathOptions={{
                        color: color(detalle.magnitud),
                        fillOpacity: 0.7
                      }}
                    />
                  </MapContainer>
                </div>

                <div className="cat-origin">
                  <strong>Procedencia del registro</strong>
                  <small>ID interno: {detalle.id}</small>
                  <small>
                    Huella calculada del proveedor e ID externo:
                    {" "}{detalle.huella_origen_calculada || "—"}
                  </small>

                  {detalle.url && (
                    <a
                      href={detalle.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir registro original
                      <ExternalLink size={15}/>
                    </a>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
