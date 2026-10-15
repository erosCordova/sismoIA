import { useContext, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  MapContainer, TileLayer, CircleMarker, Popup
} from "react-leaflet";
import {
  Activity, ArrowUpRight, BarChart3,
  Clock3, Database, MapPinned, RefreshCw
} from "lucide-react";

import { TokenContext } from "./AuthGate";
import DashboardOperations from "./DashboardOperations";

import "leaflet/dist/leaflet.css";
import "./dashboard-enterprise.css";

type Evento = {
  id: string;
  fuente: string;
  fecha_utc: string;
  latitud: number;
  longitud: number;
  magnitud: number;
  profundidad_km: number | null;
  lugar: string | null;
  url: string | null;
};

type Resumen = {
  periodo: string;
  total: number;
  calculado_utc: string;
  inicio_utc: string;
  magnitud_maxima: number | null;
  profundidad_media_km: number | null;
  profundidad_mediana_km: number | null;
  profundidades_disponibles: number;
  lugares_disponibles: number;
  latencia_media_horas: number | null;
  ultima_sincronizacion_utc: string | null;
  serie: { indice: number; cantidad: number }[];
  magnitudes: { nombre: string; cantidad: number }[];
  eventos_recientes: Evento[];
  eventos_mapa: Evento[];
  mapa_limitado: boolean;
};

type Props = {
  peru: boolean;
  eventos?: unknown;
  total?: number;
  estadisticas?: unknown;
  cargando?: boolean;
  fuente?: string;
};

function fecha(valor: string | null) {
  if (!valor) return "No registrada";

  const d = new Date(valor);

  if (Number.isNaN(d.getTime())) {
    return "Fecha no disponible";
  }

  return d.toLocaleString("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short"
  });
}

function valor(numero: number | null, unidad = "") {
  return numero === null
    ? "—"
    : `${numero.toLocaleString("es-PE", {
        maximumFractionDigits: 2
      })}${unidad}`;
}

const periodos = [
  { valor: "24h", nombre: "Últimas 24 horas" },
  { valor: "7d", nombre: "Últimos 7 días" },
  { valor: "30d", nombre: "Últimos 30 días" },
  { valor: "90d", nombre: "Últimos 90 días" },
  { valor: "todos", nombre: "Todo el historial" }
];

