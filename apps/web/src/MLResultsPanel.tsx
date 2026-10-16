import {
  useContext, useEffect, useState
} from "react";

import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
} from "recharts";

import {
  BrainCircuit, RefreshCw, ShieldAlert
} from "lucide-react";

import {TokenContext} from "./AuthGate";
import "./ml-results.css";

type Medida = {
  modelo: string;
  mae?: number;
  rmse?: number;
  r2?: number;
  precision?: number;
  recall?: number;
  f1?: number;
};

type Version = {
  id: string;
  nombre: string;
  estado: string;
  total: number;
  manifest: {
    peru?: boolean;
    fuente?: string | null;
  };
};

type Experimento = {
  id: string;
  dataset_id: string;
  algoritmo: string;
  estado: string;
  revisada_utc?: string | null;
  resultados: {
    modelo_seleccionado: string;
    entrenamiento: number;
    validacion: number;
    comparacion: Medida[];
    limitacion: string;
    serie_validacion?: {
      fecha_utc: string;
      real: number;
      estimado: number;
    }[];
  };
};

type Resultado = {
  experimento: Experimento;
  dataset: Version;
};

const num = (v: number | undefined) =>
  v == null
    ? "—"
    : v.toLocaleString("es-PE", {
        maximumFractionDigits: 3
      });

const fecha = (v?: string | null) =>
  v
    ? new Date(v).toLocaleDateString("es-PE", {
        timeZone: "America/Lima"
      })
    : "—";

