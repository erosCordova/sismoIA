import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import {
  Activity, ArrowUpRight, BarChart3, Bell,
  Clock3, Database, MapPinned, Radio
} from "lucide-react";
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

type Estadisticas = {
  total_eventos: number;
  eventos_peru: number;
  magnitud_maxima: number | null;
  ultima_sincronizacion_utc: string | null;
  fuente: string | null;
};

type Props = {
  eventos: Evento[];
  total: number;
  estadisticas: Estadisticas | null;
  peru: boolean;
  cargando: boolean;
};

type Periodo = "24h" | "7d" | "30d" | "90d" | "todos";

const etiquetas: Record<Periodo, string> = {
  "24h": "Últimas 24 horas",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  "90d": "Últimos 90 días",
  todos: "Todas las fechas disponibles"
};

function fecha(valor: string | null) {
  if (!valor || !Number.isFinite(Date.parse(valor))) {
    return "No disponible";
  }

  return new Date(valor).toLocaleString("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Lima"
  });
}

function promedio(numeros: number[]) {
  if (!numeros.length) return null;
  return numeros.reduce((a, b) => a + b, 0) / numeros.length;
}

function mediana(numeros: number[]) {
  if (!numeros.length) return null;

  const datos = [...numeros].sort((a, b) => a - b);
  const mitad = Math.floor(datos.length / 2);

  return datos.length % 2
    ? datos[mitad]
    : (datos[mitad - 1] + datos[mitad]) / 2;
}

