import {useEffect, useState} from "react";

type Alerta = {
  id: string;
  magnitud: number;
  lugar: string | null;
};

type Usuario = {
  id: string;
  nombre: string;
  email: string;
};

type Config = {
  habilitado: boolean;
  configurado: boolean;
};

type Previa = {
  destinatario: string;
  asunto: string;
  mensaje: string;
  enviado_previamente: boolean;
};

export default function EmailNotificationsPanel({
  token
}: {
  token: string;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [alerta, setAlerta] = useState("");
  const [destino, setDestino] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function llamar(ruta: string, body?: object) {
    const r = await fetch(
      `/api/v1/email-notifications${ruta}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        ...(body ? {body: JSON.stringify(body)} : {})
      }
    );

    const datos = await r.json();

    if (!r.ok) {
      throw Error(
        typeof datos.detail === "string"
          ? datos.detail
          : `Error HTTP ${r.status}`
      );
    }

    return datos;
  }

  useEffect(() => {
    let activo = true;

    Promise.all([
      llamar("/config"),
      llamar("/approved"),
      llamar("/recipients")
    ]).then(([c, a, u]) => {
      if (!activo) return;
      setConfig(c);
      setAlertas(a.alertas);
      setUsuarios(u.usuarios);
    }).catch(e => {
      if (activo) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });

    return () => {
      activo = false;
    };
  }, [token]);

  async function previsualizar() {
    setOcupado(true);
    setError("");
    setMensaje("");
    setPrevia(null);

    try {
      const resultado = await llamar("/preview", {
        alert_id: alerta,
        recipient_user_id: destino
      });

      setPrevia(resultado);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(false);
    }
  }

  async function enviar() {
    if (!previa || !config?.habilitado ||
        !config.configurado) return;

    if (!window.confirm(
      "¿Confirmas enviar este correo informativo al destinatario?"
    )) return;

    setOcupado(true);
    setError("");

    try {
      await llamar("/send", {
        alert_id: alerta,
        recipient_user_id: destino
      });

      setMensaje("Correo enviado y registrado en auditoría.");
      setPrevia(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <article className="prep-card">
      <h3>Notificaciones por correo</h3>
      <p>
        Envío manual de información sobre sismos registrados
        y alertas previamente aprobadas.
        No constituye una alerta oficial.
      </p>

      <p>
        Estado SMTP:{" "}
        <strong>
          {config == null
            ? "Consultando..."
            : config.habilitado && config.configurado
              ? "Habilitado"
              : "Desactivado o sin configurar"}
        </strong>
      </p>

      <div className="alrt-form">
        <label>
          Alerta aprobada
          <select
            value={alerta}
            onChange={e => {
              setAlerta(e.target.value);
              setPrevia(null);
            }}
          >
            <option value="">Selecciona una alerta</option>
            {alertas.map(a => (
              <option value={a.id} key={a.id}>
                M{a.magnitud} — {a.lugar || "Sin ubicación"}
              </option>
            ))}
          </select>
        </label>

        <label>
          Usuario destinatario
          <select
            value={destino}
            onChange={e => {
              setDestino(e.target.value);
              setPrevia(null);
            }}
          >
            <option value="">Selecciona un usuario</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>
                {u.nombre} ({u.email})
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!alerta || !destino || ocupado}
          onClick={() => void previsualizar()}
        >
          Ver vista previa
        </button>
      </div>

      {previa && (
        <div className="prep-card">
          <h4>Vista previa del correo</h4>
          <p><strong>Para:</strong> {previa.destinatario}</p>
          <p><strong>Asunto:</strong> {previa.asunto}</p>
          <pre style={{
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere"
          }}>{previa.mensaje}</pre>

          {previa.enviado_previamente && (
            <p>Este destinatario ya tiene un envío registrado.</p>
          )}

          <button
            type="button"
            disabled={
              ocupado ||
              !config?.habilitado ||
              !config.configurado ||
              previa.enviado_previamente
            }
            onClick={() => void enviar()}
          >
            Confirmar envío de correo
          </button>
        </div>
      )}

      {mensaje && <p role="status">{mensaje}</p>}
      {error && <p role="alert">{error}</p>}

      {alertas.length === 0 && (
        <p>No hay alertas aprobadas para notificar.</p>
      )}
    </article>
  );
}
