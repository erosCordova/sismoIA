import {
  useContext, useEffect, useState
} from "react";
import {
  BarChart, Bar, LineChart, Line,
  CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from "recharts";
import {
  TrendingUp, RefreshCw, ShieldAlert
} from "lucide-react";
import {TokenContext} from "./AuthGate";
import "./preparation.css";
import "./models.css";

type Serie = {
  etiqueta: string;
  cantidad: number;
};

type Estimacion = {
  modelo: string;
  version_modelo: string;
  metodo: string;
  fuente: string;
  zona: string;
  ventana_dias: number;
  inicio_utc: string;
  fin_utc: string;
  fecha_calculo_utc: string;
  magnitud_umbral: number;
  total_registros: number;
  registros_umbral: number;
  porcentaje_observado: number | null;
  intervalo_wilson_95: {
    inferior: number;
    superior: number;
  } | null;
  magnitud_mediana: number | null;
  primer_evento_utc: string | null;
  ultimo_evento_utc: string | null;
  mensual: Serie[];
  distribucion: Serie[];
  estado_revision: string;
  dataset: string;
  advertencia: string;
};

const numero = (v: number | null | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("es-PE", {
        maximumFractionDigits: 2
      });

function fecha(v: string | null) {
  return v
    ? new Date(v).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short"
      })
    : "Sin registros";
}

