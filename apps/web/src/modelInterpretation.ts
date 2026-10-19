export type RegressionMetric = {modelo:string; mae?:number; rmse?:number; r2?:number};

export const validMetric = (value:unknown):value is number => typeof value === "number" && Number.isFinite(value);
export const readableNumber = (value:number) => value.toLocaleString("es-PE", value !== 0 && Math.abs(value) < 0.001
  ? {maximumSignificantDigits:3} : {maximumFractionDigits:3});

export function targetUnit(target:string) {
  if (target === "magnitud") return "unidades de magnitud";
  if (target === "profundidad_km") return "km de profundidad";
  return `unidades de ${target}`;
}

export function baselineReading(metric:RegressionMetric, comparison:RegressionMetric[]) {
  const baseline = comparison.find(row => /referencia|baseline/i.test(row.modelo));
  if (!baseline || baseline.modelo === metric.modelo || !validMetric(baseline.mae) || !validMetric(metric.mae)) return null;
  if (baseline.mae < 0 || metric.mae < 0) return null;
  const difference = baseline.mae-metric.mae;
  if (difference === 0) return `En esta evaluación tiene el mismo error promedio que «${baseline.modelo}». No muestra una mejora en MAE.`;
  if (baseline.mae === 0) return `La referencia no tuvo error promedio en esta evaluación; este modelo sí. Revisa la comparación antes de elegirlo.`;
  const percentage = readableNumber(Math.abs(difference)/baseline.mae*100);
  return difference > 0
    ? `Su error promedio es ${percentage}% menor que el de «${baseline.modelo}» en estos mismos datos. Es una mejora en MAE, no un porcentaje de aciertos.`
    : `Su error promedio es ${percentage}% mayor que el de «${baseline.modelo}» en estos mismos datos. En MAE, usar esa referencia sencilla dio mejor resultado.`;
}

export function r2Reading(value:number) {
  if (value < 0) return "En esta evaluación, su error cuadrático fue mayor que el de usar siempre la media del conjunto evaluado. Conviene revisar las variables antes de usarlo.";
  if (value === 0) return "Su error cuadrático iguala al de usar siempre la media del conjunto evaluado.";
  return "Cuanto más cerca de 1, menor error cuadrático frente a usar la media del conjunto evaluado. Este valor no es un porcentaje de aciertos ni garantiza el resultado de un caso individual.";
}
