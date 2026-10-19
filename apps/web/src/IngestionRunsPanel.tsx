import {useContext, useEffect, useState} from "react";
import {TokenContext} from "./AuthGate";

type Run = {
  id: string; fuente: string; estado: string; inicio_utc: string;
  recibidos: number; insertados: number; actualizados: number;
  descartados: number; error: string | null;
};

export default function IngestionRunsPanel({revision}: {revision: number}) {
  const token = useContext(TokenContext);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetch("/api/v1/sources/runs?limite=30", {
      signal: controller.signal, cache: "no-store",
      headers: {Authorization: `Bearer ${token}`}
    }).then(async response => {
      if (!response.ok) throw Error(`Historial no disponible: HTTP ${response.status}`);
      return response.json() as Promise<{ejecuciones: Run[]}>;
    }).then(data => {
      if (!controller.signal.aborted) {setRuns(data.ejecuciones); setError("");}
    }).catch(reason => {
      if (!controller.signal.aborted) setError(String(reason));
    });
    return () => controller.abort();
  }, [token, revision]);
  return <article className="prep-card">
    <h3>Últimas ejecuciones de sincronización</h3>
    {error ? <p role="alert">{error}</p> : runs === null ? <p role="status">Consultando historial…</p> :
      runs.length === 0 ? <p>Todavía no hay ejecuciones registradas.</p> :
      <div style={{overflowX: "auto"}}><table className="ml-table"><thead><tr>
        <th>Inicio (Perú)</th><th>Fuente</th><th>Estado</th><th>Recibidos</th>
        <th>Nuevos</th><th>Actualizados</th><th>Descartados</th><th>Error</th>
      </tr></thead><tbody>{runs.map(run => <tr key={run.id}>
        <td>{new Date(run.inicio_utc).toLocaleString("es-PE", {timeZone: "America/Lima"})}</td>
        <td>{run.fuente}</td><td>{run.estado}</td><td>{run.recibidos}</td><td>{run.insertados}</td>
        <td>{run.actualizados}</td><td>{run.descartados}</td><td>{run.error || "—"}</td>
      </tr>)}</tbody></table></div>}
  </article>;
}
