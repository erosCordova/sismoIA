import {
  useContext,
  useEffect,
  useState,
  type FormEvent
} from "react";

import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  BarChart,
  Bar,
  ScatterChart,
  Scatter
} from "recharts";

import {
  TokenContext,
  UsuarioContext
} from "./AuthGate";

import "./science-panels.css";
import {ClassificationReading, RegressionResultsReading} from "./ModelResultReading";

type Analisis = {
  muestra: number;
  limite_alcanzado: boolean;
  actualizado_utc: string;
  filtros: Record<string, unknown>;
  serie: {
    periodo: string;
    eventos: number;
  }[];
  histograma: {
    rango: string;
    eventos: number;
  }[];
  dispersion: {
    x: number;
    y: number;
  }[];
  fuentes: Record<string, number>;
  faltantes: Record<string, number>;
  duplicados_clave_fuente: number;
  nota_duplicados: string;
};

type Reporte = {
  version: {
    codigo: string;
    firma: string;
  };
  total_muestra: number;
  limitado: boolean;
  seleccionados: number;
  entrenamiento: number;
  validacion: number;
  objetivo: string;
  variables_entrada: string[];
  estados: Record<string, number>;
  banderas: Record<string, number>;
  reglas: string[];
  nota: string;
};

type Experimento = {
  version_muestra: string;
  entrenamiento: number;
  validacion: number;
  ejecutado_utc: string;
  periodo_validacion: string[];
  regresion: {
    modelo: string;
    variables: string[];
    mae: number;
    rmse: number;
    r2: number;
  }[];
  real_estimado: {
    indice: number;
    real: number;
    estimado: number;
  }[];
  clasificacion: {
    clase_positiva: string;
    comparacion: {
      modelo: string;
      precision: number;
      recall: number;
      f1: number;
      matriz: number[][];
    }[];
  } | null;
  limitaciones: string;
};

const numero = (n: number) =>
  n.toLocaleString("es-PE");

const fecha = (v: string) =>
  new Date(v).toLocaleString(
    "es-PE",
    {
      timeZone: "America/Lima",
      dateStyle: "short",
      timeStyle: "short"
    }
  );

async function obtener<T>(
  ruta: string,
  token: string,
  metodo = "GET",
  signal?: AbortSignal
): Promise<T> {
  const respuesta = await fetch(
    ruta,
    {
      method: metodo,
      signal,
      headers: {
        Authorization: `Bearer ${token}`
      },
      cache: "no-store"
    }
  );

  if (!respuesta.ok) {
    const datos = await respuesta.json()
      .catch(() => null);

    throw new Error(
      typeof datos?.detail === "string"
        ? datos.detail
        : `HTTP ${respuesta.status}`
    );
  }

  return respuesta.json() as Promise<T>;
}