export default function EstimatesWorkspace({
  peru
}: {
  peru: boolean
}) {
  const token = useContext(TokenContext);
  const [fuente, setFuente] =
    useState(peru ? "IGP" : "USGS");

  const [dias, setDias] = useState("90");
  const [umbral, setUmbral] = useState("4");
  const [revision, setRevision] = useState(0);
  const [datos, setDatos] = useState<Estimacion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setFuente(peru ? "IGP" : "USGS");
  }, [peru]);

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    async function cargar() {
      setCargando(true);
      setError("");
      setDatos(null);

      const params = new URLSearchParams({
        fuente,
        peru: String(peru),
        dias,
        magnitud_umbral: umbral
      });

      try {
        const r = await fetch(
          `/api/v1/estimates/experimental?${params}`,
          {
            signal: ctrl.signal,
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!r.ok) {
          throw Error(
            `No se pudo calcular la estimación: HTTP ${r.status}`
          );
        }

        const resultado: Estimacion = await r.json();

        if (!ctrl.signal.aborted) setDatos(resultado);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message
              : "Error de estimación"
          );
        }
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }

    void cargar();
    return () => ctrl.abort();

  }, [token, fuente, peru, dias, umbral, revision]);

  return (
    <section className="prep-root">
      <header className="prep-header">
        <div>
          <h2>
            <TrendingUp size={23}/>
            Estimaciones experimentales
          </h2>
          <p>
            Análisis descriptivo de registros históricos
            {" · "}{peru ? "Perú" : "Mundo"}
          </p>
        </div>

        <div className="prep-actions">
          <select
            aria-label="Fuente sísmica"
            value={fuente}
            onChange={e => setFuente(e.target.value)}
          >
            <option value="IGP">IGP</option>
            <option value="USGS">USGS</option>
          </select>

          <select
            aria-label="Periodo"
            value={dias}
            onChange={e => setDias(e.target.value)}
          >
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Último año</option>
            <option value="1095">Últimos 3 años</option>
          </select>

          <select
            aria-label="Magnitud umbral"
            value={umbral}
            onChange={e => setUmbral(e.target.value)}
          >
            <option value="3">Magnitud 3+</option>
            <option value="4">Magnitud 4+</option>
            <option value="5">Magnitud 5+</option>
            <option value="6">Magnitud 6+</option>
          </select>

          <button
            disabled={cargando}
            onClick={() => setRevision(v => v + 1)}
          >
            <RefreshCw size={16}/> Actualizar
          </button>
        </div>
      </header>

      <div className="ml-experimental-notice">
        <ShieldAlert size={21}/>
        <div>
          <strong>
            Análisis experimental, no pronóstico sísmico
          </strong>
          <p>
            Se calculan frecuencias de registros históricos.
            No se estima la probabilidad de que ocurra
            un terremoto futuro.
          </p>
        </div>
      </div>

      {cargando && (
        <p className="prep-loading">
          Calculando información histórica...
        </p>
      )}

      {error && (
        <p className="prep-error" role="alert">{error}</p>
      )}

      {datos && (
        <>
          <div className="prep-metrics">
            <article>
              <span>Registros del periodo</span>
              <strong>
                {numero(datos.total_registros)}
              </strong>
            </article>

            <article>
              <span>Magnitud ≥ {datos.magnitud_umbral}</span>
              <strong>
                {numero(datos.registros_umbral)}
              </strong>
            </article>

            <article>
              <span>Porcentaje observado</span>
              <strong>
                {datos.porcentaje_observado === null
                  ? "—"
                  : `${numero(datos.porcentaje_observado)}%`}
              </strong>
            </article>

            <article>
              <span>Magnitud mediana</span>
              <strong>
                {numero(datos.magnitud_mediana)}
              </strong>
            </article>

            <article>
              <span>Intervalo Wilson 95%</span>
              <strong className="ml-small-metric">
                {datos.intervalo_wilson_95
                  ? `${numero(datos.intervalo_wilson_95.inferior)}% – ${numero(datos.intervalo_wilson_95.superior)}%`
                  : "Muestra insuficiente"}
              </strong>
            </article>

            <article>
              <span>Estado de revisión</span>
              <strong className="ml-small-metric">
                {datos.estado_revision}
              </strong>
            </article>
          </div>

          <div className="prep-grid">
            <article className="prep-card">
              <h3>Distribución histórica de magnitudes</h3>
              <p>
                Número de registros por magnitud observada.
              </p>

              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={datos.distribucion}>
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
                      name="Registros"
                      fill="#129bc1"
                      radius={[7,7,0,0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="prep-card">
              <h3>Registros observados por mes</h3>
              <p>
                Distribución temporal del catálogo seleccionado.
              </p>

              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={270}>
                  <LineChart data={datos.mensual}>
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
                      stroke="#15ab9b"
                      strokeWidth={3}
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>

          <article className="prep-card">
            <h3>Ficha técnica de la estimación</h3>

            {[
              ["Método", datos.metodo],
              ["Modelo", datos.modelo],
              ["Versión", datos.version_modelo],
              ["Fuente", datos.fuente],
              ["Zona", datos.zona],
              ["Dataset", datos.dataset],
              [
                "Ventana temporal",
                `${datos.ventana_dias} días`
              ],
              ["Inicio del periodo", fecha(datos.inicio_utc)],
              ["Fin del periodo", fecha(datos.fin_utc)],
              [
                "Fecha del cálculo",
                fecha(datos.fecha_calculo_utc)
              ],
              [
                "Primer registro encontrado",
                fecha(datos.primer_evento_utc)
              ],
              [
                "Último registro encontrado",
                fecha(datos.ultimo_evento_utc)
              ]
            ].map(([nombre, valor]) => (
              <div className="prep-detail" key={nombre}>
                <span>{nombre}</span>
                <strong>{valor}</strong>
              </div>
            ))}
          </article>

          <article className="prep-card">
            <h3>Interpretación y limitaciones</h3>
            <p>{datos.advertencia}</p>
            <p className="prep-footer">
              El intervalo de Wilson expresa incertidumbre
              estadística sobre una proporción observada bajo
              ciertos supuestos de muestreo. No representa
              incertidumbre de un pronóstico de terremotos.
              Este resultado no ha sido aprobado para
              su comunicación como alerta oficial.
            </p>
          </article>
        </>
      )}
    </section>
  );
}
