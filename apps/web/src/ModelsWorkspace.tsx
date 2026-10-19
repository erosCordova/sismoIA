import {
  useContext, useEffect, useState
} from "react";
import {
  Bar, BarChart, CartesianGrid, ScatterChart,
  Scatter, LineChart, Line,
  ResponsiveContainer, XAxis, YAxis, Tooltip
} from "recharts";
import {
  BrainCircuit, RefreshCw, FlaskConical
} from "lucide-react";
import {TokenContext, UsuarioContext} from "./AuthGate";
import {apiError} from "./apiErrors";
import {RegressionResultsReading} from "./ModelResultReading";
import "./preparation.css";
import "./models.css";

type ModeloGuardado = {
  nombre: string;
  algoritmo: string;
  objetivo: string;
  estado: string;
  version: string | null;
  fecha_archivo_utc: string | null;
  fecha_entrenamiento_utc: string | null;
  variables?: string[];
  ruta_artefacto: string | null;
  hiperparametros?: Record<string, string | number | boolean>;
  metricas: Record<string, unknown>;
};

type Registro = {
  experimentos: ModeloGuardado[];
  datasets: {
    nombre: string;
    disponible: boolean;
    hash: string | null;
  }[];
  persistencia: string;
  nota: string;
};

type Metricas = {
  peru?: boolean;
  origen?: string;
  dataset_sha256?: string;
  generado_utc?: string;
  entrenamiento: number;
  evaluacion: number;
  variables: string[];
  kmeans: {
    grupos: number;
    silhouette_train: number;
    silhouette_evaluacion: number | null;
    distribucion: Record<string, number>;
  };
  dbscan: {
    eps: number;
    grupos: number;
    cobertura: number;
    silhouette_sin_ruido: number;
    ruido: number;
  };
  advertencia: string;
};

type Punto = {
  id: string;
  fuente: string;
  latitud: number;
  longitud: number;
  magnitud: number;
  grupo: number;
};

type Grupos = {
  conjunto: string;
  total: number;
  puntos: Punto[];
};

type Regresion = {
  objetivo: string;
  dataset_version: string;
  variables: string[];
  variable_objetivo: string;
  entrenamiento: number;
  evaluacion: number;
  fecha_validacion_desde: string;
  fecha_validacion_hasta: string;
  calculado_utc: string;
  comparacion: {
    modelo: string;
    mae: number;
    rmse: number;
    r2: number;
    hiperparametros: Record<string, number | string>;
  }[];
  mejor_mae: string;
  real_vs_estimado: {
    fecha: string;
    real: number;
    estimada: number;
  }[];
  estado: string;
  advertencia: string;
};

const colores = [
  "#168fbd", "#20b8a5", "#eea84b",
  "#936bd6", "#dd7777", "#647aca"
];

const numero = (v: number | null | undefined) =>
  v == null
    ? "—"
    : !Number.isFinite(v) ? "—" : v.toLocaleString("es-PE", {
        maximumFractionDigits: 4
      });

const fecha = (valor: string | null) =>
  valor
    ? new Date(valor).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short"
      })
    : "No registrada";

