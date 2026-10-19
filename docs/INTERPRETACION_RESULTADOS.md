# Resultados comprensibles en Modelos ML

La interfaz debe explicar qué se calculó, qué significa el valor para el usuario y cómo puede utilizarlo. Mostrar una métrica sin contexto no basta. Este criterio debe mantenerse al añadir nuevos resultados.

## Lectura incorporada

- **Modelos → experimentos:** el resultado seleccionado incluye una explicación del error en la unidad de la variable objetivo, comparación con la referencia disponible y lectura de R². En clasificación, la matriz se traduce a cantidades de eventos bien y mal clasificados.
- **Probar un modelo:** el valor estimado se presenta en una frase con su objetivo y unidad. La probabilidad de clase se distingue de la ocurrencia futura de un sismo.
- **Análisis → agrupamientos:** se explica qué representa cada grupo/color, qué significa una barra alta, qué son los registros sin grupo de DBSCAN y cómo leer silhouette y cobertura.
- **Análisis → comparación y laboratorio simple/múltiple:** el selector «Entender el resultado de» permite consultar la interpretación de cada regresor. La gráfica identifica el modelo al que corresponde; cambiar la lectura de la tabla no cambia los datos de esa gráfica.
- **Exploración por zonas:** la celda seleccionada explica conteo, porcentaje, horizonte e incertidumbre, así como el estado de muestra insuficiente.

## Criterios de interpretación

MAE es una diferencia promedio en magnitud o profundidad, según el objetivo; no es una cota garantizada para un evento. R² no es exactitud porcentual y puede ser negativo. El porcentaje de mejora de MAE compara errores sobre la misma evaluación; no es porcentaje de aciertos. La referencia de la tabla aprende su constante con entrenamiento y no debe confundirse con la media de evaluación utilizada por R².

Precisión y recall usan denominadores diferentes. La interfaz muestra sus conteos e identifica casos donde el clasificador marca todo como positivo o deja sin identificar todos los positivos reales. Un recall del 100% aislado no demuestra que el clasificador distinga las dos clases. Si falta una clase, se explica lo que la muestra no permite comprobar.

Los grupos no ordenan peligrosidad. «Ruido» no significa dato falso. Las tasas del catálogo y el cálculo Poisson no autorizan a declarar un lugar seguro o anticipar con certeza un terremoto. La aprobación administrativa tampoco valida científicamente el método.

## Verificación de esta mejora

Se comprobaron compilación TypeScript/Vite, lint y renderizado de las explicaciones con MAE en kilómetros, referencia mejor/peor/igual/cero, R² negativo/cero, matriz binaria y clases ausentes. En navegador se ejecutaron la comparación y el laboratorio supervisado sin guardar modelos ni modificar eventos; se verificaron las explicaciones con resultados reales, el selector simple/múltiple y las definiciones desplegables. Se ajustó el contraste del panel tras inspeccionar una captura. No se modificó la lógica de entrenamiento ni la base de datos.
