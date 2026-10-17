import { useEffect, useState } from "react";
import { MapContainer, Polygon, Popup, TileLayer } from "react-leaflet";

type Zona = {
  id: string;
  lat_min: number;
  lat_max: number;
  lon_min: number;
  lon_max: number;
  p7: number;
  p30: number;
  eventos: number;
};

type Modelo = {
  fuente: string;
  umbral: number;
  corte: string;
  eventos_total: number;
  zonas: Zona[];
  prueba: {
    brier7: number;
    brier30: number;
  };
};

function color(p: number) {
  if (p >= 0.75) return "#dc6351";
  if (p >= 0.45) return "#eea348";
  if (p >= 0.20) return "#f2d17a";
  return "#3db8ca";
}

export default function GlobalForecastMap() {
  const [dias, setDias] = useState<7 | 30>(7);
  const [datos, setDatos] = useState<Modelo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();

    fetch("/global-forecast.json", { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error("No se encontraron datos globales");
        return (await r.json()) as Modelo;
      })
      .then((m) => {
        if (!ctrl.signal.aborted) setDatos(m);
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) {
          setError(
            e instanceof Error ? e.message : "Error al cargar el mapa"
          );
        }
      });

    return () => ctrl.abort();
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (!datos) return <p>Cargando probabilidades mundiales…</p>;

  return (
    <section
      aria-label="Estimaciones probabilísticas mundiales"
      style={{ width: "100%" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12
        }}
      >
        <div>
          <strong>
            Pronóstico mundial por zonas · M ≥ {datos.umbral}
          </strong>
          <p style={{ margin: "4px 0", fontSize: 12, opacity: 0.8 }}>
            Modelo estadístico experimental · USGS · Histórico hasta {datos.corte}
          </p>
        </div>

        <div
          role="group"
          aria-label="Ventana de pronóstico"
          style={{ display: "flex", gap: 6 }}
        >
          <button
            type="button"
            aria-pressed={dias === 7}
            onClick={() => setDias(7)}
            style={{
              padding: "9px 14px",
              background: dias === 7 ? "#087da5" : "#edf5f9",
              color: dias === 7 ? "white" : "#12445e",
              border: 0,
              borderRadius: 8
            }}
          >
            7 días
          </button>
          <button
            type="button"
            aria-pressed={dias === 30}
            onClick={() => setDias(30)}
            style={{
              padding: "9px 14px",
              background: dias === 30 ? "#087da5" : "#edf5f9",
              color: dias === 30 ? "white" : "#12445e",
              border: 0,
              borderRadius: 8
            }}
          >
            30 días
          </button>
        </div>
      </div>

      <div
        style={{
          height: 470,
          overflow: "hidden",
          borderRadius: 12,
          border: "1px solid #dbe8ee"
        }}
      >
        <MapContainer
          center={[15, 0]}
          zoom={2}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {datos.zonas.map((z) => {
            const p = dias === 7 ? z.p7 : z.p30;

            const posiciones: [number, number][] = [
              [Math.max(-85, z.lat_min), z.lon_min],
              [Math.max(-85, z.lat_min), z.lon_max],
              [Math.min(85, z.lat_max), z.lon_max],
              [Math.min(85, z.lat_max), z.lon_min]
            ];

            return (
              <Polygon
                key={z.id}
                positions={posiciones}
                pathOptions={{
                  color: "#ffffff",
                  weight: 0.5,
                  fillColor: color(p),
                  fillOpacity: 0.47
                }}
              >
                <Popup>
                  <strong>Zona {z.id}</strong>
                  <p>
                    Probabilidad estimada de al menos un sismo
                    M ≥ {datos.umbral} en {dias} días:
                    {" "}<strong>{(p * 100).toFixed(1)}%</strong>
                  </p>
                  <small>
                    Eventos históricos de la zona: {z.eventos}
                  </small>
                </Popup>
              </Polygon>
            );
          })}
        </MapContainer>
      </div>

      <p style={{ margin: "10px 0 4px", fontSize: 12 }}>
        <span style={{ color: "#3db8ca" }}>●</span> 0–19% ·
        <span style={{ color: "#c9a337" }}> ●</span> 20–44% ·
        <span style={{ color: "#eea348" }}> ●</span> 45–74% ·
        <span style={{ color: "#dc6351" }}> ●</span> ≥75%
      </p>

      <p style={{ fontSize: 12, opacity: 0.8, margin: "5px 0" }}>
        {datos.eventos_total.toLocaleString("es-PE")} eventos históricos ·
        Evaluación de prueba 2025, Brier ({dias} días):
        {" "}{(
          dias === 7 ? datos.prueba.brier7 : datos.prueba.brier30
        ).toFixed(4)}
      </p>

      <p style={{ fontSize: 12, opacity: 0.75, margin: "4px 0" }}>
        Probabilidades estadísticas basadas en tasas históricas.
        No predicen la fecha, el epicentro ni la magnitud exacta
        de futuros terremotos. No son alertas oficiales.
      </p>
    </section>
  );
}