export default function SismoiaDashboard({ peru }: Props) {
  const token = useContext(TokenContext);

  const [periodo, setPeriodo] = useState("7d");
  const [fuente, setFuente] = useState("");
  const [revision, setRevision] = useState(0);

  const [datos, setDatos] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setCargando(false);
      return;
    }

    const controlador = new AbortController();

    async function consultar() {
      setCargando(true);
      setError("");
      setDatos(null);

      const params = new URLSearchParams({
        peru: String(peru),
        periodo
      });

      if (fuente) params.set("fuente", fuente);

      try {
        const respuesta = await fetch(
          `/api/v1/dashboard/overview?${params}`,
          {
            signal: controlador.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!respuesta.ok) {
          throw new Error(
            `No se pudo consultar el Dashboard: HTTP ${respuesta.status}`
          );
        }

        const resultado: Resumen = await respuesta.json();

        if (!controlador.signal.aborted) {
          setDatos(resultado);
        }
      } catch (e) {
        if (!controlador.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "No se pudo consultar el Dashboard"
          );
        }
      } finally {
        if (!controlador.signal.aborted) {
          setCargando(false);
        }
      }
    }

    void consultar();

    return () => controlador.abort();
  }, [token, periodo, fuente, peru, revision]);

  const serie = datos?.serie ?? [];

  const maxSerie = Math.max(
    1,
    ...serie.map(p => p.cantidad)
  );

  const puntos = serie.map((p, i) => {
    const x = serie.length > 1
      ? (i / (serie.length - 1)) * 540
      : 270;

    const y = 112 - (p.cantidad / maxSerie) * 95;

    return `${x},${y}`;
  }).join(" ");

  const maxMagnitud = Math.max(
    1,
    ...(datos?.magnitudes ?? []).map(m => m.cantidad)
  );

  return (
    <div className="dash">
      <header className="dash-welcome">
        <div>
          <span className="dash-eyebrow">
            <Activity size={14} />
            CENTRO DE MONITOREO
          </span>

          <h2>Resumen de actividad sísmica</h2>

          <p>
            {peru ? "Perú" : "Mundo"}
            {" · "}
            Datos registrados en SISMOIA
          </p>
        </div>

        <div className="dash-filter-group">
          <label className="dash-periodo">
            Periodo
            <select
              value={periodo}
              onChange={e => setPeriodo(e.target.value)}
            >
              {periodos.map(p => (
                <option value={p.valor} key={p.valor}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="dash-periodo">
            Fuente
            <select
              value={fuente}
              onChange={e => setFuente(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="USGS">USGS</option>
              <option value="IGP">IGP</option>
            </select>
          </label>

          <button
            className="dash-refresh"
            type="button"
            disabled={cargando}
            onClick={() => setRevision(v => v + 1)}
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>
      </header>

      {cargando && (
        <p className="seis-notice" role="status">
          Consultando registros sísmicos...
        </p>
      )}

      {error && (
        <p className="seis-error" role="alert">
          {error}
        </p>
      )}

      {datos && (
        <>
          <section className="dash-kpis">
            <article className="dash-kpi dash-kpi-blue">
              <div className="dash-kpi-top">
                <span>Eventos registrados</span>
                <Activity size={19} />
              </div>
              <strong>
                {datos.total.toLocaleString("es-PE")}
              </strong>
              <small>En el periodo y zona seleccionados</small>
            </article>

            <article className="dash-kpi dash-kpi-cyan">
              <div className="dash-kpi-top">
                <span>Mayor magnitud</span>
                <BarChart3 size={19} />
              </div>
              <strong>
                {valor(datos.magnitud_maxima)}
              </strong>
              <small>Magnitud máxima registrada</small>
            </article>

            <article className="dash-kpi dash-kpi-purple">
              <div className="dash-kpi-top">
                <span>Profundidad media</span>
                <Database size={19} />
              </div>
              <strong>
                {valor(datos.profundidad_media_km, " km")}
              </strong>
              <small>
                {datos.profundidades_disponibles} registros con profundidad
              </small>
            </article>

            <article className="dash-kpi dash-kpi-orange">
              <div className="dash-kpi-top">
                <span>Profundidad mediana</span>
                <Database size={19} />
              </div>
              <strong>
                {valor(datos.profundidad_mediana_km, " km")}
              </strong>
              <small>Valor central de las profundidades</small>
            </article>
          </section>

          <div className="dash-main-grid">
            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3>Actividad sísmica</h3>
                  <p>
                    {datos.total.toLocaleString("es-PE")} registros
                    {" · "}10 intervalos del periodo
                  </p>
                </div>
                <BarChart3 size={20} />
              </header>

              {datos.total > 0 ? (
                <div className="dash-line-wrap">
                  <svg
                    className="dash-line"
                    viewBox="0 0 540 135"
                    role="img"
                    aria-label="Cantidad de eventos sísmicos en diez intervalos del periodo"
                  >
                    {[20, 65, 112].map(y => (
                      <line
                        key={y}
                        x1="0"
                        x2="540"
                        y1={y}
                        y2={y}
                        stroke="#e8eef6"
                        strokeDasharray="5 6"
                      />
                    ))}

                    <polyline
                      points={puntos}
                      fill="none"
                      stroke="#0da4b6"
                      strokeWidth="3.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />

                    {serie.map((p, i) => {
                      const x = serie.length > 1
                        ? i * 540 / (serie.length - 1)
                        : 270;

                      const y = 112 -
                        (p.cantidad / maxSerie) * 95;

                      return (
                        <circle
                          key={p.indice}
                          cx={x}
                          cy={y}
                          r="4"
                          fill="#087d9b"
                        >
                          <title>
                            Intervalo {p.indice + 1}:
                            {" "}{p.cantidad} eventos
                          </title>
                        </circle>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <p className="dash-empty">
                  No hay eventos para estos filtros.
                </p>
              )}

              <div className="dash-chart-foot">
                <span>Inicio</span>
                <span>Eventos por intervalo</span>
                <span>Fin del periodo</span>
              </div>
            </section>

            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3>Últimos sismos</h3>
                  <p>5 registros más recientes del periodo</p>
                </div>
                <Link to="/eventos">
                  <ArrowUpRight size={20} />
                </Link>
              </header>

              <div className="dash-recent">
                {datos.eventos_recientes.map(e => (
                  <div className="dash-event" key={e.id}>
                    <span
                      className={
                        e.magnitud >= 5
                          ? "dash-mag dash-mag-high"
                          : "dash-mag"
                      }
                    >
                      {e.magnitud.toFixed(1)}
                    </span>

                    <div>
                      <strong>
                        {e.lugar || "Ubicación no especificada"}
                      </strong>

                      <small>
                        {fecha(e.fecha_utc)}
                        {" · "}{e.fuente}
                      </small>
                    </div>

                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Consultar registro de origen"
                      >
                        <ArrowUpRight size={16} />
                      </a>
                    )}
                  </div>
                ))}

                {!datos.eventos_recientes.length && (
                  <p className="dash-empty">
                    No se encontraron eventos.
                  </p>
                )}
              </div>

              <Link className="dash-text-link" to="/eventos">
                Consultar todos los eventos
                <ArrowUpRight size={15} />
              </Link>
            </section>
          </div>

          <section className="dash-card dash-map-card">
            <header className="dash-card-head">
              <div>
                <h3>
                  <MapPinned size={19} />
                  Mapa de epicentros
                </h3>

                <p>
                  {datos.eventos_mapa.length} ubicaciones recientes
                  {" · "}{peru ? "Perú" : "Mundo"}
                </p>
              </div>

              <Link className="dash-link" to="/mapa">
                Abrir mapa completo
                <ArrowUpRight size={16} />
              </Link>
            </header>

            <div className="dash-map">
              <MapContainer
                key={peru ? "dash-peru" : "dash-mundo"}
                center={peru ? [-9.2, -75] : [15, 0]}
                zoom={peru ? 5 : 2}
                scrollWheelZoom={false}
                style={{
                  height: "100%",
                  width: "100%"
                }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {datos.eventos_mapa.map(e => (
                  <CircleMarker
                    key={e.id}
                    center={[e.latitud, e.longitud]}
                    radius={Math.max(
                      4,
                      Math.min(14, e.magnitud * 2)
                    )}
                    pathOptions={{
                      color: e.magnitud >= 5
                        ? "#e67b37" : "#0e9ab9",
                      fillOpacity: 0.7
                    }}
                  >
                    <Popup>
                      <strong>
                        {e.lugar || "Epicentro"}
                      </strong>

                      <p>
                        Magnitud {e.magnitud}
                        {" · "}Profundidad{" "}
                        {e.profundidad_km ?? "—"} km
                      </p>

                      <p>
                        {fecha(e.fecha_utc)}
                        {" · "}{e.fuente}
                      </p>

                      {e.url && (
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Consultar fuente
                        </a>
                      )}
                    </Popup>
                  </CircleMarker>
                ))}
              </MapContainer>
            </div>

            <div className="dash-map-legend">
              <span>
                <i className="dash-dot-cyan" />
                Magnitud menor a 5
              </span>
              <span>
                <i className="dash-dot-orange" />
                Magnitud 5 o mayor
              </span>
              <span>
                Hasta 150 eventos recientes del periodo
              </span>
            </div>
          </section>

          <div className="dash-bottom-grid">
            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3>Sismos por magnitud</h3>
                  <p>
                    {datos.total.toLocaleString("es-PE")}
                    {" "}registros del periodo
                  </p>
                </div>
                <BarChart3 size={20} />
              </header>

              <div className="dash-bars">
                {datos.magnitudes.map(m => (
                  <div
                    className="dash-bar-row"
                    key={m.nombre}
                  >
                    <span>{m.nombre}</span>

                    <div className="dash-bar-track">
                      <div
                        style={{
                          width: `${
                            m.cantidad /
                            maxMagnitud * 100
                          }%`
                        }}
                      />
                    </div>

                    <strong>{m.cantidad}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="dash-card">
              <header className="dash-card-head">
                <div>
                  <h3>Estado de los datos</h3>
                  <p>Calidad y seguimiento</p>
                </div>

                <Database size={20} />
              </header>

              <div className="dash-status-row">
                <span>
                  <Clock3 size={16} />
                  Última sincronización
                </span>

                <strong>
                  {fecha(datos.ultima_sincronizacion_utc)}
                </strong>
              </div>

              <div className="dash-status-row">
                <span>
                  <Database size={16} />
                  Profundidad disponible
                </span>

                <strong>
                  {datos.profundidades_disponibles}
                  {" / "}{datos.total}
                </strong>
              </div>

              <div className="dash-status-row">
                <span>
                  <MapPinned size={16} />
                  Lugar identificado
                </span>

                <strong>
                  {datos.lugares_disponibles}
                  {" / "}{datos.total}
                </strong>
              </div>

              <div className="dash-status-row">
                <span>
                  <Clock3 size={16} />
                  Tiempo medio de recepción
                </span>

                <strong>
                  {valor(datos.latencia_media_horas, " h")}
                </strong>
              </div>

              <DashboardOperations />

              <div className="dash-status-links">
                <Link to="/fuentes">
                  Estado de fuentes
                  <ArrowUpRight size={15} />
                </Link>

                <Link to="/datos">
                  Calidad de datos
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </section>
          </div>

          <p className="dash-footnote">
            Datos registrados hasta {fecha(datos.calculado_utc)}.
            Los indicadores y gráficos utilizan todos los
            registros que cumplen los filtros. El mapa muestra
            como máximo los 150 más recientes.
            Un mismo sismo puede aparecer en más de una fuente.
            SISMOIA no predice terremotos con certeza.
            Las estimaciones no son alertas oficiales.
          </p>
        </>
      )}
    </div>
  );
}