export default function ModelsWorkspace({peru = false}: {peru?: boolean}) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);
  const puedeEntrenar = Boolean(usuario?.permisos.some(p => p === "*" || p === "models:train"));
  const [generando, setGenerando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [grupos, setGrupos] = useState<Grupos | null>(null);
  const [conjunto, setConjunto] = useState("evaluacion");
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [regresion, setRegresion] = useState<Regresion | null>(null);
  const [evaluando, setEvaluando] = useState(false);
  const [errorRegresion, setErrorRegresion] = useState("");

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    async function cargar() {
      setRegresion(null);
      setErrorRegresion("");
      setCargando(true);
      setError("");
      setAviso("");

      const headers = {
        Authorization: `Bearer ${token}`
      };

      try {
        const [rRegistro, rMetricas, rGrupos] =
          await Promise.allSettled([
            fetch("/api/v1/ml/registry", {
              headers, signal: ctrl.signal
            }),
            fetch("/api/v1/ml/overview", {
              headers, signal: ctrl.signal
            }),
            fetch(
              `/api/v1/ml/clusters?conjunto=${conjunto}&limite=400`,
              {headers, signal: ctrl.signal}
            )
          ]);

        if (ctrl.signal.aborted) return;

        if (
          rRegistro.status === "fulfilled" &&
          rRegistro.value.ok
        ) {
          const resultado = await rRegistro.value.json();
          setRegistro(resultado);
          if (resultado.disponible === false) setAviso(resultado.detalle);
        } else {
          setRegistro(null);
        }

        if (
          rMetricas.status === "fulfilled" &&
          rMetricas.value.ok
        ) {
          const resultado = await rMetricas.value.json();
          setMetricas(resultado.disponible === false ? null : resultado);
          if (resultado.disponible === false) setAviso(resultado.detalle);
        } else {
          setMetricas(null);
          setError(rMetricas.status === "fulfilled"
            ? await apiError(rMetricas.value, "No se pudieron consultar los agrupamientos")
            : "No se pudo conectar al servicio de agrupamientos.");
        }

        if (
          rGrupos.status === "fulfilled" &&
          rGrupos.value.ok
        ) {
          const resultado = await rGrupos.value.json();
          setGrupos(resultado.disponible === false ? null : resultado);
        } else {
          setGrupos(null);
          setError(rGrupos.status === "fulfilled"
            ? await apiError(rGrupos.value, "No se pudieron consultar los puntos")
            : "No se pudo conectar al servicio de puntos.");
        }

        if (
          rRegistro.status !== "fulfilled" ||
          !rRegistro.value.ok
        ) {
          setError(
            "No se pudo consultar el registro de modelos."
          );
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error
              ? e.message : "Error al consultar modelos"
          );
        }
      } finally {
        if (!ctrl.signal.aborted) setCargando(false);
      }
    }

    void cargar();
    return () => ctrl.abort();
  }, [token, conjunto, revision, peru]);

  async function generar() {
    if (!token || !puedeEntrenar) return;
    setGenerando(true);
    setError("");
    try {
      const response = await fetch(`/api/v1/ml/train-clustering?peru=${peru}`, {
        method: "POST", headers: {Authorization: `Bearer ${token}`}
      });
      if (!response.ok) throw Error(await apiError(response, "No se pudieron generar los agrupamientos"));
      setRevision(v => v + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo conectar con el backend.");
    } finally {
      setGenerando(false);
    }
  }

  async function evaluar() {
    if (!token) return;

    setEvaluando(true);
    setErrorRegresion("");
    setRegresion(null);

    try {
      const r = await fetch(
        `/api/v1/ml/regression-validation?peru=${peru}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!r.ok) {
        throw Error(await apiError(r, "No se pudo evaluar la regresión"));
      }

      setRegresion(await r.json());
    } catch (e) {
      setErrorRegresion(
        e instanceof Error
          ? e.message : "Evaluación no disponible"
      );
    } finally {
      setEvaluando(false);
    }
  }

  const distribucion = Object.entries(
    metricas?.kmeans.distribucion ?? {}
  ).map(([grupo, cantidad]) => ({
    grupo: `Grupo ${Number(grupo) + 1}`,
    cantidad
  }));

  const indices = [
    ...new Set(grupos?.puntos.map(p => p.grupo) ?? [])
  ].sort((a, b) => a - b);

  return (
    <section className="prep-root">
      <header className="prep-header">
        <div>
          <h2>
            <BrainCircuit size={24}/>
            Modelos de Machine Learning
          </h2>
          <p>
            Registro, comparación y validación experimental
          </p>
        </div>

        <div className="prep-actions">
          {puedeEntrenar && <button disabled={generando || cargando} onClick={() => void generar()}>
            <BrainCircuit size={16}/>
            {generando ? "Generando agrupamientos..." : "Generar agrupamientos con datos actuales"}
          </button>}
          <button
            disabled={cargando}
            onClick={() => setRevision(v => v + 1)}
          >
            <RefreshCw size={16}/> Actualizar
          </button>
        </div>
      </header>

      {cargando && (
        <p className="prep-loading">
          Consultando artefactos ML...
        </p>
      )}
      {error && <p className="prep-error" role="alert">{error}</p>}
      {aviso && <p className="ml-note" role="status">{aviso}</p>}
      {metricas && typeof metricas.peru === "boolean" && <p className="ml-note" role="status">
        Agrupamientos guardados para {metricas.peru ? "Perú" : "Mundo"}.
        {" "}Generados: {fecha(metricas.generado_utc ?? null)}.
        {metricas.peru !== peru && " El ámbito guardado es distinto del seleccionado. Genera nuevos agrupamientos para analizar el ámbito actual."}
      </p>}

      <article className="prep-card">
        <h3>Registro de modelos existentes</h3>
        <p>
          Se muestran únicamente artefactos encontrados
          en el proyecto.
        </p>

        <div className="ml-table-wrap">
          <table className="ml-table">
            <thead>
              <tr>
                <th>Modelo</th>
                <th>Versión</th>
                <th>Estado</th>
                <th>Fecha del archivo</th>
                <th>Objetivo</th>
              </tr>
            </thead>
            <tbody>
              {registro?.experimentos.map(m => (
                <tr key={m.nombre}>
                  <td><strong>{m.nombre}</strong></td>
                  <td>{m.version ?? "—"}</td>
                  <td>{m.estado}</td>
                  <td>{fecha(m.fecha_archivo_utc)}</td>
                  <td>{m.objetivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {registro?.experimentos.map(m => (
          <details className="ml-details" key={m.nombre}>
            <summary>
              Procedencia y configuración: {m.nombre}
            </summary>

            <div className="prep-detail">
              <span>Artefacto</span>
              <strong>{m.ruta_artefacto ?? "No disponible"}</strong>
            </div>

            <div className="prep-detail">
              <span>Variables</span>
              <strong>
                {m.variables?.join(", ") || "No registradas"}
              </strong>
            </div>

            <div className="prep-detail">
              <span>Entrenamiento registrado</span>
              <strong>
                {fecha(m.fecha_entrenamiento_utc)}
              </strong>
            </div>

            <pre className="ml-json">
              {JSON.stringify(m.hiperparametros ?? {}, null, 2)}
            </pre>
          </details>
        ))}

        <p className="ml-note">
          {registro?.persistencia}
        </p>
      </article>

      {metricas ? (
        <>
          <section className="result-reading" aria-label="Interpretación de los agrupamientos">
            <h4>Qué encontraron los agrupamientos</h4>
            <p>K-Means organizó los registros en <strong>{numero(metricas.kmeans.grupos)} grupos</strong> según su parecido en las variables utilizadas: {metricas.variables.join(", ")}. Cada color y número identifica un grupo; el grupo 1 no significa más peligro que el grupo 2.</p>
            <p>K-Means aprendió con {numero(metricas.entrenamiento)} registros y se comprobó con otros {numero(metricas.evaluacion)} posteriores. La gráfica de barras muestra cuántos registros quedaron en cada grupo; una barra alta significa más registros, no mayor intensidad sísmica.</p>
            <p><strong>DBSCAN dejó {numero(metricas.dbscan.ruido)} registros de entrenamiento sin grupo</strong> con la configuración actual. Los llama «ruido» porque no encontró suficientes vecinos similares; no significa que sean datos falsos ni sismos peligrosos.</p>
            <p><strong>Cómo usarlo:</strong> identifica conjuntos de eventos parecidos y examina sus características y procedencia. Estos grupos sirven para explorar patrones del catálogo.</p>
            <details><summary>Entender separación, cobertura y ruido</summary>
              <dl>
                <dt>Silhouette · Separación de grupos</dt><dd>Va de −1 a 1. Cerca de 1, los grupos están más separados; cerca de 0, se superponen; valores negativos sugieren asignaciones poco claras. No es un porcentaje de aciertos ni una medida de peligro. «—» indica que no pudo calcularse.</dd>
                <dt>Entrenamiento frente a evaluación</dt><dd>Si la separación baja en evaluación, los patrones aprendidos se distinguen menos en los registros posteriores. Revisa también el tamaño de muestra y las variables.</dd>
                <dt>Cobertura DBSCAN</dt><dd>Es el porcentaje de registros de entrenamiento que el algoritmo pudo incluir en algún grupo; el resto queda sin grupo. Una cobertura alta no garantiza agrupaciones útiles.</dd>
                <dt>Epsilon</dt><dd>Define qué tan cerca deben estar dos registros para considerarlos vecinos en las variables escaladas. No equivale directamente a kilómetros.</dd>
              </dl>
            </details>
          </section>
          <div className="prep-metrics">
            <article>
              <span>Entrenamiento K-Means</span>
              <strong>{numero(metricas.entrenamiento)}</strong>
            </article>
            <article>
              <span>Evaluación K-Means</span>
              <strong>{numero(metricas.evaluacion)}</strong>
            </article>
            <article>
              <span>Grupos K-Means</span>
              <strong>{numero(metricas.kmeans.grupos)}</strong>
            </article>
            <article>
              <span>Silhouette entrenamiento</span>
              <strong>
                {numero(metricas.kmeans.silhouette_train)}
              </strong>
            </article>
            <article>
              <span>Silhouette evaluación</span>
              <strong>
                {numero(metricas.kmeans.silhouette_evaluacion)}
              </strong>
            </article>
            <article>
              <span>Cobertura DBSCAN</span>
              <strong>
                {numero(metricas.dbscan.cobertura == null ? null : metricas.dbscan.cobertura * 100)}%
              </strong>
            </article>
          </div>

          <div className="prep-grid">
            <article className="prep-card">
              <h3>Distribución de grupos K-Means</h3>

              <div className="prep-chart">
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={distribucion}>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="4 5"
                    />
                    <XAxis dataKey="grupo"/>
                    <YAxis allowDecimals={false}/>
                    <Tooltip/>
                    <Bar
                      dataKey="cantidad"
                      name="Registros"
                      fill="#159ac6"
                      radius={[7,7,0,0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="prep-card">
              <h3>DBSCAN: análisis de densidad</h3>

              {[
                ["Grupos", metricas.dbscan.grupos],
                ["Epsilon", metricas.dbscan.eps],
                ["Sin grupo (ruido)", metricas.dbscan.ruido],
                [
                  "Silhouette sin ruido",
                  metricas.dbscan.silhouette_sin_ruido
                ]
              ].map(([nombre, valor]) => (
                <div className="prep-detail" key={String(nombre)}>
                  <span>{nombre}</span>
                  <strong>{numero(valor as number)}</strong>
                </div>
              ))}

              <p className="ml-note">
                DBSCAN puede identificar ruido. Sus métricas
                no deben interpretarse como equivalentes
                directos a las de K-Means.
              </p>
            </article>
          </div>

          <article className="prep-card">
            <div className="ml-section-head">
              <div>
                <h3>Distribución espacial K-Means</h3>
                <p>
                  Visualización de agrupaciones geográficas.
                  Los colores no representan riesgo.
                </p>
              </div>

              <select
                aria-label="Registros que se muestran en la gráfica de grupos"
                value={conjunto}
                onChange={e => setConjunto(e.target.value)}
              >
                <option value="evaluacion">Evaluación</option>
                <option value="entrenamiento">
                  Entrenamiento
                </option>
              </select>
            </div>

            <div className="ml-graph">
              <ResponsiveContainer width="100%" height={330}>
                <ScatterChart>
                  <CartesianGrid strokeDasharray="4 5"/>
                  <XAxis
                    type="number"
                    dataKey="longitud"
                    name="Longitud"
                    unit="°"
                    domain={["dataMin", "dataMax"]}
                  />
                  <YAxis
                    type="number"
                    dataKey="latitud"
                    name="Latitud"
                    unit="°"
                    domain={["dataMin", "dataMax"]}
                  />
                  <Tooltip/>
                  {indices.map(g => (
                    <Scatter
                      key={g}
                      name={`Grupo ${g + 1}`}
                      data={
                        grupos?.puntos.filter(p => p.grupo === g) ?? []
                      }
                      fill={colores[
                        ((g % colores.length) + colores.length) %
                        colores.length
                      ]}
                    />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            <p className="ml-note">
              {numero(grupos?.puntos.length)} registros visualizados
              de {numero(grupos?.total)} disponibles.
            </p>
          </article>
        </>
      ) : (
        <p className="prep-loading">
          Genera los agrupamientos con datos actuales para calcular
          las métricas de K-Means y DBSCAN. Se guardan en el backend;
          no se modifican los registros de Supabase.
        </p>
      )}

      <article className="prep-card">
        <div className="ml-section-head">
          <div>
            <h3>
              <FlaskConical size={19}/>
              Comparación de regresión experimental
            </h3>
            <p>
              Referencia histórica y regresión con selección interna independiente.
              Evaluación temporal 80/20.
            </p>
          </div>

          <button
            className="ml-run"
            disabled={evaluando || !puedeEntrenar}
            onClick={() => void evaluar()}
          >
            <FlaskConical size={16}/>
            {evaluando
              ? "Evaluando..."
              : "Ejecutar comparación"}
          </button>
        </div>

        {errorRegresion && (
          <p className="prep-error">{errorRegresion}</p>
        )}

        {!regresion && !evaluando && (
          <p className="ml-note">
            Ejecuta la comparación para calcular métricas reales
            sobre los datasets históricos disponibles.
          </p>
        )}

        {regresion && (
          <>
            <div className="prep-detail">
              <span>Dataset utilizado</span>
              <strong>{regresion.dataset_version}</strong>
            </div>

            <div className="prep-detail">
              <span>Variable objetivo</span>
              <strong>{regresion.variable_objetivo}</strong>
            </div>

            <div className="prep-detail">
              <span>Entrenamiento / evaluación</span>
              <strong>
                {numero(regresion.entrenamiento)}
                {" / "}
                {numero(regresion.evaluacion)}
              </strong>
            </div>

            <div className="prep-detail">
              <span>Validación temporal</span>
              <strong>
                {fecha(regresion.fecha_validacion_desde)}
                {" — "}
                {fecha(regresion.fecha_validacion_hasta)}
              </strong>
            </div>

            <div className="ml-table-wrap">
              <table className="ml-table">
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>MAE ↓</th>
                    <th>RMSE ↓</th>
                    <th>R² ↑</th>
                  </tr>
                </thead>

                <tbody>
                  {regresion.comparacion.map(m => (
                    <tr key={m.modelo}>
                      <td>
                        {m.modelo}
                        {m.modelo === regresion.mejor_mae &&
                          " · Seleccionado en desarrollo"}
                      </td>
                      <td>{numero(m.mae)}</td>
                      <td>{numero(m.rmse)}</td>
                      <td>{numero(m.r2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <RegressionResultsReading comparison={regresion.comparacion} target={regresion.variable_objetivo}/>

            <h3>Magnitud real frente a estimada</h3>
            <p>
              Muestra cronológica de hasta 60 eventos de validación.
              {" "}La gráfica corresponde a {regresion.mejor_mae}, seleccionado en desarrollo.
            </p>

            <div className="prep-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={regresion.real_vs_estimado}>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="4 5"
                  />
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={v => String(v).slice(5, 10)}
                    minTickGap={25}
                    tick={{fontSize: 10}}
                  />
                  <YAxis/>
                  <Tooltip/>
                  <Line
                    type="monotone"
                    dataKey="real"
                    name="Magnitud real"
                    stroke="#1089c5"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="estimada"
                    name="Magnitud estimada"
                    stroke="#e5a046"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <p className="ml-note">
              {regresion.advertencia}
            </p>
          </>
        )}
      </article>

      <p className="prep-footer">
        No se muestra matriz de confusión porque estos
        experimentos no son de clasificación supervisada.
        Ningún modelo indica dónde o cuándo ocurrirá
        el próximo terremoto.
      </p>
    </section>
  );
}