export default function MLResultsPanel() {
  const token = useContext(TokenContext);

  const [datos, setDatos] =
    useState<Resultado[]>([]);

  const [pendientes, setPendientes] =
    useState(0);

  const [revision, setRevision] =
    useState(0);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!token) {
      setCargando(false);
      return;
    }

    const ctrl = new AbortController();

    setCargando(true);
    setError("");

    const consultar = async <T,>(
      url: string
    ): Promise<T> => {
      const r = await fetch(
        `/api/v1/governance/${url}?limite=100`,
        {
          cache: "no-store",
          signal: ctrl.signal,
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!r.ok) {
        throw Error(
          `No fue posible consultar los resultados (HTTP ${r.status}).`
        );
      }

      return (await r.json()) as T;
    };

    Promise.all([
      consultar<{datasets: Version[]}>(
        "datasets"
      ),
      consultar<{experimentos: Experimento[]}>(
        "experiments"
      )
    ])
      .then(([d, e]) => {
        if (ctrl.signal.aborted) return;

        const versiones = new Map(
          d.datasets.map(x => [x.id, x])
        );

        const peruanos = e.experimentos
          .map(experimento => ({
            experimento,
            dataset: versiones.get(
              experimento.dataset_id
            )
          }))
          .filter(x =>
            x.dataset?.manifest.peru === true
          );

        setPendientes(
          peruanos.filter(x =>
            x.experimento.estado === "pending"
          ).length
        );

        setDatos(
          peruanos.filter(
            (x): x is Resultado =>
              Boolean(
                x.dataset &&
                x.dataset.estado === "approved" &&
                x.experimento.estado === "approved" &&
                x.experimento.resultados
                  ?.modelo_seleccionado
              )
          )
        );
      })
      .catch(err => {
        if (!ctrl.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : String(err)
          );
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setCargando(false);
        }
      });

    return () => ctrl.abort();
  }, [token, revision]);

  return (
    <section className="mlr">
      <header className="mlr-head">
        <div>
          <h2>
            <BrainCircuit size={23}/>
            Resultados de inteligencia artificial
          </h2>

          <p>
            Perú · Modelos entrenados internamente
            con registros sísmicos históricos
          </p>
        </div>

        <button
          disabled={cargando}
          onClick={() =>
            setRevision(v => v + 1)
          }
        >
          <RefreshCw size={16}/>
          Actualizar resultados
        </button>
      </header>

      <div className="mlr-alert">
        <ShieldAlert size={20}/>

        <div>
          <strong>
            Evaluaciones históricas, no pronósticos
            de futuros terremotos.
          </strong>

          <p>
            Los modelos comparan estimaciones con
            sismos ya registrados. No anticipan
            fecha, ubicación o magnitud de nuevos
            terremotos ni emiten alertas oficiales.
          </p>
        </div>
      </div>

      {cargando && (
        <p role="status">
          Consultando evaluaciones aprobadas...
        </p>
      )}

      {error && (
        <p className="mlr-error" role="alert">
          {error}
        </p>
      )}

      {!cargando && !error && (
        <>
          <div className="mlr-stats">
            <article>
              <span>Modelos aprobados</span>
              <strong>{datos.length}</strong>
            </article>

            <article>
              <span>En revisión científica</span>
              <strong>{pendientes}</strong>
            </article>

            <article>
              <span>
                Pronóstico futuro validado
              </span>
              <strong>No disponible</strong>
            </article>
          </div>

          {!datos.length && (
            <div
              className="mlr-card"
              role="status"
            >
              <h3>
                Esperando resultados aprobados
              </h3>

              <p>
                La preparación y el entrenamiento
                se ejecutarán en el servidor cuando
                se configure la tarea programada y
                haya suficientes datos válidos.
                La aprobación científica se mantiene
                como revisión administrativa.
              </p>
            </div>
          )}

          {datos.map(({
            experimento: e,
            dataset: d
          }) => {
            const r = e.resultados;

            const mejor = r.comparacion.find(
              x => x.modelo ===
                r.modelo_seleccionado
            );

            const serie = (
              r.serie_validacion ?? []
            ).map(x => ({
              fecha: fecha(x.fecha_utc),
              observada: x.real,
              estimada: x.estimado
            }));

            return (
              <article
                className="mlr-card"
                key={e.id}
              >
                <div className="mlr-title">
                  <div>
                    <h3>
                      {e.algoritmo === "regresion"
                        ? "Magnitudes: valores reales frente a estimados"
                        : "Clasificación de eventos históricos (magnitud 4+)"}
                    </h3>

                    <p>
                      Modelo:{" "}
                      {r.modelo_seleccionado}
                      {" · "}
                      {d.manifest.fuente ||
                        "IGP y USGS"}
                    </p>
                  </div>

                  <span className="mlr-ok">
                    Aprobado
                  </span>
                </div>

                <div className="mlr-stats">
                  <article>
                    <span>
                      Eventos utilizados
                    </span>

                    <strong>
                      {num(d.total)}
                    </strong>
                  </article>

                  <article>
                    <span>
                      Eventos de validación
                    </span>

                    <strong>
                      {num(r.validacion)}
                    </strong>
                  </article>

                  <article>
                    <span>
                      Fecha de aprobación
                    </span>

                    <strong>
                      {fecha(e.revisada_utc)}
                    </strong>
                  </article>
                </div>

                {e.algoritmo === "regresion" && (
                  <>
                    <p>
                      Comparación retrospectiva:
                      cuanto más próximas están
                      las líneas, menores son los
                      errores de estimación sobre
                      estos eventos ya conocidos.
                    </p>

                    {serie.length > 0 && (
                      <div className="mlr-chart">
                        <ResponsiveContainer
                          width="100%"
                          height={270}
                        >
                          <LineChart data={serie}>
                            <CartesianGrid
                              strokeDasharray="3 3"
                            />

                            <XAxis
                              dataKey="fecha"
                              minTickGap={25}
                            />

                            <YAxis/>
                            <Tooltip/>
                            <Legend/>

                            <Line
                              dataKey="observada"
                              name="Magnitud real"
                              stroke="#0b94b7"
                              dot={false}
                            />

                            <Line
                              dataKey="estimada"
                              name="Magnitud estimada"
                              stroke="#e2902b"
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    <p>
                      <strong>
                        Error medio:{" "}
                        {num(mejor?.mae)} unidades
                        de magnitud.
                      </strong>

                      {" "}Cuanto menor sea el error,
                      mejor fue el resultado
                      en esta prueba.
                    </p>
                  </>
                )}

                {e.algoritmo ===
                  "clasificacion" && (
                  <p>
                    <strong>
                      Precisión:{" "}
                      {num(
                        mejor?.precision == null
                          ? undefined
                          : mejor.precision * 100
                      )} %.
                    </strong>

                    {" "}De los casos identificados
                    como magnitud 4+, esta proporción
                    fue correcta.

                    {" "}Detección (recall):{" "}
                    {num(
                      mejor?.recall == null
                        ? undefined
                        : mejor.recall * 100
                    )} %.
                  </p>
                )}

                <details>
                  <summary>
                    Ver comparación técnica y
                    limitaciones
                  </summary>

                  <div className="mlr-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Modelo</th>
                          <th>MAE</th>
                          <th>RMSE</th>
                          <th>R²</th>
                          <th>Precisión</th>
                          <th>Recall</th>
                          <th>F1</th>
                        </tr>
                      </thead>

                      <tbody>
                        {r.comparacion.map(m => (
                          <tr key={m.modelo}>
                            <td>{m.modelo}</td>
                            <td>{num(m.mae)}</td>
                            <td>{num(m.rmse)}</td>
                            <td>{num(m.r2)}</td>
                            <td>
                              {num(m.precision)}
                            </td>
                            <td>
                              {num(m.recall)}
                            </td>
                            <td>{num(m.f1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p>{r.limitacion}</p>
                </details>
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}
