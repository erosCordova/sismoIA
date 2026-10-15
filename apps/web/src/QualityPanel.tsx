import { useContext, useState } from "react";
import { SearchCheck } from "lucide-react";
import { TokenContext } from "./AuthGate";

type Par = { usgs_id: string; igp_id: string; distancia_km: number; diferencia_segundos: number; magnitud_usgs: number; magnitud_igp: number };
type Resultado = { coincidencias_probables: number; ventana_dias: number; analisis_parcial: boolean; muestra: Par[] };

export default function QualityPanel() {
  const token = useContext(TokenContext);
  const [datos, setDatos] = useState<Resultado | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  async function analizar() {
    if (!token) return;
    setCargando(true); setError("");
    try {
      const respuesta = await fetch("/api/v1/seismic/quality/possible-duplicates?limite=10", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!respuesta.ok) throw new Error(`Error HTTP ${respuesta.status}`);
      setDatos(await respuesta.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar");
    } finally { setCargando(false); }
  }
  return <section className="seismic-quality">
    <h3><SearchCheck size={20}/> Calidad y coincidencias entre fuentes</h3>
    <p>Detecta eventos de USGS e IGP que podrían corresponder al mismo terremoto.</p>
    <button disabled={cargando} onClick={() => void analizar()}>
      {cargando ? "Analizando..." : "Analizar coincidencias"}
    </button>
    {error && <p role="alert">{error}</p>}
    {datos && <div>
      <strong>{datos.coincidencias_probables} coincidencias probables</strong>
      <p>Periodo examinado: {datos.ventana_dias} días. {datos.analisis_parcial ? "Análisis parcial." : "Análisis completado dentro de los criterios establecidos."}</p>
      {datos.muestra.length > 0 && <div className="seismic-scroll"><table>
        <thead><tr><th>Magnitud USGS</th><th>Magnitud IGP</th><th>Distancia</th><th>Diferencia horaria</th></tr></thead>
        <tbody>{datos.muestra.map(p => <tr key={`${p.usgs_id}-${p.igp_id}`}>
          <td>{p.magnitud_usgs}</td><td>{p.magnitud_igp}</td>
          <td>{p.distancia_km} km</td><td>{p.diferencia_segundos} s</td>
        </tr>)}</tbody>
      </table></div>}
      <p>Estas coincidencias son aproximadas y requieren revisión. Ningún registro se elimina automáticamente.</p>
    </div>}
  </section>;
}
