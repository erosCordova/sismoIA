import {useCallback, useContext, useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {MapContainer, TileLayer, Rectangle, Tooltip} from "react-leaflet";
import {TokenContext, UsuarioContext} from "./AuthGate";
import {apiError} from "./apiErrors";
import {percent, zoneDate} from "./zoneFormatting";
import "leaflet/dist/leaflet.css";
import "./seismic-forecast-map.css";
import "./model-result-reading.css";

type Interval = {inferior:number; superior:number};
type Zone = {id:string; latitud_sur:number; latitud_norte:number; longitud_oeste:number; longitud_este:number;
  registros_umbral:number; tasa_registros_dia:number; probabilidad_7d:number|null; probabilidad_30d:number|null;
  intervalo_7d:Interval|null; intervalo_30d:Interval|null};
export type ZoneResult = {modelo:string; version_metodo:string; version_datos:string; estado_revision:string;
  indicador_disponible:boolean; requisitos_indicador:string;
  publicado:boolean; peru:boolean; fuente:string; periodo_inicio_utc:string; periodo_fin_utc:string;
  fecha_calculo_utc:string; dias_observacion:number; registros_historicos:number; registros_umbral:number;
  zonas:Zone[]; incertidumbre:string; advertencia:string; dataset_id?:string;
  metadatos:{consulta_limitada?:boolean; origen:string}};
type Dataset = {id:string; nombre:string; estado:string; total:number; manifest:{peru:boolean}};
type Run = {id:string; dataset_id:string; estado:string; creada_utc:string; motivo:string|null;
  resultados:ZoneResult};

export default function ZoneWorkspace({peru}:{peru:boolean}) {
  const token = useContext(TokenContext);
  const user = useContext(UsuarioContext);
  const canTrain = Boolean(user?.permisos.some(p => p === "*" || p === "models:train"));
  const canReview = Boolean(user?.permisos.some(p => p === "*" || p === "users:manage"));
  const [source, setSource] = useState(peru ? "IGP" : "USGS");
  const [days, setDays] = useState("365");
  const [horizon, setHorizon] = useState<7|30>(7);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<ZoneResult|null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [runId, setRunId] = useState("");
  const [reason, setReason] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (path:string, body?:unknown) => {
    const response = await fetch(path, {method:body === undefined ? "GET" : "POST",
      headers:{Authorization:`Bearer ${token}`, ...(body === undefined ? {} : {"Content-Type":"application/json"})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})});
    if (!response.ok) throw Error(await apiError(response, "No se pudo consultar la exploración"));
    return response.json();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(""); setData(null);
      try {
        const path = runId ? `/api/v1/forecasts/runs/${runId}` : `/api/v1/forecasts/zones?peru=${peru}&fuente=${source}&dias=${days}`;
        const response = await fetch(path, {signal:controller.signal, headers:{Authorization:`Bearer ${token}`}});
        if (!response.ok) throw Error(await apiError(response, "No se pudo calcular la exploración"));
        const result:ZoneResult = await response.json();
        if (!Array.isArray(result.zonas) || !result.zonas.length || !result.metadatos || typeof result.registros_historicos !== "number") {
          throw Error("La respuesta del backend no corresponde a la exploración actual. Actualiza o reinicia la API y vuelve a consultar.");
        }
        if (alive) setData(result);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : "No se pudo conectar al backend"); }
      finally { if (alive) setLoading(false); }
    }
    void load();
    return () => { alive = false; controller.abort(); };
  }, [token, peru, source, days, runId, revision]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    async function loadVersions() {
      try {
        const [history, versions] = await Promise.all([
          request(`/api/v1/forecasts/runs?peru=${peru}`),
          canTrain ? request("/api/v1/governance/datasets?limite=100") : Promise.resolve({datasets:[]})
        ]);
        if (!Array.isArray(history.experimentos) || !Array.isArray(versions.datasets)) throw Error("El historial recibido está incompleto. Actualiza la API y vuelve a consultar.");
        if (alive) { setRuns(history.experimentos); setDatasets(versions.datasets); }
      } catch (e) { if (alive) setNotice(e instanceof Error ? e.message : "No se pudo consultar el historial"); }
    }
    void loadVersions();
    return () => { alive = false; };
  }, [request, token, peru, canTrain, revision]);

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const run:Run = await request("/api/v1/forecasts/runs", {dataset_id:datasetId, fuente:source, peru});
      setRunId(run.id); setRevision(n => n+1);
      setNotice("Versión guardada y vinculada al dataset. Está pendiente de revisión.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  }

  async function review(decision:"approved"|"rejected") {
    setBusy(true); setError("");
    try {
      await request(`/api/v1/governance/experiments/${runId}/review`, {decision, motivo:reason.trim()});
      if (decision === "rejected") setRunId("");
      setRevision(n => n+1); setReason("");
      setNotice(decision === "approved" ? "Versión aprobada para consulta experimental en Estimaciones históricas." : "Versión rechazada. El historial conserva la revisión.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar la revisión"); }
    finally { setBusy(false); }
  }

  const zone = data?.zonas.find(z => z.id === selected) ?? data?.zonas.reduce((best,current) => current.registros_umbral > best.registros_umbral ? current : best);
  const probability = zone?.[horizon === 7 ? "probabilidad_7d" : "probabilidad_30d"];
  const interval = zone?.[horizon === 7 ? "intervalo_7d" : "intervalo_30d"];
  const activeRun = runs.find(r => r.id === runId);

  return <section className="prep-root">
    <header className="prep-header"><div><h2>Exploración histórica por zonas</h2>
      <p>{peru ? "Perú y entorno rectangular" : "Mundo"} · Catálogo observado · Magnitud ≥ 4</p></div>
      <button disabled={loading || busy} onClick={() => setRevision(n => n+1)}>Actualizar</button>
    </header>
    <div className="sismo-filter-bar">
      <label>Fuente<select value={source} onChange={e => {setSource(e.target.value); setRunId("");}}>
        <option value="IGP">IGP</option><option value="USGS">USGS</option></select></label>
      <label>Periodo del catálogo actual<select value={days} onChange={e => {setDays(e.target.value); setRunId("");}}>
        <option value="30">30 días</option><option value="90">90 días</option><option value="365">1 año</option><option value="1095">3 años</option><option value="3650">10 años</option>
      </select></label>
      <label>Ventana del indicador<select value={horizon} onChange={e => setHorizon(Number(e.target.value) as 7|30)}>
        <option value="7">7 días</option><option value="30">30 días</option></select></label>
      <label>Resultado consultado<select value={runId} onChange={e => setRunId(e.target.value)}>
        <option value="">Laboratorio con catálogo actual</option>
        {runs.map(r => <option key={r.id} value={r.id} disabled={r.estado === "rejected"}>
          {r.id.slice(0,8)} · {r.resultados.fuente} · {r.estado === "approved" ? "Aprobado" : r.estado === "rejected" ? "Rechazado" : "Pendiente"}
        </option>)}</select></label>
    </div>
    {error && <p className="prep-error" role="alert">{error}</p>}
    {notice && <p className="ml-note" role="status">{notice}</p>}
    {loading && <p role="status">Consultando el catálogo y calculando las zonas...</p>}
    {data && <>
      <div className="ops-notice"><strong>{runId ? (data.estado_revision === "approved" ? "Versión revisada · Uso experimental" : "Versión guardada · Pendiente de revisión") : "Laboratorio sobre el catálogo actual · No publicado"}</strong>
        <p>{data.advertencia}</p></div>
      <div className="prep-metrics">
        <article><span>Fuente efectiva</span><strong>{data.fuente}</strong></article>
        <article><span>Registros consultados</span><strong>{data.registros_historicos.toLocaleString("es-PE")}</strong></article>
        <article><span>Registros M ≥ 4</span><strong>{data.registros_umbral.toLocaleString("es-PE")}</strong></article>
        <article><span>Días del periodo</span><strong>{data.dias_observacion}</strong></article>
      </div>
      {!data.registros_historicos && <p role="status">No hay registros para esta fuente y periodo. Cambia los filtros o consulta <Link to="/fuentes">Fuentes de datos</Link>. No se interpreta esta ausencia como peligro cero.</p>}
      {data.registros_historicos > 0 && !data.indicador_disponible && <p role="status">El mapa muestra los registros disponibles. Para calcular el indicador: {data.requisitos_indicador}.</p>}
      <div className="prep-grid">
        <article className="prep-card"><h3>Zonas del catálogo</h3>
          <MapContainer key={peru ? "peru" : "mundo"} bounds={peru ? [[-19,-82],[1,-68]] : [[-75,-180],[75,180]]}
            style={{height:390, width:"100%"}} scrollWheelZoom={false}>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
            {data.zonas.map(z => <Rectangle key={z.id}
              bounds={[[Math.max(-85,z.latitud_sur),z.longitud_oeste],[Math.min(85,z.latitud_norte),z.longitud_este]]}
              pathOptions={{color:z.id === zone?.id ? "#073653" : "#1687b1", weight:z.id === zone?.id ? 3 : 1,
                fillColor:"#159ac0", fillOpacity:0.12+Math.min(.45,z.registros_umbral/Math.max(1,data.registros_umbral))}}
              eventHandlers={{click:() => setSelected(z.id)}}>
              <Tooltip>{z.id} · {z.registros_umbral} registros M ≥ 4</Tooltip>
            </Rectangle>)}
          </MapContainer><p>La intensidad del azul representa registros del catálogo; no niveles oficiales de peligro.</p>
        </article>
        <article className="prep-card"><h3>Zona {zone?.id}</h3>
          <label>Seleccionar zona<select value={zone?.id ?? ""} onChange={e => setSelected(e.target.value)}>
            {data.zonas.map(z => <option key={z.id} value={z.id}>{z.id} · {z.registros_umbral} registros</option>)}</select></label>
          <p>Indicador Poisson para al menos un registro M ≥ 4 en {horizon} días, condicionado a la tasa histórica:</p>
          <strong style={{fontSize:30}}>{percent(probability)}</strong>
          <p>Intervalo del modelo 95%: {interval ? `${percent(interval.inferior)} – ${percent(interval.superior)}` : "Sin datos"}</p>
          <section className="result-reading" aria-label="Interpretación del indicador de zona">
            <h4>Cómo leer esta zona</h4>
            <p>Se encontraron <strong>{zone?.registros_umbral.toLocaleString("es-PE")} registros de magnitud 4 o más</strong> en esta celda durante el periodo observado. El azul muestra la cantidad registrada.</p>
            {typeof probability === "number" && Number.isFinite(probability) ? <>
              <p>Si se mantuvieran la tasa histórica y los supuestos del método, el cálculo asignaría <strong>{percent(probability)}</strong> a encontrar al menos un registro M ≥ 4 en una ventana de {horizon} días. El porcentaje es el resultado de ese modelo, no una certeza sobre los próximos {horizon} días.</p>
              <p>El intervalo muestra un rango de incertidumbre del cálculo: cuanto más amplio, menos precisa es la estimación bajo sus supuestos. No es un rango de fechas ni de magnitudes.</p>
            </> : <p>La muestra no alcanza para calcular el porcentaje. Puedes explorar los registros y ampliar el periodo o revisar la fuente.</p>}
            <p><strong>Cómo usarlo:</strong> compara zonas dentro de la misma fuente y periodo y revisa la cobertura antes de sacar conclusiones. No uses el color o el porcentaje para decidir si un lugar es seguro.</p>
          </section>
          <p>{data.incertidumbre}</p>
          <p>El periodo efectivo abarca el primer y último registro encontrados. No certifica que el catálogo esté completo ni convierte los intervalos sin reportes en ausencia de sismos.</p>
          <p>Periodo: {zoneDate(data.periodo_inicio_utc)} – {zoneDate(data.periodo_fin_utc)}</p>
          <p>Cálculo: {zoneDate(data.fecha_calculo_utc)}</p>
          <p>Método: {data.version_metodo}. Versión: {data.version_datos.slice(0,16)}.</p>
          {data.metadatos.consulta_limitada && <p role="status">El dataset es una muestra limitada del catálogo. Su tasa puede tener sesgo de selección.</p>}
        </article>
      </div>
    </>}
    {canTrain && <article className="prep-card"><h3>Crear una versión revisable</h3>
      <p>Selecciona un dataset registrado en <Link to="/datos">Preparación de datos → Guardar dataset</Link>. Se calculará sobre el periodo y los registros de esa versión, conservando su firma; no sobre la consulta dinámica de arriba.</p>
      <label>Dataset de origen<select value={datasetId} onChange={e => setDatasetId(e.target.value)}>
        <option value="">Selecciona un dataset</option>
        {datasets.filter(d => d.estado !== "rejected" && (peru || !d.manifest.peru)).map(d =>
          <option key={d.id} value={d.id}>{d.nombre} · {d.total} registros · {d.estado}</option>)}
      </select></label>
      <button disabled={!datasetId || busy} onClick={() => void save()}>Calcular y guardar versión</button>
    </article>}
    {canReview && activeRun?.estado === "pending" && <article className="prep-card"><h3>Revisión de la versión seleccionada</h3>
      <p>El dataset debe estar aprobado. Aprobar permite consultar esta versión como estimación experimental, sin convertirla en alerta oficial.</p>
      <label>Motivo de revisión<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={8} maxLength={500}/></label>
      <button disabled={busy || reason.trim().length < 8} onClick={() => void review("approved")}>Aprobar versión experimental</button>
      <button disabled={busy || reason.trim().length < 8} onClick={() => void review("rejected")}>Rechazar versión</button>
    </article>}
  </section>;
}
