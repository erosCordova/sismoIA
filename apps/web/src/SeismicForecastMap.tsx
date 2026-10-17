import {
  useContext,
  useEffect,
  useState
} from "react";

import {
  MapContainer,
  Rectangle,
  TileLayer,
  Tooltip
} from "react-leaflet";

import {
  MapPinned,
  RefreshCw,
  Activity
} from "lucide-react";

import {TokenContext} from "./AuthGate";

import "leaflet/dist/leaflet.css";
import "./seismic-forecast-map.css";

type Zona = {
  id: string;
  latitud_sur: number;
  latitud_norte: number;
  longitud_oeste: number;
  longitud_este: number;
  eventos_entrenamiento: number;
  probabilidad_7d: number;
  probabilidad_30d: number;
};

type Pronostico = {
  modelo: string;
  estado: string;
  magnitud_minima: number;
  ultimo_evento_utc: string;
  antiguedad_horas: number;
  registros_historicos: number;
  zonas: Zona[];
};

type Horizonte = 7 | 30;

function porcentaje(valor: number) {
  return (valor * 100).toLocaleString("es-PE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }) + "%";
}

function probabilidad(zona: Zona, dias: Horizonte) {
  return dias === 7
    ? zona.probabilidad_7d
    : zona.probabilidad_30d;
}

function color(valor: number) {
  if (valor >= 0.65) return "#ef7856";
  if (valor >= 0.30) return "#f1b54a";
  return "#12abc0";
}

function nombreZona(id: string) {
  const indice = Number(id.slice(1)) - 1;

  if (!Number.isInteger(indice) ||
      indice < 0 || indice >= 12) {
    return id;
  }

  const filas = [
    "Sur",
    "Centro-sur",
    "Centro-norte",
    "Norte"
  ];

  const columnas = [
    "Oeste",
    "Centro",
    "Este"
  ];

  return (
    filas[Math.floor(indice / 3)] +
    " · " +
    columnas[indice % 3]
  );
}

export default function SeismicForecastMap() {
  const token = useContext(TokenContext);

  const [datos, setDatos] =
    useState<Pronostico | null>(null);

  const [dias, setDias] =
    useState<Horizonte>(7);

  const [seleccion, setSeleccion] =
    useState("");

  const [revision, setRevision] =
    useState(0);

  const [cargando, setCargando] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!token) {
      setCargando(false);
      setError("Inicia sesión para consultar.");
      return;
    }

    const controller = new AbortController();

    setCargando(true);
    setError("");

    fetch("/api/v1/forecasts/zones", {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(async respuesta => {
        if (!respuesta.ok) {
          throw new Error(
            respuesta.status === 401 ||
            respuesta.status === 403
              ? "Sin permiso para consultar pronósticos."
              : "No se pudieron cargar los pronósticos."
          );
        }

        return respuesta.json() as Promise<Pronostico>;
      })
      .then(resultado => {
        if (controller.signal.aborted) return;

        if (
          !Array.isArray(resultado.zonas) ||
          resultado.zonas.length !== 12
        ) {
          throw new Error("Zonas no disponibles.");
        }

        setDatos(resultado);
        setSeleccion(anterior =>
          resultado.zonas.some(z => z.id === anterior)
            ? anterior
            : resultado.zonas[0].id
        );
      })
      .catch(fallo => {
        if (controller.signal.aborted) return;

        setError(
          fallo instanceof Error
            ? fallo.message
            : "No se pudieron cargar los pronósticos."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setCargando(false);
        }
      });

    return () => controller.abort();
  }, [token, revision]);

  const zona = datos?.zonas.find(
    item => item.id === seleccion
  ) ?? datos?.zonas[0];

  const valorSeleccionado = zona
    ? probabilidad(zona, dias)
    : 0;

  const desactualizado =
    datos?.estado === "DATOS_DESACTUALIZADOS";

  return (
    <section className="sf-root">
      <header className="sf-header">
        <div className="sf-heading">
          <span className="sf-heading-icon">
            <MapPinned size={21}/>
          </span>

          <div>
            <h2>Pronósticos por zonas</h2>
            <span className="sf-subtitle">
              Perú · Magnitud ≥ 4.0
            </span>
          </div>
        </div>

        <div className="sf-header-actions">
          <div
            className="sf-horizons"
            aria-label="Horizonte del pronóstico"
          >
            <button
              type="button"
              className={dias === 7 ? "active" : ""}
              aria-pressed={dias === 7}
              onClick={() => setDias(7)}
            >
              7 días
            </button>

            <button
              type="button"
              className={dias === 30 ? "active" : ""}
              aria-pressed={dias === 30}
              onClick={() => setDias(30)}
            >
              30 días
            </button>
          </div>

          <button
            type="button"
            className="sf-refresh"
            title="Actualizar resultados"
            aria-label="Actualizar resultados"
            disabled={cargando}
            onClick={() => setRevision(v => v + 1)}
          >
            <RefreshCw size={18}/>
          </button>
        </div>
      </header>

      <div className="sf-statusline">
        <span className="sf-pill">
          <Activity size={13}/>
          Experimental
        </span>

        {desactualizado && (
          <span className="sf-pill sf-stale">
            Datos desactualizados
          </span>
        )}

        {datos && (
          <span className="sf-period">
            Historial: {datos.registros_historicos.toLocaleString("es-PE")} eventos
          </span>
        )}
      </div>

      {error && (
        <div className="sf-message" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setRevision(v => v + 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      {cargando && (
        <div className="sf-loading" role="status">
          Cargando mapa de pronósticos…
        </div>
      )}

      {datos && !cargando && (
        <>
          <div className="sf-layout">
            <div className="sf-map-frame">
              <MapContainer
                center={[-9.0, -75.5]}
                bounds={[
                  [-19.0, -83.5],
                  [1.0, -68.0]
                ]}
                scrollWheelZoom={false}
                minZoom={3}
                maxZoom={11}
                className="sf-map"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  maxZoom={19}
                />

                {datos.zonas.map(item => {
                  const valor = probabilidad(item, dias);
                  const activo = item.id === zona?.id;

                  return (
                    <Rectangle
                      key={item.id}
                      bounds={[
                        [
                          item.latitud_sur,
                          item.longitud_oeste
                        ],
                        [
                          item.latitud_norte,
                          item.longitud_este
                        ]
                      ]}
                      pathOptions={{
                        color: activo
                          ? "#153a5a"
                          : color(valor),
                        fillColor: color(valor),
                        fillOpacity: activo ? 0.48 : 0.30,
                        weight: activo ? 3 : 1.5
                      }}
                      eventHandlers={{
                        click: () =>
                          setSeleccion(item.id)
                      }}
                    >
                      <Tooltip sticky>
                        <strong>{item.id}</strong>
                        {" · "}
                        {porcentaje(valor)}
                      </Tooltip>
                    </Rectangle>
                  );
                })}
              </MapContainer>

              <div className="sf-legend">
                <span>
                  <i className="sf-dot low"/>
                  0–29 %
                </span>
                <span>
                  <i className="sf-dot mid"/>
                  30–64 %
                </span>
                <span>
                  <i className="sf-dot high"/>
                  ≥ 65 %
                </span>
              </div>
            </div>

            {zona && (
              <aside className="sf-details">
                <span className="sf-zone-tag">
                  {zona.id}
                </span>

                <h3>{nombreZona(zona.id)}</h3>

                <div className="sf-probability">
                  <span>
                    Probabilidad histórica · {dias} días
                  </span>
                  <strong>
                    {porcentaje(valorSeleccionado)}
                  </strong>
                  <small>
                    Al menos un evento M ≥ 4.0
                  </small>
                </div>

                <div className="sf-breakdown">
                  <div>
                    <span>7 días</span>
                    <strong>
                      {porcentaje(
                        zona.probabilidad_7d
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>30 días</span>
                    <strong>
                      {porcentaje(
                        zona.probabilidad_30d
                      )}
                    </strong>
                  </div>
                </div>

                <div className="sf-metadata">
                  <span>Último registro</span>
                  <strong>
                    {new Date(
                      datos.ultimo_evento_utc
                    ).toLocaleDateString("es-PE", {
                      timeZone: "America/Lima",
                      day: "2-digit",
                      month: "short",
                      year: "numeric"
                    })}
                  </strong>
                </div>
              </aside>
            )}
          </div>

          <footer className="sf-footer">
            <span>
              Zonas aproximadas; incluyen áreas vecinas.
            </span>
            <span>
              No predice fecha, epicentro ni intensidad.
            </span>
          </footer>
        </>
      )}
    </section>
  );
}
