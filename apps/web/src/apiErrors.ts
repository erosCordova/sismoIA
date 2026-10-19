export async function apiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((item: {loc?: string[]; msg?: string}) =>
        `${item.loc?.slice(1).join(" / ") || "Datos"}: ${item.msg || "valor inválido"}`
      ).join(". ");
    }
  } catch { /* Una respuesta del proxy puede no contener JSON. */ }
  if (response.status === 401) return "La sesión venció. Vuelve a iniciar sesión.";
  if (response.status === 403) return "Tu rol no tiene permiso para esta acción.";
  if (response.status >= 500) return `${fallback}. El servicio no está disponible; comprueba el backend y la conexión.`;
  return `${fallback} (HTTP ${response.status}).`;
}
