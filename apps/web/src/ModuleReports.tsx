import {useContext, useState} from "react";
import {TokenContext} from "./AuthGate";
import {apiError} from "./apiErrors";

export default function ModuleReports({peru, dias, fuente}:{peru:boolean; dias:string; fuente:string}) {
  const token = useContext(TokenContext);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  async function download(kind:string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const query = new URLSearchParams({tipo:kind,peru:String(peru),dias,...(fuente ? {fuente} : {})});
      const response = await fetch(`/api/v1/reports/modules.csv?${query}`,{headers:{Authorization:`Bearer ${token}`}});
      if (!response.ok) throw Error(await apiError(response,"No se pudo generar el reporte del módulo"));
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href=url; anchor.download=`SISMOIA_${kind}.csv`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url),1000);
      setMessage(response.headers.get("X-Export-Truncated") === "true" ? "Reporte generado: limitado a 10 000 filas." : "Reporte generado y operación auditada.");
    } catch(e) { setError(e instanceof Error ? e.message : "No se pudo descargar"); }
    finally {setBusy(false);}
  }
  return <article className="prep-card"><h3>Reportes por módulo</h3>
    <p>Usan el periodo, ámbito y fuente seleccionados arriba. Calidad resume el catálogo; modelos incluye experimentos y versiones de zonas creados en el periodo; alertas consulta los eventos del periodo.</p>
    <div className="ops-export">{[["calidad","Calidad de datos"],["modelos","Modelos y versiones"],["alertas","Alertas internas"]].map(([kind,label]) =>
      <button key={kind} disabled={busy} onClick={() => void download(kind)}>{label} · CSV</button>)}</div>
    {message && <p role="status">{message}</p>}{error && <p className="prep-error" role="alert">{error}</p>}
  </article>;
}