export default function SismoiaDashboard({
  eventos,
  total,
  estadisticas,
  peru,
  cargando
}: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("7d");

  const ahora = Date.now();

  const duraciones: Record<Exclude<Periodo, "todos">, number> = {
    "24h": 86400000,
    "7d": 7 * 86400000,
    "30d": 30 * 86400000,
    "90d": 90 * 86400000
  };

  const visibles = useMemo(() => {
    const desde = periodo === "todos"
      ? -Infinity
      : ahora - duraciones[periodo];

    return eventos
      .filter(e => {
        const instante = Date.parse(e.fecha_utc);
        return Number.isFinite(instante)
          && instante >= desde
          && instante <= ahora;
      })
      .sort(
        (a, b) =>
          Date.parse(b.fecha_utc) - Date.parse(a.fecha_utc)
      );
  }, [eventos, periodo, ahora]);

  const profundidades = visibles
    .map(e => e.profundidad_km)
    .filter(
      (n): n is number =>
        n !== null && Number.isFinite(n)
    );

  const profundidadMedia = promedio(profundidades);
  const profundidadMediana = mediana(profundidades);

  const magnitudMaxima = visibles.length
    ? Math.max(...visibles.map(e => e.magnitud))
    : null;

  const eventosMapa = visibles
    .filter(
      e =>
        Number.isFinite(e.latitud) &&
        Number.isFinite(e.longitud) &&
        Math.abs(e.latitud) <= 90 &&
        Math.abs(e.longitud) <= 180
    )
    .slice(0, 150);

  const porcentajeValido = visibles.length
    ? Math.round(
        (visibles.filter(
          e =>
            Number.isFinite(e.latitud) &&
            Number.isFinite(e.longitud) &&
            Math.abs(e.latitud) <= 90 &&
            Math.abs(e.longitud) <= 180
        ).length / visibles.length) * 100
      )
    : null;

  const rangos = [
    { nombre: "Menos de 2", desde: -Infinity, hasta: 2 },
    { nombre: "2 a 2,9", desde: 2, hasta: 3 },
    { nombre: "3 a 3,9", desde: 3, hasta: 4 },
    { nombre: "4 a 4,9", desde: 4, hasta: 5 },
    { nombre: "5 o más", desde: 5, hasta: Infinity }
  ];

  const magnitudes = rangos.map(r => ({
    nombre: r.nombre,
    cantidad: visibles.filter(
      e =>
        e.magnitud >= r.desde &&
        e.magnitud < r.hasta
    ).length
  }));

  const maxBarra = Math.max(
    1,
    ...magnitudes.map(m => m.cantidad)
  );

  const instantes = visibles.map(
    e => Date.parse(e.fecha_utc)
  );

  const inicio = periodo === "todos"
    ? (
        instantes.length
          ? Math.min(...instantes)
          : ahora - 86400000
      )
    : ahora - duraciones[periodo];

  const amplitud = Math.max(1, ahora - inicio);

  const intervalos = Array.from(
    { length: 10 },
    (_, indice) => ({
      indice,
      valor: visibles.filter(e => {
        const posicion = Math.min(
          9,
          Math.floor(
            ((Date.parse(e.fecha_utc) - inicio) / amplitud) * 10
          )
        );

        return posicion === indice;
      }).length
    })
  );

  const maxSerie = Math.max(
    1,
    ...intervalos.map(i => i.valor)
  );

  const puntos = intervalos
    .map(
      (i, indice) =>
        `${indice * 60},${112 - (i.valor / maxSerie) * 95}`
    )
    .join(" ");

  const fuentes = Array.from(
    new Set(
      visibles.map(e => e.fuente).filter(Boolean)
    )
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
            Eventos registrados · {peru ? "Perú" : "Mundo"}
            {" · "}Datos observados
          </p>
        </div>

        <label className="dash-periodo">
          Periodo de análisis

          <select
            value={periodo}
            onChange={e =>
              setPeriodo(e.target.value as Periodo)
            }
          >
            {(Object.keys(etiquetas) as Periodo[]).map(p => (
              <option key={p} value={p}>
                {etiquetas[p]}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="dash-kpis">

        <article className="dash-kpi dash-kpi-blue">
          <div className="dash-kpi-top">
            <span>Eventos del catálogo</span>
            <Activity size={19} />
          </div>

          <strong>
            {cargando && !estadisticas
              ? "—"
              : total.toLocaleString("es-PE")}
          </strong>

          <small>
            Total de la consulta por zona y fuente
          </small>
        </article>

        <article className="dash-kpi dash-kpi-cyan">
          <div className="dash-kpi-top">
            <span>Eventos del periodo</span>
            <BarChart3 size={19} />
          </div>

          <strong>
            {visibles.length.toLocaleString("es-PE")}
          </strong>

          <small>
            Calculado con {eventos.length} registros recientes
          </small>
        </article>

        <article className="dash-kpi dash-kpi-purple">
          <div className="dash-kpi-top">
            <span>Mayor magnitud</span>
            <Activity size={19} />
          </div>

          <strong>
            {magnitudMaxima === null
              ? "—"
              : magnitudMaxima.toFixed(1)}
          </strong>

          <small>
            En la muestra del periodo seleccionado
          </small>
        </article>

        <article className="dash-kpi dash-kpi-orange">
          <div className="dash-kpi-top">
            <span>Profundidad media</span>
            <Database size={19} />
          </div>

          <strong>
            {profundidadMedia === null
              ? "—"
              : `${profundidadMedia.toFixed(1)} km`}
          </strong>

          <small>
            Mediana:{" "}
            {profundidadMediana === null
              ? "—"
              : `${profundidadMediana.toFixed(1)} km`}
          </small>
        </article>

      </section>

      <div className="dash-main-grid">

        <section className="dash-card">
          <header className="dash-card-head">
            <div>
              <h3>Actividad sísmica</h3>
              <p>
                {etiquetas[periodo]}
                {" · "}
                {visibles.length} registros de la muestra
              </p>
            </div>

            <BarChart3 size={20} />
          </header>

          <div className="dash-line-wrap">
            {visibles.length ? (
              <svg
                className="dash-line"
                viewBox="0 0 540 135"
                role="img"
                aria-label="Actividad sísmica distribuida en diez intervalos de tiempo"
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

                <polygon
                  points={`0,130 ${puntos} 540,130`}
                  fill="#0fb9c6"
                  fillOpacity="0.10"
                />

                <polyline
                  points={puntos}
                  fill="none"
                  stroke="#0da4b6"
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {intervalos.map((i, indice) => (
                  <circle
                    key={indice}
                    cx={indice * 60}
                    cy={112 - (i.valor / maxSerie) * 95}
                    r="4"
                    fill="#087d9b"
                  >
                    <title>
                      {i.valor} eventos en el intervalo {indice + 1}
                    </title>
                  </circle>
                ))}
              </svg>
            ) : (
              <p className="dash-empty">
                No hay eventos en el periodo seleccionado.
              </p>
            )}
          </div>

          <div className="dash-chart-foot">
            <span>Inicio</span>
            <span>Cantidad de eventos por intervalo</span>
            <span>Actualidad</span>
          </div>
        </section>

        <section className="dash-card">
          <header className="dash-card-head">
            <div>
              <h3>Últimos sismos</h3>
              <p>Registros recientes</p>
            </div>

            <Link
              to="/eventos"
              aria-label="Consultar eventos sísmicos"
            >
              <ArrowUpRight size={20} />
            </Link>
          </header>

          <div className="dash-recent">
            {visibles.slice(0, 5).map(e => (
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
                    {" · "}
                    {e.fuente}
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

            {!visibles.length && (
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
              {eventosMapa.length} ubicaciones visibles
              {" · "}
              {peru ? "Perú" : "Mundo"}
            </p>
          </div>

          <Link className="dash-link" to="/mapa">
            Abrir mapa completo
            <ArrowUpRight size={16} />
          </Link>
        </header>

        <div className="dash-map">
          <MapContainer
            key={peru ? "dashboard-pe" : "dashboard-global"}
            center={peru ? [-9.2, -75] : [15, 0]}
            zoom={peru ? 5 : 2}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {eventosMapa.map(e => (
              <CircleMarker
                key={e.id}
                center={[e.latitud, e.longitud]}
                radius={Math.max(
                  4,
                  Math.min(14, e.magnitud * 2)
                )}
                pathOptions={{
                  color: e.magnitud >= 5
                    ? "#e67b37"
                    : "#0e9ab9",
                  fillColor: e.magnitud >= 5
                    ? "#ed994a"
                    : "#1bc8cc",
                  fillOpacity: 0.72,
                  weight: 1.5
                }}
              >
                <Popup>
                  <strong>
                    {e.lugar || "Epicentro"}
                  </strong>

                  <p>
                    Magnitud {e.magnitud.toFixed(1)}
                    {" · "}
                    Profundidad {e.profundidad_km ?? "—"} km
                  </p>

                  <p>
                    {fecha(e.fecha_utc)}
                    {" · "}
                    {e.fuente}
                  </p>

                  {e.url && (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Consultar registro de origen
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
            Círculos según magnitud observada
          </span>
        </div>
      </section>

      <div className="dash-bottom-grid">

        <section className="dash-card">
          <header className="dash-card-head">
            <div>
              <h3>Sismos por magnitud</h3>
              <p>
                {visibles.length} eventos de la muestra
              </p>
            </div>

            <BarChart3 size={20} />
          </header>

          <div className="dash-bars">
            {magnitudes.map(m => (
              <div
                className="dash-bar-row"
                key={m.nombre}
              >
                <span>{m.nombre}</span>

                <div className="dash-bar-track">
                  <div
                    style={{
                      width: `${(m.cantidad / maxBarra) * 100}%`
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
              <p>Información y actualización</p>
            </div>

            <Radio size={20} />
          </header>

          <div className="dash-status-row">
            <span>
              <Clock3 size={16} />
              Última sincronización
            </span>

            <strong>
              {fecha(
                estadisticas?.ultima_sincronizacion_utc
                  ?? null
              )}
            </strong>
          </div>

          <div className="dash-status-row">
            <span>
              <Database size={16} />
              Ubicaciones válidas
            </span>

            <strong>
              {porcentajeValido === null
                ? "—"
                : `${porcentajeValido}%`}
            </strong>
          </div>

          <div className="dash-status-row">
            <span>
              <Activity size={16} />
              Profundidades disponibles
            </span>

            <strong>
              {profundidades.length} / {visibles.length}
            </strong>
          </div>

          <div className="dash-status-row">
            <span>
              <Radio size={16} />
              Fuentes en la muestra
            </span>

            <strong>
              {fuentes.join(", ") || "Sin registros"}
            </strong>
          </div>

          <div className="dash-status-row">
            <span>
              <Bell size={16} />
              Alertas activas
            </span>

            <Link to="/alertas">
              Consultar centro
              <ArrowUpRight size={14} />
            </Link>
          </div>

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
        Datos registrados en SISMOIA. Los gráficos del periodo
        utilizan hasta 500 eventos recientes, por lo que no
        representan necesariamente todo el catálogo.
        Las estimaciones experimentales no son alertas oficiales.
      </p>

    </div>
  );
}
