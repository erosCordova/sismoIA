import { useContext, useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Activity, RefreshCw, MapPinned } from "lucide-react";
import { TokenContext, UsuarioContext } from "./AuthGate";
import SismoiaDashboard from "./SismoiaDashboard";
import "leaflet/dist/leaflet.css";
import "./seismic.css";

type Evento = {
  fuente: string;
  id: string; fecha_utc: string; latitud: number; longitud: number;
  magnitud: number; profundidad_km: number | null; lugar: string | null;
  url: string | null;
};
type Estadisticas = {
  total_eventos: number; eventos_peru: number; magnitud_maxima: number | null;
  ultima_sincronizacion_utc: string | null; fuente: string | null;
};
type Lista = { total: number; eventos: Evento[] };
type Modo = "dashboard" | "eventos" | "mapa";

function fecha(valor: string | null) {
  if (!valor) return "Sin sincronizar";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "Fecha no disponible" :
    d.toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" });
}

export default function SeismicWorkspace({ modo, peru }: { modo: Modo; peru: boolean }) {
  const token = useContext(TokenContext);
  const usuario = useContext(UsuarioContext);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [estadisticas, setEstadisticas] = useState<Estadisticas | null>(null);
  const [total, setTotal] = useState(0);
  const [magnitud, setMagnitud] = useState("");
  const [fuente, setFuente] = useState("");
  const [pagina, setPagina] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  async function cargar(signal?: AbortSignal) {
    if (!token) return;
    setCargando(true);
    setError("");
    try {
      const parametros = new URLSearchParams({
        peru: String(peru), limit: modo === "mapa" || modo === "dashboard" ? "500" : "100", offset: String(pagina * (modo === "mapa" ? 500 : 100))
      });
      if (magnitud) parametros.set("min_magnitude", magnitud);
      if (fuente) parametros.set("fuente", fuente);
      const opciones = { headers: { Authorization: `Bearer ${token}` }, signal };
      const [rEventos, rStats] = await Promise.all([
        fetch(`/api/v1/seismic/events?${parametros}`, opciones),
        fetch("/api/v1/seismic/stats", opciones)
      ]);
      if (!rEventos.ok || !rStats.ok) throw new Error(`Consulta fallida: eventos ${rEventos.status}, estadísticas ${rStats.status}`);
      const lista: Lista = await rEventos.json();
      const stats: Estadisticas = await rStats.json();
      if (signal?.aborted) return;
      setEventos(lista.eventos);
      setTotal(lista.total);
      setEstadisticas(stats);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Error consultando eventos");
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }

  useEffect(() => { setPagina(0); }, [peru, magnitud, fuente]);
  useEffect(() => {
    const controlador = new AbortController();
    void cargar(controlador.signal);
    return () => controlador.abort();
  }, [token, peru, magnitud, fuente, pagina]);

  // SISMOIA_AUTO_REFRESH: consultar la base de datos cada minuto
  useEffect(() => {
    if (!token) return;
    const temporizador = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar();
    }, 60_000);
    return () => window.clearInterval(temporizador);
  }, [token, peru, magnitud, fuente, pagina]);

  async function sincronizar() {
    if (!token) return;
    setSincronizando(true);
    setError("");
    setAviso("");
    try {
      const respuesta = await fetch("/api/v1/seismic/sync-all", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error(`Sincronización rechazada: ${respuesta.status}`);
      const datos = await respuesta.json();
      setAviso(`USGS actualizado: ${datos.importados} nuevos, ${datos.duplicados} existentes.`);
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo sincronizar");
    } finally {
      setSincronizando(false);
    }
  }

  const titulo = modo === "dashboard" ? "Monitoreo sísmico con datos observados"
    : modo === "mapa" ? "Mapa interactivo de epicentros" : "Registro de eventos sísmicos";
  const puedeSincronizar = usuario?.roles.includes("Administrador") ?? false;

  return (
    <section className="seis-root">
      <header className="seis-header">
        <div>
          <h2><Activity size={23} /> {titulo}</h2>
          <p>Fuente USGS + IGP · {peru ? "Zona geográfica aproximada de Perú" : "Cobertura mundial"} · Horarios de Perú</p>
        </div>
        <div className="seis-actions">
          <select aria-label="Fuente sísmica" value={fuente} onChange={e => setFuente(e.target.value)}><option value="">Todas las fuentes</option><option value="USGS">USGS</option><option value="IGP">IGP</option></select>
          {modo !== "dashboard" && <label>Magnitud mínima
            <select value={magnitud} onChange={e => setMagnitud(e.target.value)}>
              <option value="">Todas</option>
              <option value="2">2,0+</option><option value="4">4,0+</option>
              <option value="5">5,0+</option><option value="6">6,0+</option>
            </select>
          </label>}
          <button type="button" disabled={cargando || sincronizando} onClick={() => void cargar()}>
            <RefreshCw size={16} /> Actualizar vista
          </button>
          {puedeSincronizar && <button type="button" className="seis-primary"
            disabled={sincronizando} onClick={() => void sincronizar()}>
            <RefreshCw size={16} /> {sincronizando ? "Sincronizando..." : "Sincronizar fuentes"}
          </button>}
        </div>
      </header>

      {error && <p className="seis-error" role="alert">{error}</p>}
      {aviso && <p className="seis-notice" role="status">{aviso}</p>}
      {cargando && <p className="seis-notice">Cargando datos sísmicos...</p>}

      {modo !== "dashboard" && <div className="seis-stats">
        <article><span>Eventos en la consulta</span><strong>{total.toLocaleString("es-PE")}</strong></article>
        <article><span>Eventos registrados mundialmente</span><strong>{(estadisticas?.total_eventos ?? 0).toLocaleString("es-PE")}</strong></article>
        <article><span>Eventos en la zona de Perú</span><strong>{(estadisticas?.eventos_peru ?? 0).toLocaleString("es-PE")}</strong></article>
        <article><span>Magnitud máxima registrada</span><strong>{estadisticas?.magnitud_maxima?.toFixed(1) ?? "—"}</strong></article>
      </div>}

      {modo === "dashboard" ? (
        <SismoiaDashboard
          eventos={eventos}
          total={total}
          estadisticas={estadisticas}
          peru={peru}
          cargando={cargando}
        />
      ) : modo === "mapa" ? (
        <div className="seis-surface">
          <h3><MapPinned size={19} /> Epicentros registrados · {eventos.length} visibles</h3>
          <div className="seis-map">
            <MapContainer key={peru ? "peru" : "mundo"} center={peru ? [-9.2, -75] : [15, 0]}
              zoom={peru ? 5 : 2} scrollWheelZoom={true} style={{ height: 470, width: "100%" }}>
              <TileLayer attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {eventos.map(e => (
                <CircleMarker key={e.id} center={[e.latitud, e.longitud]}
                  radius={Math.max(4, Math.min(16, e.magnitud * 2))}
                  pathOptions={{ color: e.magnitud >= 5 ? "#c43f38" : "#087a9a", fillOpacity: 0.7 }}>
                  <Popup><strong>{e.lugar || "Epicentro sin descripción"}</strong><p>Fuente: {e.fuente}</p>
                    <p>Magnitud {e.magnitud} · Profundidad {e.profundidad_km ?? "?"} km</p>
                    <p>{fecha(e.fecha_utc)}</p>
                    {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer">Ver en USGS</a>}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
          <p className="seis-caption">Se muestran hasta 500 epicentros recientes por página. Los círculos indican localizaciones y magnitudes observadas.</p>
        </div>
      ) : (
        <div className="seis-surface">
          <h3>Catálogo de terremotos</h3>
          <div className="seis-table-scroll">
            <table className="seis-table">
              <thead><tr><th>Fecha y hora</th><th>Lugar</th><th>Magnitud</th><th>Profundidad</th><th>Coordenadas</th><th>Fuente</th></tr></thead>
              <tbody>
                {eventos.slice(0, 100).map(e => (
                  <tr key={e.id}>
                    <td>{fecha(e.fecha_utc)}</td>
                    <td>{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.lugar || "Sin descripción"}</a> : e.lugar || "Sin descripción"}</td>
                    <td><strong>{e.magnitud.toFixed(1)}</strong></td>
                    <td>{e.profundidad_km === null ? "—" : `${e.profundidad_km} km`}</td>
                    <td>{e.latitud.toFixed(3)}, {e.longitud.toFixed(3)}</td><td>{e.fuente}</td>
                  </tr>
                ))}
                {!cargando && eventos.length === 0 && <tr><td colSpan={6}>No hay eventos para estos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {modo === "eventos" && <nav className="seis-pagination">
        <button disabled={pagina === 0 || cargando} onClick={() => setPagina(p => p - 1)}>Anterior</button>
        <span>Página {pagina + 1} · {total.toLocaleString("es-PE")} registros</span>
        <button disabled={(pagina + 1) * 100 >= total || cargando} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
      </nav>}
      <p className="seis-caption">Última sincronización: {fecha(estadisticas?.ultima_sincronizacion_utc ?? null)} · La actividad sísmica observada no permite predecir con exactitud futuros terremotos.</p>
    </section>
  );
}
