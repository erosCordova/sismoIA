import { useContext, useEffect, useState } from "react";
import {apiError} from "./apiErrors";
import {
  Bar, BarChart, CartesianGrid,
  Line, LineChart, Scatter, ScatterChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import {
  BarChart3, RefreshCw, Download, Activity
} from "lucide-react";
import { TokenContext } from "./AuthGate";
import "./preparation.css";

type Filtros = {
  fuente: string;
  fecha_desde: string;
  fecha_hasta: string;
  magnitud_min: string;
  profundidad_max: string;
  agrupacion: string;
};

type Punto = {
  fecha: string;
  cantidad: number;
};

type Distribucion = {
  etiqueta: string;
  cantidad: number;
};

type Datos = {
  total: number;
  magnitud_media: number | null;
  magnitud_mediana: number | null;
  profundidad_media: number | null;
  profundidad_mediana: number | null;
  correlacion: number | null;
  faltantes_profundidad: number;
  faltantes_tipo_magnitud: number;
  pares_comparables: number;
  fecha_consulta_utc: string;
  agrupacion: string;
  serie: Punto[];
  magnitudes: Distribucion[];
  profundidades: Distribucion[];
  fuentes: {nombre: string; cantidad: number}[];
  zonas: {zona: string; cantidad: number}[];
  dispersion: {
    magnitud: number;
    profundidad: number;
    fecha: string;
    fuente: string;
  }[];
  nota: string;
};

function formato(n: number | null | undefined) {
  return n == null
    ? "—"
    : n.toLocaleString("es-PE", {
        maximumFractionDigits: 3
      });
}

const fechaInicial = new Date(
  Date.now() - 90 * 86400000
).toISOString().slice(0, 10);

const inicial: Filtros = {
  fuente: "",
  fecha_desde: fechaInicial,
  fecha_hasta: "",
  magnitud_min: "",
  profundidad_max: "",
  agrupacion: "semana"
};

function descargarCSV(datos: Datos) {
  const filas = [
    ["Fecha UTC", "Cantidad de eventos"],
    ...datos.serie.map(x => [x.fecha, String(x.cantidad)])
  ];

  const texto = "\ufeff" + filas
    .map(f => f.join(";"))
    .join("\r\n");

  const url = URL.createObjectURL(
    new Blob([texto], {
      type: "text/csv;charset=utf-8"
    })
  );

  const a = document.createElement("a");
  a.href = url;
  a.download = "SISMOIA_analisis_temporal.csv";
  a.click();

  URL.revokeObjectURL(url);
}

export default function AnalyticsWorkspace({
  peru
}: {
  peru: boolean
}) {
  const token = useContext(TokenContext);

  const [formulario, setFormulario] =
    useState<Filtros>(inicial);

  const [filtros, setFiltros] =
    useState<Filtros>(inicial);

  const [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    async function cargar() {
      setCargando(true);
      setError("");
      setDatos(null);

      const params = new URLSearchParams({
        peru: String(peru)
      });

      Object.entries(filtros).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });

      try {
        const r = await fetch(
          `/api/v1/analytics/explorer?${params}`,
          {
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!r.ok) {
          throw Error(await apiError(r, "No se pudo consultar el análisis"));
        }

        const resultado: Datos = await r.json();

        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "Error de consulta"
          );
        }
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }

    void cargar();
    return () => ctrl.abort();
  }, [token, filtros, peru, revision]);

  const cambiar = (campo: keyof Filtros, valor: string) =>
    setFormulario(v => ({
      ...v, [campo]: valor
    }));

  const aplicar = () => {
    if (
      formulario.fecha_desde &&
      formulario.fecha_hasta &&
      formulario.fecha_desde > formulario.fecha_hasta
    ) {
      setError("Revisa el intervalo de fechas.");
      return;
    }

    setFiltros({...formulario});
    setRevision(n => n + 1);
  };

  return (
    <section className="prep-root">
      <header className="prep-header">
        <div>
          <h2>
            <BarChart3 size={23}/>
            Análisis estadístico sísmico
          </h2>
          <p>
            {peru ? "Perú" : "Mundo"}
            {" · "}Información registrada en PostgreSQL
          </p>
        </div>

        <div className="prep-actions">
          <button
            onClick={() => setRevision(n => n + 1)}
            disabled={cargando}
          >
            <RefreshCw size={16}/> Actualizar
          </button>

          <button
            className="prep-download"
            disabled={!datos}
            onClick={() => datos && descargarCSV(datos)}
          >
            <Download size={16}/> Exportar serie CSV
          </button>
        </div>
      </header>

      <div className="sismo-filter-bar">
        <label>
          Desde (UTC)
          <input
            type="date"
            value={formulario.fecha_desde}
            onChange={e => cambiar(
              "fecha_desde", e.target.value
            )}
          />
        </label>

        <label>
          Hasta (UTC)
          <input
            type="date"
            value={formulario.fecha_hasta}
            onChange={e => cambiar(
              "fecha_hasta", e.target.value
            )}
          />
        </label>

        <label>
          Fuente
          <select
            value={formulario.fuente}
            onChange={e => cambiar("fuente", e.target.value)}
          >
            <option value="">Todas</option>
            <option value="USGS">USGS</option>
            <option value="IGP">IGP</option>
          </select>
        </label>

        <label>
          Magnitud mínima
          <input
            type="number"
            step="0.1"
            min="-2"
            max="10"
            placeholder="Todas"
            value={formulario.magnitud_min}
            onChange={e => cambiar(
              "magnitud_min", e.target.value
            )}
          />
        </label>

        <label>
          Profundidad máxima (km)
          <input
            type="number"
            min="0"
            max="750"
            placeholder="Todas"
            value={formulario.profundidad_max}
            onChange={e => cambiar(
              "profundidad_max", e.target.value
            )}
          />
        </label>

        <label>
          Agrupación
          <select
            value={formulario.agrupacion}
            onChange={e => cambiar(
              "agrupacion", e.target.value
            )}
          >
            <option value="dia">Por día</option>
            <option value="semana">Por semana</option>
            <option value="mes">Por mes</option>
          </select>
        </label>

        <button
          className="sismo-filter-button"
          onClick={aplicar}
          disabled={cargando}
        >
          Aplicar filtros
        </button>
      </div>

      {error && <p className="prep-error" role="alert">{error}</p>}

      {cargando && (
        <p className="prep-loading" role="status">
          Calculando estadísticas...
        </p>
      )}

      {datos && (
        <>
          <div className="prep-metrics">
            <article>
              <span>Eventos registrados</span>
              <strong>{formato(datos.total)}</strong>
            </article>
            <article>
              <span>Magnitud media</span>
              <strong>{formato(datos.magnitud_media)}</strong>
            </article>
            <article>
              <span>Magnitud mediana</span>
              <strong>{formato(datos.magnitud_mediana)}</strong>
            </article>
            <article>
              <span>Profundidad media</span>
              <strong>
                {formato(datos.profundidad_media)} km
              </strong>
            </article>
            <article>
              <span>Profundidad mediana</span>
              <strong>
                {formato(datos.profundidad_mediana)} km
              </strong>
            </article>
            <article>
              <span>Correlación magnitud-profundidad</span>
              <strong>{formato(datos.correlacion)}</strong>
            </article>
          </div>

          <article className="prep-card">
            <h3>
              <Activity size={18}/>
              Actividad sísmica por tiempo
            </h3>
            <p>
              Cantidad de eventos por {datos.agrupacion}.
              Todos los registros que cumplen los filtros.
            </p>

            <div className="prep-chart">
              <ResponsiveContainer width="100%" height={290}>
                <LineChart data={datos.serie}>
                  <CartesianGrid
                    strokeDasharray="4 5"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="fecha"
                    tick={{fontSize: 10}}
                    tickFormatter={v => String(v).slice(0, 10)}
                    minTickGap={22}
                  />
                  <YAxis allowDecimals={false}/>
                  <Tooltip/>
                  <Line
                    type="monotone"
                    dataKey="cantidad"
                    name="Eventos"
                    stroke="#059cb8"
                    strokeWidth={3}
                    dot={datos.serie.length <= 20}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <div className="prep-grid">
            <article className="prep-card">
              <h3>Distribución por magnitud</h3>
              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={datos.magnitudes}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="4 5"
                    />
                    <XAxis
                      dataKey="etiqueta"
                      tick={{fontSize: 10}}
                    />
                    <YAxis allowDecimals={false}/>
                    <Tooltip/>
                    <Bar
                      dataKey="cantidad"
                      name="Eventos"
                      fill="#168cce"
                      radius={[6,6,0,0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="prep-card">
              <h3>Distribución por profundidad</h3>
              <p>Intervalos expresados en kilómetros.</p>
              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={datos.profundidades}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="4 5"
                    />
                    <XAxis
                      dataKey="etiqueta"
                      tick={{fontSize: 10}}
                    />
                    <YAxis allowDecimals={false}/>
                    <Tooltip/>
                    <Bar
                      dataKey="cantidad"
                      name="Eventos"
                      fill="#14b4a6"
                      radius={[6,6,0,0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>

          <div className="prep-grid">
            <article className="prep-card">
              <h3>Magnitud frente a profundidad</h3>
              <p>
                Dispersión de hasta 350 registros recientes
                con profundidad disponible.
              </p>
              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="4 5"/>
                    <XAxis
                      type="number"
                      dataKey="magnitud"
                      name="Magnitud"
                      tick={{fontSize: 11}}
                      domain={["dataMin", "dataMax"]}
                    />
                    <YAxis
                      type="number"
                      dataKey="profundidad"
                      name="Profundidad"
                      unit=" km"
                      width={65}
                      tick={{fontSize: 10}}
                      domain={["dataMin", "dataMax"]}
                    />
                    <Tooltip
                      cursor={{strokeDasharray: "4 4"}}
                    />
                    <Scatter
                      name="Sismos"
                      data={datos.dispersion}
                      fill="#21a1c6"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="prep-card">
              <h3>Zonas con mayor actividad registrada</h3>
              <p>
                Cuadrículas geográficas; no equivalen
                a departamentos o regiones administrativas.
              </p>
              <div className="sismo-zone-list">
                {datos.zonas.map(z => (
                  <div className="prep-detail" key={z.zona}>
                    <span>{z.zona}</span>
                    <strong>{formato(z.cantidad)}</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="prep-grid">
            <article className="prep-card">
              <h3>Procedencia de datos</h3>
              {datos.fuentes.map(f => (
                <div className="prep-detail" key={f.nombre}>
                  <span>{f.nombre}</span>
                  <strong>
                    {formato(f.cantidad)} registros
                  </strong>
                </div>
              ))}
            </article>

            <article className="prep-card">
              <h3>Calidad de información</h3>
              <div className="prep-detail">
                <span>Profundidades faltantes</span>
                <strong>
                  {formato(datos.faltantes_profundidad)}
                </strong>
              </div>
              <div className="prep-detail">
                <span>Tipo de magnitud faltante</span>
                <strong>
                  {formato(datos.faltantes_tipo_magnitud)}
                </strong>
              </div>
              <div className="prep-detail">
                <span>Registros con profundidad</span>
                <strong>
                  {formato(datos.pares_comparables)}
                </strong>
              </div>
            </article>
          </div>

          <p className="prep-footer">
            {datos.nota} Los análisis describen
            eventos registrados y no constituyen
            predicciones de terremotos.
          </p>
        </>
      )}
    </section>
  );
}
