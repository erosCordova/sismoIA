
"""Pronostico experimental por zonas; solo lectura."""

from datetime import datetime, timezone
from math import exp

import numpy as np
from sklearn.metrics import brier_score_loss

from app.seismic_forecast import (
    cargar_historial,
    ejemplos,
    referencia,
    INICIO,
    FIN_ENTRENAMIENTO,
    FIN_PRUEBA,
    ZONAS,
)


def generar_pronostico():
    conteos, acumulado, ultima, registros = cargar_historial()

    ahora = datetime.now(timezone.utc)
    antiguedad = max(
        0.0,
        (ahora - ultima).total_seconds() / 3600
    )

    # Cuadricula geografica preliminar.
    # Aun no equivale a limites administrativos de Peru.
    lat_min, lat_max = -19.0, 1.0
    lon_min, lon_max = -83.5, -68.0

    filas = 4
    columnas = 3

    if filas * columnas != ZONAS:
        raise RuntimeError("Cantidad de zonas incompatible")

    dias_entrenamiento = (
        FIN_ENTRENAMIENTO - INICIO
    ).days

    eventos_entrenamiento = conteos[
        :, :dias_entrenamiento
    ].sum(axis=1)

    zonas = []

    for fila in range(filas):
        for columna in range(columnas):
            numero = fila * columnas + columna

            latitud_sur = (
                lat_min
                + fila * (lat_max - lat_min) / filas
            )
            latitud_norte = (
                lat_min
                + (fila + 1) * (lat_max - lat_min) / filas
            )

            longitud_oeste = (
                lon_min
                + columna * (lon_max - lon_min) / columnas
            )
            longitud_este = (
                lon_min
                + (columna + 1) * (lon_max - lon_min) / columnas
            )

            zonas.append({
                "id": f"Z{numero + 1:02d}",
                "latitud_sur": round(latitud_sur, 4),
                "latitud_norte": round(latitud_norte, 4),
                "longitud_oeste": round(longitud_oeste, 4),
                "longitud_este": round(longitud_este, 4),
                "eventos_entrenamiento": int(
                    eventos_entrenamiento[numero]
                ),
            })

    evaluaciones = {}

    for horizonte in (7, 30):
        indices = np.arange(ZONAS, dtype=int)

        probabilidades = referencia(
            conteos, indices, horizonte
        )

        for indice, probabilidad in enumerate(probabilidades):
            zonas[indice][f"probabilidad_{horizonte}d"] = (
                round(float(probabilidad), 6)
            )

        _, observados, zonas_prueba = ejemplos(
            acumulado,
            FIN_PRUEBA.replace(year=2025),
            FIN_PRUEBA,
            horizonte
        )

        if len(observados) == 0:
            raise RuntimeError(
                "No hay muestras de prueba para "
                f"{horizonte} dias"
            )

        estimados = referencia(
            conteos, zonas_prueba, horizonte
        )

        # Referencia ingenua: una sola probabilidad
        # para toda la region, usando solo entrenamiento.
        tasa_global = (
            float(eventos_entrenamiento.sum())
            / (dias_entrenamiento * ZONAS)
        )

        probabilidad_global = (
            1.0 - exp(-tasa_global * horizonte)
        )

        prediccion_global = np.full(
            len(observados),
            probabilidad_global
        )

        brier_zonas = brier_score_loss(
            observados, estimados
        )

        brier_global = brier_score_loss(
            observados, prediccion_global
        )

        evaluaciones[str(horizonte)] = {
            "muestras_2025": len(observados),
            "frecuencia_observada_2025": round(
                float(observados.mean()), 5
            ),
            "brier_por_zona": round(
                float(brier_zonas), 5
            ),
            "brier_referencia_global": round(
                float(brier_global), 5
            ),
            "mejora_referencia_global": (
                bool(brier_zonas < brier_global)
            )
        }

    return {
        "modelo": "tasa_historica_poisson_por_zona",
        "estado": (
            "DATOS_DESACTUALIZADOS"
            if antiguedad > 24
            else "EXPERIMENTAL"
        ),
        "magnitud_minima": 4.0,
        "horizontes_dias": [7, 30],
        "fuente": "historica_unica",
        "ultimo_evento_utc": ultima.isoformat(),
        "antiguedad_horas": round(antiguedad, 1),
        "registros_historicos": registros,
        "region": "cuadricula_geografica_aproximada",
        "zonas": zonas,
        "evaluacion_retrospectiva_2025": evaluaciones,
        "advertencia": (
            "Probabilidad de al menos un evento registrado "
            "de magnitud 4 o superior en una zona amplia. "
            "No predice fecha, epicentro, intensidad ni danos."
        ),
        "apto_para_alertas_automaticas": False,
    }


def main():
    resultado = generar_pronostico()

    print("===== SISMOIA - PRONOSTICO POR ZONAS =====")
    print("MODELO=", resultado["modelo"])
    print("ESTADO=", resultado["estado"])
    print("EVENTOS=", resultado["registros_historicos"])
    print("ULTIMO_EVENTO=", resultado["ultimo_evento_utc"])
    print("ANTIGUEDAD_HORAS=", resultado["antiguedad_horas"])

    print("\n===== EVALUACION 2025 =====")

    for horizonte, evaluacion in (
        resultado["evaluacion_retrospectiva_2025"].items()
    ):
        print(f"HORIZONTE={horizonte} DIAS")
        print("MUESTRAS=", evaluacion["muestras_2025"])
        print(
            "BRIER_POR_ZONA=",
            evaluacion["brier_por_zona"]
        )
        print(
            "BRIER_GLOBAL=",
            evaluacion["brier_referencia_global"]
        )
        print(
            "MEJORA_GLOBAL=",
            evaluacion["mejora_referencia_global"]
        )

    print("\n===== PROBABILIDADES POR ZONA =====")
    print("ZONA | M4 EN 7 DIAS | M4 EN 30 DIAS")

    for zona in sorted(
        resultado["zonas"],
        key=lambda x: x["probabilidad_7d"],
        reverse=True
    ):
        p7 = 100 * zona["probabilidad_7d"]
        p30 = 100 * zona["probabilidad_30d"]

        print(
            f'{zona["id"]} | {p7:.2f}% | {p30:.2f}%'
        )

    print("\nZONAS=", len(resultado["zonas"]))
    print("PRONOSTICO_EN_VIVO=NO")
    print("ALERTAS_AUTOMATICAS=NO")
    print("MAPA_WEB=PENDIENTE")
    print("BASE_DATOS_MODIFICADA=NO")


if __name__ == "__main__":
    main()
