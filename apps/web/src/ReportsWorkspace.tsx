import {
  useContext, useEffect, useState
} from "react";
import {
  Bar, BarChart, CartesianGrid,
  Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from "recharts";
import {
  Download, FileText, RefreshCw
} from "lucide-react";
import {
  TokenContext, UsuarioContext
} from "./AuthGate";
import "./preparation.css";
import "./reporting.css";
import "./operations-enterprise.css";
import ModuleReports from "./ModuleReports";

type Serie = {
  etiqueta: string;
  cantidad: number;
};

type Resumen = {
  dias: number;
  peru: boolean;
  fuente: string | null;
  total: number;
  magnitud_promedio: number | null;
  magnitud_maxima: number | null;
  primera_fecha_utc: string | null;
  ultima_fecha_utc: string | null;
  por_fuente: {
    nombre: string;
    cantidad: number;
  }[];
  por_mes: Serie[];
  por_magnitud: Serie[];
  advertencia: string;
};

type Formato = "csv" | "xlsx" | "pdf";

const numero = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("es-PE", {
    maximumFractionDigits: 2
  });

const fecha = (v: string | null) =>
  v
    ? new Date(v).toLocaleDateString("es-PE", {
        timeZone: "UTC"
      })
    : "No registrada";

export default function ReportsWorkspace({
  peru
}: {
  peru: boolean
}) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const puedeExportar = Boolean(
    usuario?.permisos.includes("*") ||
    usuario?.permisos.includes("reports:create")
  );

  const [dias, setDias] = useState("30");
  const [fuente, setFuente] = useState("");

  const [datos, setDatos] = useState<Resumen | null>(null);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] =
    useState<Formato | null>(null);

  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");

  const parametros = () => new URLSearchParams({
    dias,
    peru: String(peru),
    ...(fuente ? {fuente} : {})
  });

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    async function cargar() {
      setCargando(true);
      setError("");
      setDatos(null);

      try {
        const r = await fetch(
          `/api/v1/reports/summary?${parametros()}`,
          {
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!r.ok) {
          throw Error(
            `No se pudo generar el reporte: HTTP ${r.status}`
          );
        }

        const resultado: Resumen = await r.json();

        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "Error de reporte"
          );
        }
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }

    void cargar();
    return () => ctrl.abort();

  }, [token, dias, fuente, peru, revision]);

  async function exportar(formato: Formato) {
    if (!token || !puedeExportar) return;

    setExportando(formato);
    setError("");
    setMensaje("");

    try {
      const r = await fetch(
        `/api/v1/reports/export.${formato}?${parametros()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!r.ok) {
        throw Error(
          `Error exportando ${formato.toUpperCase()}: HTTP ${r.status}`
        );
      }

      const archivo = await r.blob();
      const url = URL.createObjectURL(archivo);

      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = (
        `SISMOIA_${peru ? "Peru" : "Mundo"}_` +
        `${dias}dias.${formato}`
      );

      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();

      window.setTimeout(
        () => URL.revokeObjectURL(url),
        1000
      );

      setMensaje(
        `Reporte ${formato.toUpperCase()} generado.`
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo exportar"
      );
    } finally {
      setExportando(null);
    }
  }

  return (
    <section className="prep-root">
      <header className="prep-header">
        <div>
          <h2>
            <FileText size={23}/>
            Reportes sísmicos
          </h2>
          <p>
            Informes históricos verificables
            {" · "}{peru ? "Perú" : "Mundo"}
          </p>
        </div>

        <div className="prep-actions">
          <select
            aria-label="Periodo"
            value={dias}
            onChange={e => setDias(e.target.value)}
          >
            <option value="7">7 días</option>
            <option value="30">30 días</option>
            <option value="90">90 días</option>
            <option value="365">365 días</option>
          </select>

          <select
            aria-label="Fuente"
            value={fuente}
            onChange={e => setFuente(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="IGP">IGP</option>
            <option value="USGS">USGS</option>
          </select>

          <button
            disabled={cargando}
            onClick={() => setRevision(v => v + 1)}
          >
            <RefreshCw size={16}/>
            Actualizar
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="prep-error">
          {error}
        </p>
      )}

      {mensaje && (
        <p className="prep-loading" role="status">
          {mensaje}
        </p>
      )}

      {cargando && (
        <p className="prep-loading">
          Calculando reporte...
        </p>
      )}

      {datos && (
        <>
          <div className="prep-metrics">
            <article>
              <span>Eventos registrados</span>
              <strong>{numero(datos.total)}</strong>
            </article>

            <article>
              <span>Magnitud promedio</span>
              <strong>
                {numero(datos.magnitud_promedio)}
              </strong>
            </article>

            <article>
              <span>Magnitud máxima</span>
              <strong>
                {numero(datos.magnitud_maxima)}
              </strong>
            </article>

            <article>
              <span>Primera observación</span>
              <strong className="rep-date">
                {fecha(datos.primera_fecha_utc)}
              </strong>
            </article>

            <article>
              <span>Última observación</span>
              <strong className="rep-date">
                {fecha(datos.ultima_fecha_utc)}
              </strong>
            </article>
          </div>

          {puedeExportar && (
            <article className="prep-card">
              <h3>Exportar informe</h3>

              <div className="ops-export">
                {([
                  ["csv", "CSV · Eventos"],
                  ["xlsx", "Excel · Resumen"],
                  ["pdf", "PDF · Informe"]
                ] as const).map(([formato, nombre]) => (
                  <button
                    key={formato}
                    disabled={exportando !== null}
                    onClick={() => void exportar(formato)}
                  >
                    <Download size={17}/>
                    {exportando === formato
                      ? "Generando..."
                      : nombre}
                  </button>
                ))}
              </div>

              <p className="rep-note">
                CSV contiene hasta 10 000 registros.
                Excel y PDF incluyen el resumen estadístico.
                Las exportaciones quedan registradas
                en auditoría.
              </p>
            </article>
          )}

          <div className="prep-grid">
            <article className="prep-card">
              <h3>Distribución por magnitud</h3>

              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={datos.por_magnitud}>
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
                      fill="#128fbf"
                      radius={[7,7,0,0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="prep-card">
              <h3>Actividad mensual</h3>

              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={270}>
                  <LineChart data={datos.por_mes}>
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
                    <Line
                      type="monotone"
                      dataKey="cantidad"
                      name="Registros"
                      stroke="#12aa9f"
                      strokeWidth={3}
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>

          <article className="prep-card">
            <h3>Comparación por fuente</h3>

            {datos.por_fuente.map(f => (
              <div className="prep-detail" key={f.nombre}>
                <span>{f.nombre}</span>
                <strong>
                  {numero(f.cantidad)} registros
                </strong>
              </div>
            ))}

            {!datos.total && (
              <p>
                No se encontraron registros
                para este periodo.
              </p>
            )}
          </article>

          <p className="rep-note">
            {datos.advertencia}
          </p>
        </>
      )}
      {puedeExportar && <ModuleReports peru={peru} dias={dias} fuente={fuente}/>}
    </section>
  );
}
