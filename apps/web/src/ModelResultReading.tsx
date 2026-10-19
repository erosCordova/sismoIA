import {useId, useState} from "react";
import {baselineReading, readableNumber as n, r2Reading, targetUnit, validMetric, type RegressionMetric} from "./modelInterpretation";
import "./model-result-reading.css";

export function RegressionReading({metric, comparison, target="magnitud"}:{metric:RegressionMetric; comparison:RegressionMetric[]; target?:string}) {
  const reference = baselineReading(metric, comparison);
  return <section className="result-reading" aria-label={`Interpretación de ${metric.modelo}`}>
    <h4>Qué significa este resultado</h4>
    <p className="result-reading-context">{metric.modelo} · Evaluación con eventos históricos</p>
    <p>{validMetric(metric.mae) && metric.mae >= 0
      ? <>Al estimar {target === "profundidad_km" ? "la profundidad" : target === "magnitud" ? "la magnitud" : target}, el modelo se equivocó en promedio <strong>{n(metric.mae)} {targetUnit(target)}</strong>. El error de cada evento puede ser menor o mayor.</>
      : "No hay un error promedio válido disponible para interpretar esta evaluación."}</p>
    {reference && <p>{reference}</p>}
    {validMetric(metric.r2) && <p><strong>R² = {n(metric.r2)}.</strong> {r2Reading(metric.r2)}</p>}
    <p><strong>Cómo usarlo:</strong> compara modelos sobre la misma muestra y revisa si el error es aceptable para el análisis que necesitas. Estos resultados evalúan atributos de eventos ya registrados.</p>
    <details><summary>Cómo leer las métricas y la gráfica</summary>
      <dl>
        <dt>MAE · Error promedio</dt><dd>Promedio de las diferencias absolutas entre valor real y estimado, en la unidad de la variable objetivo. Menor es mejor; no es un margen garantizado para cada evento.</dd>
        <dt>RMSE · Peso de los errores grandes</dt><dd>También se expresa en {targetUnit(target)}. Si es bastante mayor que el MAE, revisa los eventos con diferencias grandes.</dd>
        <dt>R² · Comparación con una media constante</dt><dd>1 indica coincidencia perfecta en la muestra; 0 iguala la referencia de la media del conjunto evaluado; puede ser negativo si resulta peor.</dd>
        <dt>Mejora de MAE y R² negativo</dt><dd>Pueden aparecer juntos: MAE y R² miden el error de formas distintas. Además, la referencia de la tabla usa la media aprendida en entrenamiento; R² compara con la media del conjunto evaluado. Una pequeña mejora frente a la tabla puede coexistir con un ajuste R² bajo.</dd>
        <dt>Real frente a estimado</dt><dd>Si las líneas están cerca, la diferencia es pequeña en esos registros; si se separan, el error aumenta. La gráfica es una muestra: las métricas resumen todos los registros evaluados.</dd>
        <dt>Entrenamiento y evaluación</dt><dd>Unos registros se usan para aprender y otros posteriores para comprobar el resultado. Un modelo seleccionado en desarrollo puede rendir peor en la evaluación final.</dd>
      </dl>
    </details>
  </section>;
}

export function RegressionResultsReading({comparison, target="magnitud"}:{comparison:RegressionMetric[]; target?:string}) {
  const [selected, setSelected] = useState("");
  const id = useId();
  const metric = comparison.find(row => row.modelo === selected) ?? comparison.find(row => !/referencia|baseline/i.test(row.modelo)) ?? comparison[0];
  if (!metric) return null;
  return <div className="result-reading-picker">
    <label htmlFor={id}>Entender el resultado de</label>
    <select id={id} value={metric.modelo} onChange={event => setSelected(event.target.value)}>
      {comparison.map(row => <option key={row.modelo} value={row.modelo}>{row.modelo}</option>)}
    </select>
    <RegressionReading metric={metric} comparison={comparison} target={target}/>
  </div>;
}

type ClassificationMetric = {modelo:string; precision?:number; recall?:number; f1?:number; matriz?:number[][]};
export function ClassificationReading({metric}:{metric:ClassificationMetric}) {
  const matrix = metric.matriz;
  const hasMatrix = matrix?.length === 2 && matrix.every(row => row.length === 2 && row.every(value => Number.isInteger(value) && value >= 0));
  const tn = hasMatrix ? matrix[0][0] : 0, fp = hasMatrix ? matrix[0][1] : 0;
  const fn = hasMatrix ? matrix[1][0] : 0, tp = hasMatrix ? matrix[1][1] : 0;
  const total = tn+fp+fn+tp;
  const predicted = tp+fp, actual = tp+fn;
  return <section className="result-reading" aria-label={`Interpretación de ${metric.modelo}`}>
    <h4>Qué significa esta clasificación</h4>
    <p className="result-reading-context">{metric.modelo} · Distingue magnitudes menores a 4 y magnitudes de 4 o más</p>
    {hasMatrix && total > 0 ? <>
      <p>En los <strong>{n(total)} eventos evaluados</strong>, clasificó correctamente {n(tn+tp)}. Marcó {n(fp)} eventos de magnitud menor a 4 como si fueran de 4 o más y dejó {n(fn)} eventos de 4 o más en la clase menor.</p>
      <div className="result-reading-counts">
        <p><strong>{n(tp)}</strong> M ≥ 4 clasificados correctamente</p>
        <p><strong>{n(fn)}</strong> M ≥ 4 que no identificó</p>
        <p><strong>{n(fp)}</strong> M &lt; 4 clasificados como M ≥ 4</p>
        <p><strong>{n(tn)}</strong> M &lt; 4 clasificados correctamente</p>
      </div>
      {predicted === total && actual > 0 && actual < total && <p><strong>Lectura clave:</strong> marcó todos los registros como M ≥ 4. Por eso obtiene recall del 100%, pero no distingue los eventos menores a 4 en esta muestra. Ese 100% por sí solo no indica un buen clasificador.</p>}
      {predicted === 0 && actual > 0 && <p><strong>Lectura clave:</strong> dejó sin identificar todos los eventos M ≥ 4 de esta evaluación. Revisa las variables y compáralo con la referencia antes de usarlo.</p>}
      <p>{predicted > 0 ? `De ${n(predicted)} eventos que marcó como M ≥ 4, ${n(tp)} realmente pertenecían a esa clase (precisión: ${n(tp/predicted*100)}%).` : "No marcó ningún evento como M ≥ 4; no hay positivos estimados con los que interpretar la precisión."}</p>
      <p>{actual > 0 ? `De ${n(actual)} eventos realmente M ≥ 4, identificó ${n(tp)} (recall: ${n(tp/actual*100)}%).` : "La evaluación no contiene eventos M ≥ 4; esta muestra no permite comprobar cómo reconoce esa clase."}</p>
    </> : <p>No hay una matriz de evaluación válida con eventos para traducir los errores a cantidades. Revisa la muestra y las métricas disponibles.</p>}
    <p><strong>Cómo usarlo:</strong> revisa tanto los eventos que deja sin identificar como los que clasifica de más; compara con la referencia de clase mayoritaria. Clasifica registros existentes, sin indicar cuándo ocurrirá otro sismo.</p>
    <details><summary>Precisión, recall y F1 en palabras simples</summary>
      <p>Precisión: entre los marcados como M ≥ 4, cuántos realmente lo eran. Recall: entre todos los M ≥ 4 reales, cuántos identificó. F1 resume ambas métricas en una escala de 0 a 1; no es un porcentaje de aciertos. Con clases muy desiguales, el total de aciertos puede ocultar que el modelo ignora una de ellas.</p>
    </details>
  </section>;
}
