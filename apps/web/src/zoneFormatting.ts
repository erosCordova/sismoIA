export const percent = (n:number|null|undefined) => n == null ? "Sin datos" : `${(n*100).toLocaleString("es-PE", {maximumFractionDigits:2})}%`;
export const zoneDate = (value:string) => new Date(value).toLocaleString("es-PE", {timeZone:"America/Lima", dateStyle:"short", timeStyle:"short"});
