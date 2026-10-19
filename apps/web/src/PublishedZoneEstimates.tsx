import {useContext, useEffect, useState} from "react";
import {TokenContext} from "./AuthGate";
import {apiError} from "./apiErrors";
import type {ZoneResult} from "./ZoneWorkspace";
import {percent, zoneDate} from "./zoneFormatting";

type Version = {id:string; fuente:string; revisada_utc:string; metodo:string; dataset_id:string};
export default function PublishedZoneEstimates({peru}:{peru:boolean}) {
  const token = useContext(TokenContext);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selection, setSelection] = useState("");
  const [data, setData] = useState<ZoneResult|null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    async function load() {
      setError(""); setData(null);
      try {
        const path = selection ? `/api/v1/forecasts/published/${selection}` : `/api/v1/forecasts/published?peru=${peru}`;
        const response = await fetch(path, {signal:controller.signal, headers:{Authorization:`Bearer ${token}`}});
        if (!response.ok) throw Error(await apiError(response, "No se pudo consultar la versión aprobada"));
        const result = await response.json();
        if (selection && (!Array.isArray(result.zonas) || !result.metadatos)) throw Error("La versión recibida está incompleta. Consulta el historial de modelos.");
        if (!selection && !Array.isArray(result.versiones)) throw Error("El listado de versiones está incompleto. Actualiza la API y vuelve a consultar.");
        if (!controller.signal.aborted) {
          if (selection) setData(result); else setVersions(result.versiones);
        }
      } catch(e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Consulta no disponible"); }
    }
    void load();
    return () => controller.abort();
  }, [token, peru, selection]);
  return <article className="prep-card"><h3>Versiones experimentales aprobadas por zonas</h3>
    <p>Solo se muestran versiones con dataset y revisión aprobados. La aprobación es interna; no constituye una alerta oficial ni una certificación científica.</p>
    {error && <p className="prep-error" role="alert">{error}</p>}
    <label>Versión aprobada<select value={selection} onChange={e => setSelection(e.target.value)}>
      <option value="">Selecciona una versión</option>
      {versions.map(v => <option key={v.id} value={v.id}>{v.fuente} · {zoneDate(v.revisada_utc)} · {v.id.slice(0,8)}</option>)}
    </select></label>
    {!versions.length && <p>No hay versiones aprobadas para este ámbito. El analista puede crearlas desde Modelos ML → Exploración por zonas, y el administrador revisarlas.</p>}
    {data && <><p>{data.fuente} · {data.version_metodo} · Dataset {data.dataset_id}</p>
      <p>{zoneDate(data.periodo_inicio_utc)} – {zoneDate(data.periodo_fin_utc)} · {data.registros_historicos} registros.</p>
      <div className="prep-table-wrap"><table className="prep-table"><thead><tr><th>Zona</th><th>Registros M ≥ 4</th><th>Indicador 7 días</th><th>Intervalo 95%</th><th>Indicador 30 días</th></tr></thead>
        <tbody>{data.zonas.map(z => <tr key={z.id}><td>{z.id}</td><td>{z.registros_umbral}</td><td>{percent(z.probabilidad_7d)}</td>
          <td>{z.intervalo_7d ? `${percent(z.intervalo_7d.inferior)} – ${percent(z.intervalo_7d.superior)}` : "Sin datos"}</td><td>{percent(z.probabilidad_30d)}</td></tr>)}</tbody></table></div>
      <p>{data.incertidumbre}</p><p>{data.advertencia}</p></>}
  </article>;
}
