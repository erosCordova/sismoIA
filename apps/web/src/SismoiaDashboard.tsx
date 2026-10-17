import { useContext, useEffect, useState } from "react";

import { Link } from "react-router-dom";

import {

  ResponsiveContainer,

  BarChart,

  Bar,

  XAxis,

  YAxis,

  CartesianGrid,

  Tooltip,

  LabelList

} from "recharts";

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

import "./dashboard-alignment.css";
import "./dashboard-approved.css";



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



  const inicioSerie = datos

    ? new Date(datos.inicio_utc).getTime()

    : 0;



  const finSerie = datos

    ? new Date(datos.calculado_utc).getTime()

    : 0;



  const duracionIntervalo = Math.max(

    1,

    (finSerie - inicioSerie) / 10

  );



  const formatoEje: Intl.DateTimeFormatOptions =

    periodo === "24h"

      ? {

          timeZone: "America/Lima",

          hour: "2-digit",

          minute: "2-digit"

        }

      : periodo === "7d"

        ? {

            timeZone: "America/Lima",

            day: "2-digit",

            month: "2-digit",

            hour: "2-digit"

          }

        : periodo === "todos"

          ? {

              timeZone: "America/Lima",

              month: "short",

              year: "2-digit"

            }

          : {

              timeZone: "America/Lima",

              day: "2-digit",

              month: "2-digit"

            };



  const formateadorEje = new Intl.DateTimeFormat(

    "es-PE",

    formatoEje

  );



  const serieGrafico = (datos?.serie ?? []).map(

    (registro, indice) => {

      const desde = inicioSerie + indice * duracionIntervalo;

      const hasta = Math.min(

        finSerie,

        desde + duracionIntervalo

      );



      return {

        ...registro,

        etiqueta: formateadorEje.format(

          new Date(desde + duracionIntervalo / 2)

        ),

        desde: fecha(new Date(desde).toISOString()),

        hasta: fecha(new Date(hasta).toISOString())

      };

    }

  );



  const coloresMagnitud = [
    "#ff444f",
    "#ff9637",
    "#ffcd3c",
    "#05cca2",
    "#9bc7e7"
  ];

  let acumuladoMagnitud = 0;

  const sumaMagnitudes = (datos?.magnitudes ?? []).reduce(
    (s, m) => s + m.cantidad,
    0
  );

  const pasosMagnitud = (datos?.magnitudes ?? []).map((m, i) => {
    const inicio = acumuladoMagnitud;

    acumuladoMagnitud += sumaMagnitudes
      ? m.cantidad / sumaMagnitudes * 100
      : 0;

    return `${
      coloresMagnitud[i % coloresMagnitud.length]
    } ${inicio.toFixed(3)}% ${acumuladoMagnitud.toFixed(3)}%`;
  });

  const fondoDonut = sumaMagnitudes > 0
    ? `conic-gradient(${pasosMagnitud.join(",")})`
    : "#e5eef5";

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



          <h2>SISMOIA Enterprise</h2>



          <p>

            {peru ? "Perú" : "Mundo"}

            {" · "}

            Monitoreo y análisis sísmico con inteligencia artificial

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

        <div

          className="sismo-dashboard-skeleton"

          role="status"

          aria-label="Cargando indicadores sísmicos"

        >

          <div className="sismo-skeleton sismo-dash-skeleton-kpi" />

          <div className="sismo-skeleton sismo-dash-skeleton-kpi" />

          <div className="sismo-skeleton sismo-dash-skeleton-kpi" />

          <div className="sismo-skeleton sismo-dash-skeleton-kpi" />

          <div className="sismo-skeleton sismo-dash-skeleton-chart" />

          <span>Consultando datos del periodo seleccionado...</span>

        </div>

      )}



      {error && (

        <p className="seis-error" role="alert">

          {error}

        </p>

      )}



      {datos && (

        <>

          <div

            className="sismo-dashboard-context"

            aria-label="Contexto de los indicadores"

          >

            <span><b>Zona:</b> {peru ? "Perú" : "Mundo"}</span>

            <span><b>Periodo:</b> {periodos.find(p => p.valor === periodo)?.nombre}</span>

            <span><b>Fuente:</b> {fuente || "Todas (IGP / USGS)"}</span>

            <span><b>Muestra:</b> {datos.total.toLocaleString("es-PE")} registros</span>

            <span><b>Corte:</b> {fecha(datos.calculado_utc)}</span>

          </div>

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



          <div className="s6-map-donut-layout">
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

            <div className="sismo-map-context">

              <span>Coordenadas: latitud / longitud (°)</span>

              <span>Fuente: {fuente || "IGP / USGS"}</span>

              <span>Muestra: {datos.eventos_mapa.length} epicentros</span>

              <span>Corte: {fecha(datos.calculado_utc)}</span>

              <span>Los colores indican magnitud, no daño ni alerta oficial.</span>

            </div>

          </section>



            <section className="dash-card s6-activity-card">
              <header className="dash-card-head">
                <div>
                  <h3>Actividad por magnitud</h3>
                  <p>{periodos.find(p => p.valor === periodo)?.nombre}</p>
                </div>
              </header>

              <div className="s6-donut-content">
                <div
                  className="s6-donut"
                  role="img"
                  aria-label="Distribución registrada de magnitudes"
                  style={{ background: fondoDonut }}
                >
                  <div className="s6-donut-hole">
                    <strong>{datos.total.toLocaleString("es-PE")}</strong>
                    <span>Eventos registrados</span>
                  </div>
                </div>

                <div className="s6-donut-legend">
                  {datos.magnitudes.map((m, i) => (
                    <div className="s6-donut-row" key={m.nombre}>
                      <i
                        style={{
                          backgroundColor:
                            coloresMagnitud[i % coloresMagnitud.length]
                        }}
                      />
                      <span>{m.nombre}</span>
                      <strong>
                        {m.cantidad.toLocaleString("es-PE")}
                      </strong>
                    </div>
                  ))}

                  {!datos.magnitudes.length && (
                    <p>Sin registros para estos filtros.</p>
                  )}
                </div>
              </div>

              <p className="s6-note">
                Distribución de eventos observados; no es un pronóstico.
              </p>
            </section>
          </div>
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



              <div className="dash-chart-meta">

                <span>Número de sismos</span>

                <span>

                  {fecha(datos.inicio_utc)}

                  {" — "}

                  {fecha(datos.calculado_utc)}

                </span>

              </div>



              {datos.total > 0 ? (

                <div className="dash-plot">

                  <ResponsiveContainer width="100%" height={290}>

                    <BarChart

                      data={serieGrafico}

                      margin={{

                        top: 25,

                        right: 8,

                        left: -16,

                        bottom: 10

                      }}

                      barCategoryGap="23%"

                    >

                      <CartesianGrid

                        vertical={false}

                        stroke="#e5edf4"

                        strokeDasharray="4 5"

                      />



                      <XAxis

                        dataKey="etiqueta"

                        axisLine={false}

                        tickLine={false}

                        minTickGap={15}

                        interval="preserveStartEnd"

                        tick={{

                          fill: "#607c91",

                          fontSize: 11

                        }}

                        dy={10}

                      />



                      <YAxis

                        allowDecimals={false}

                        axisLine={false}

                        tickLine={false}

                        width={38}

                        tick={{

                          fill: "#607c91",

                          fontSize: 11

                        }}

                      />



                      <Tooltip

                        cursor={{

                          fill: "#edf9fc"

                        }}

                        content={({ active, payload }) => {

                          const item = payload?.[0]?.payload as

                            (typeof serieGrafico)[number] | undefined;



                          if (!active || !item) return null;



                          return (

                            <div className="dash-tooltip">

                              <strong>

                                {item.cantidad}

                                {" "}

                                {item.cantidad === 1

                                  ? "sismo"

                                  : "sismos"}

                              </strong>



                              <span>

                                Desde: {item.desde}

                              </span>



                              <span>

                                Hasta: {item.hasta}

                              </span>

                            </div>

                          );

                        }}

                      />



                      <Bar

                        dataKey="cantidad"

                        name="Sismos registrados"

                        fill="#0da5bd"

                        radius={[7, 7, 0, 0]}

                        maxBarSize={48}

                      >

                        <LabelList

                          dataKey="cantidad"

                          position="top"

                          fill="#254d67"

                          fontSize={12}

                        />

                      </Bar>

                    </BarChart>

                  </ResponsiveContainer>

                </div>

              ) : (

                <p className="dash-empty">

                  No hay sismos registrados

                  en el periodo seleccionado.

                </p>

              )}



              <p className="dash-chart-description">

                Cantidad de sismos registrados por intervalo.

                Horario de Perú.

              </p>

              <div className="sismo-chart-source">

                <span>Eje X: fecha y hora · horario de Perú</span>

                <span>Eje Y: cantidad de eventos</span>

                <span>Fuente: {fuente || "IGP / USGS"}</span>

                <span>Muestra: {datos.total.toLocaleString("es-PE")}</span>

                <span>Actualizado: {fecha(datos.calculado_utc)}</span>

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

              <div className="sismo-magnitude-context">

                Rangos de magnitud · Conteo de registros ·

                Fuente: {fuente || "IGP / USGS"} ·

                Muestra: {datos.total.toLocaleString("es-PE")} ·

                Corte: {fecha(datos.calculado_utc)}

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