function AnalisisPanel({
  peru
}: {
  peru: boolean;
}) {
  const token = useContext(TokenContext);

  const [fuente, setFuente] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [magnitud, setMagnitud] = useState("");
  const [profundidad, setProfundidad] = useState("");
  const [agrupacion, setAgrupacion] = useState("dia");
  const [x, setX] = useState("profundidad_km");
  const [y, setY] = useState("magnitud");

  const [consulta, setConsulta] = useState("");
  const [revision, setRevision] = useState(0);

  const [datos, setDatos] =
    useState<Analisis | null>(null);

  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  function aplicar(e: FormEvent) {
    e.preventDefault();

    if (desde && hasta && desde > hasta) {
      setError(
        "La fecha inicial supera la final."
      );
      return;
    }

    const params = new URLSearchParams({
      peru: String(peru),
      agrupacion,
      x,
      y
    });

    if (fuente) params.set("fuente", fuente);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);

    if (magnitud) {
      params.set(
        "magnitud_min", magnitud
      );
    }

    if (profundidad) {
      params.set(
        "profundidad_max", profundidad
      );
    }

    setConsulta(params.toString());
    setRevision(v => v + 1);
  }

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    const params = consulta || new URLSearchParams({
      peru: String(peru),
      agrupacion: "dia",
      x: "profundidad_km",
      y: "magnitud"
    }).toString();

    setCargando(true);
    setError("");

    void obtener<Analisis>(
      `/api/v1/science/analytics?${params}`,
      token,
      "GET",
      ctrl.signal
    )
      .then(setDatos)
      .catch(e => {
        if (!ctrl.signal.aborted) {
          setDatos(null);
          setError(String(e));
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setCargando(false);
        }
      });

    return () => ctrl.abort();
  }, [token, peru, consulta, revision]);

  const campos = [
    {v:"profundidad_km", t:"Profundidad (km)"},
    {v:"magnitud", t:"Magnitud"},
    {v:"latitud", t:"Latitud (°)"},
    {v:"longitud", t:"Longitud (°)"}
  ];

  return (
    <section className="science-card">
      <header>
        <h2>Explorador estadístico avanzado</h2>
        <p>
          Variables, filtros y visualizaciones
          reproducibles con registros reales.
        </p>
      </header>

      <form
        className="science-form"
        onSubmit={aplicar}
      >
        <label>
          Fuente
          <select
            value={fuente}
            onChange={e => setFuente(e.target.value)}
          >
            <option value="">Todas</option>
            <option value="IGP">IGP</option>
            <option value="USGS">USGS</option>
          </select>
        </label>

        <label>
          Desde (UTC)
          <input
            type="date"
            value={desde}
            onChange={e => setDesde(e.target.value)}
          />
        </label>

        <label>
          Hasta (UTC)
          <input
            type="date"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
          />
        </label>

        <label>
          Magnitud mínima
          <input
            type="number"
            min="-2"
            max="10"
            step="0.1"
            value={magnitud}
            onChange={e => setMagnitud(e.target.value)}
          />
        </label>

        <label>
          Profundidad máxima (km)
          <input
            type="number"
            min="0"
            max="750"
            value={profundidad}
            onChange={e => setProfundidad(e.target.value)}
          />
        </label>

        <label>
          Agrupación temporal
          <select
            value={agrupacion}
            onChange={e => setAgrupacion(e.target.value)}
          >
            <option value="dia">Diaria</option>
            <option value="semana">Semanal</option>
            <option value="mes">Mensual</option>
          </select>
        </label>

        <label>
          Variable X
          <select
            value={x}
            onChange={e => setX(e.target.value)}
          >
            {campos.map(c => (
              <option key={c.v} value={c.v}>
                {c.t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Variable Y
          <select
            value={y}
            onChange={e => setY(e.target.value)}
          >
            {campos.map(c => (
              <option key={c.v} value={c.v}>
                {c.t}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={cargando}
        >
          {cargando
            ? "Calculando..."
            : "Aplicar y analizar"}
        </button>
      </form>

      {error && (
        <p role="alert" className="science-error">
          {error}
        </p>
      )}

      {cargando && (
        <p role="status" className="science-loading">
          Consultando eventos reales...
        </p>
      )}

      {datos && (
        <>
          <div className="science-meta">
            <span>
              <b>Muestra:</b>{" "}
              {numero(datos.muestra)}
              {datos.limite_alcanzado
                ? " (máximo 5.000)"
                : ""}
            </span>

            <span>
              <b>Zona:</b>{" "}
              {peru ? "Perú" : "Mundo"}
            </span>

            <span>
              <b>Fuente:</b>{" "}
              {String(
                datos.filtros.fuente || "IGP / USGS"
              )}
            </span>

            <span>
              <b>Actualizado:</b>{" "}
              {fecha(datos.actualizado_utc)}
            </span>

            <span>
              <b>Método:</b> Descriptivo
            </span>
          </div>

          <div className="science-charts">
            <article>
              <h3>Eventos a lo largo del tiempo</h3>
              <p>
                X: periodo UTC ·
                Y: cantidad de eventos
              </p>

              <div className="science-plot">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart data={datos.serie}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="periodo"
                      tick={{fontSize:10}}
                      minTickGap={25}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="eventos"
                      stroke="#078ab0"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article>
              <h3>Distribución por magnitud</h3>
              <p>
                X: rango de magnitud ·
                Y: cantidad de eventos
              </p>

              <div className="science-plot">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart data={datos.histograma}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="rango"
                      tick={{fontSize:10}}
                    />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="eventos"
                      fill="#16b4c8"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="science-chart-wide">
              <h3>Relación entre variables</h3>

              <p>
                X:{" "}
                {campos.find(
                  c => c.v === datos.filtros.x
                )?.t}
                {" "}· Y:{" "}
                {campos.find(
                  c => c.v === datos.filtros.y
                )?.t}
                {" "}· Hasta 350 puntos
              </p>

              <div className="science-plot">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <ScatterChart>
                    <CartesianGrid
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name={String(datos.filtros.x)}
                      domain={["auto", "auto"]}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name={String(datos.filtros.y)}
                      domain={["auto", "auto"]}
                    />
                    <Tooltip />
                    <Scatter
                      name="Eventos"
                      data={datos.dispersion}
                      fill="#167fae"
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>

          <p className="science-note">
            Fuentes:{" "}
            {Object.entries(datos.fuentes)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ") || "Sin registros"}.
            {" "}Faltantes:{" "}
            {Object.entries(datos.faltantes)
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ") || "0"}.
            {" "}Duplicados por clave fuente/ID:{" "}
            {datos.duplicados_clave_fuente}.
          </p>

          <p className="science-note">
            {datos.nota_duplicados}
            {" "}Las gráficas describen eventos
            observados, no futuros terremotos.
          </p>
        </>
      )}
    </section>
  );
}

function CalidadPanel({
  peru
}: {
  peru: boolean;
}) {
  const token = useContext(TokenContext);

  const [objetivo, setObjetivo] =
    useState("magnitud");

  const [datos, setDatos] =
    useState<Reporte | null>(null);

  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!token) return;

    const ctrl = new AbortController();

    const params = new URLSearchParams({
      peru: String(peru),
      objetivo
    });

    setCargando(true);
    setError("");

    void obtener<Reporte>(
      `/api/v1/preparation/dataset-report?${params}`,
      token,
      "GET",
      ctrl.signal
    )
      .then(setDatos)
      .catch(e => {
        if (!ctrl.signal.aborted) {
          setDatos(null);
          setError(String(e));
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setCargando(false);
        }
      });

    return () => ctrl.abort();
  }, [token, peru, objetivo]);

  return (
    <section className="science-card">
      <header>
        <h2>Calidad y trazabilidad del dataset</h2>
        <p>
          Identificación de la muestra, nulos,
          reglas de limpieza y partición temporal.
        </p>
      </header>

      <div className="science-form">
        <label>
          Variable objetivo
          <select
            value={objetivo}
            onChange={e => setObjetivo(
              e.target.value
            )}
          >
            <option value="magnitud">
              Magnitud
            </option>
            <option value="profundidad_km">
              Profundidad (km)
            </option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="science-error">
          {error}
        </p>
      )}

      {cargando && (
        <p role="status" className="science-loading">
          Calculando informe de calidad...
        </p>
      )}

      {datos && (
        <>
          <div className="science-meta">
            <span>
              <b>Versión:</b>{" "}
              {datos.version.codigo}
            </span>

            <span>
              <b>Filas:</b>{" "}
              {numero(datos.total_muestra)}
            </span>

            <span>
              <b>Seleccionadas:</b>{" "}
              {numero(datos.seleccionados)}
            </span>

            <span>
              <b>Entrenamiento:</b>{" "}
              {numero(datos.entrenamiento)}
            </span>

            <span>
              <b>Validación:</b>{" "}
              {numero(datos.validacion)}
            </span>

            <span>
              <b>Objetivo:</b>{" "}
              {datos.objetivo}
            </span>
          </div>

          <div className="science-charts">
            <article>
              <h3>Estados de calidad</h3>

              <div className="science-bars">
                {Object.entries(datos.estados)
                  .map(([estado, cantidad]) => (
                    <div key={estado}>
                      <span>{estado}</span>
                      <strong>
                        {numero(cantidad)}
                      </strong>
                    </div>
                  ))}
              </div>
            </article>

            <article>
              <h3>Ausencias y observaciones</h3>

              <div className="science-bars">
                {Object.entries(datos.banderas)
                  .map(([bandera, cantidad]) => (
                    <div key={bandera}>
                      <span>
                        {bandera.replaceAll("_", " ")}
                      </span>
                      <strong>
                        {numero(cantidad)}
                      </strong>
                    </div>
                  ))}

                {!Object.keys(datos.banderas).length && (
                  <p>
                    Sin banderas en la muestra.
                  </p>
                )}
              </div>
            </article>
          </div>

          <h3>Variables de entrada</h3>

          <p className="science-tags">
            {datos.variables_entrada.map(v => (
              <span key={v}>{v}</span>
            ))}
          </p>

          <h3>Reglas aplicadas</h3>

          <ol className="science-rules">
            {datos.reglas.map((regla, i) => (
              <li key={i}>{regla}</li>
            ))}
          </ol>

          <p className="science-note">
            <b>Estado: no aprobado.</b>
            {" "}La versión identifica una consulta,
            no una copia inmutable ni una aprobación
            formal. {datos.nota}
          </p>
        </>
      )}
    </section>
  );
}

function ModelosPanel({peru}: {peru: boolean}) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);

  const permitido = Boolean(
    usuario &&
    (
      usuario.permisos.includes("*") ||
      usuario.permisos.includes("models:train")
    )
  );

  const [datos, setDatos] =
    useState<Experimento | null>(null);

  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function entrenar() {
    if (!token || !permitido) return;

    setOcupado(true);
    setError("");

    try {
      const resultado = await obtener<Experimento>(
        `/api/v1/science/ml/compare?peru=${peru}`,
        token,
        "POST"
      );

      setDatos(resultado);
    } catch (e) {
      setError(String(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="science-card">
      <header>
        <h2>Laboratorio de ML supervisado</h2>
        <p>
          Regresión lineal simple y múltiple,
          clasificación y validación cronológica.
        </p>
        <p>La regresión simple estudia cómo se relaciona la profundidad con la magnitud registrada. La múltiple añade latitud y longitud. Ambas intentan estimar la magnitud de eventos del catálogo a partir de esos datos; la comparación permite ver si añadir variables reduce el error.</p>
      </header>

      <div className="science-actions">
        <button
          type="button"
          onClick={() => void entrenar()}
          disabled={!permitido || ocupado}
        >
          {ocupado
            ? "Entrenando y evaluando..."
            : "Ejecutar laboratorio supervisado"}
        </button>

        {!permitido && (
          <span>
            Tu rol no autoriza entrenar modelos.
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="science-error">
          {error}
        </p>
      )}

      {datos && (
        <>
          <div className="science-meta">
            <span>
              <b>Versión de muestra:</b>{" "}
              {datos.version_muestra}
            </span>

            <span>
              <b>Entrenamiento:</b>{" "}
              {numero(datos.entrenamiento)}
            </span>

            <span>
              <b>Validación:</b>{" "}
              {numero(datos.validacion)}
            </span>

            <span>
              <b>Evaluado:</b>{" "}
              {fecha(datos.ejecutado_utc)}
            </span>

            <span>
              <b>Guardado:</b> No
            </span>
          </div>

          <h3>Comparación de regresores</h3>

          <p className="science-note">
            MAE y RMSE menores indican menor error.
            R² mide el ajuste frente a la referencia
            de la muestra de validación.
          </p>

          <div className="science-scroll">
            <table className="science-table">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>Variables</th>
                  <th>MAE</th>
                  <th>RMSE</th>
                  <th>R²</th>
                </tr>
              </thead>

              <tbody>
                {datos.regresion.map(r => (
                  <tr key={r.modelo}>
                    <td>{r.modelo}</td>
                    <td>
                      {r.variables.join(", ")}
                    </td>
                    <td>{r.mae}</td>
                    <td>{r.rmse}</td>
                    <td>{r.r2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <RegressionResultsReading comparison={datos.regresion} target="magnitud"/>

          <h3>Magnitud real vs. estimada</h3>

          <p className="science-note">
            Evaluación del modelo de regresión
            lineal múltiple con registros posteriores
            al periodo de entrenamiento.
          </p>

          <div className="science-plot">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart data={datos.real_estimado}>
                <CartesianGrid
                  strokeDasharray="3 3"
                />
                <XAxis dataKey="indice" />
                <YAxis />
                <Tooltip />

                <Line
                  dataKey="real"
                  name="Real"
                  stroke="#078bb5"
                  dot={false}
                />

                <Line
                  dataKey="estimado"
                  name="Estimado"
                  stroke="#eb9c43"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h3>Clasificación supervisada</h3>

          {datos.clasificacion ? (
            <>
              <p className="science-note">
                Clase positiva:{" "}
                {datos.clasificacion.clase_positiva}.
                Se clasifican eventos ya reportados.
              </p>

              <div className="science-scroll">
                <table className="science-table">
                  <thead>
                    <tr>
                      <th>Clasificador</th>
                      <th>Precision</th>
                      <th>Recall</th>
                      <th>F1</th>
                      <th>Matriz</th>
                    </tr>
                  </thead>

                  <tbody>
                    {datos.clasificacion.comparacion
                      .map(c => (
                        <tr key={c.modelo}>
                          <td>{c.modelo}</td>
                          <td>{c.precision}</td>
                          <td>{c.recall}</td>
                          <td>{c.f1}</td>
                          <td>
                            {JSON.stringify(c.matriz)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <p className="science-note">
                Matriz: filas = clase real,
                columnas = clase estimada.
                Orden: 0 (M menor que 4),
                1 (M igual o mayor que 4).
              </p>
              {datos.clasificacion.comparacion.filter(c => !/referencia|baseline/i.test(c.modelo)).map(c =>
                <ClassificationReading key={c.modelo} metric={c}/>
              )}
            </>
          ) : (
            <p className="science-note">
              No existe suficiente variedad
              de clases para entrenar
              una clasificación binaria.
            </p>
          )}

          <p className="science-note">
            <b>Limitaciones:</b>{" "}
            {datos.limitaciones}
          </p>
        </>
      )}
    </section>
  );
}

export default function SciencePanels({
  modo,
  peru
}: {
  modo: "analisis" | "datos" | "modelos";
  peru: boolean;
}) {
  if (modo === "analisis") {
    return <AnalisisPanel peru={peru} />;
  }

  if (modo === "datos") {
    return <CalidadPanel peru={peru} />;
  }

  return <ModelosPanel key={peru ? "peru" : "mundo"} peru={peru} />;
}
