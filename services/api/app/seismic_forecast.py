
from datetime import date, datetime, timedelta, timezone
from math import exp
from uuid import UUID

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss
from sqlalchemy import MetaData, Table, select

from app.database import engine


INICIO = date(2010, 1, 1)
FIN_ENTRENAMIENTO = date(2024, 1, 1)
FIN_VALIDACION = date(2025, 1, 1)
FIN_PRUEBA = date(2026, 1, 1)

FUENTE_HISTORICA = UUID(
    "5cdc88cd-fc4a-4686-ab9a-0df32cda60dc"
)

UMBRALES = (7, 30)
ZONAS = 12


def cargar_historial():
    tabla = Table(
        "seismic_events",
        MetaData(),
        autoload_with=engine
    )

    consulta = (
        select(
            tabla.c.occurred_at,
            tabla.c.latitude,
            tabla.c.longitude
        )
        .where(
            tabla.c.source_id == FUENTE_HISTORICA,
            tabla.c.magnitude >= 4.0,
            tabla.c.latitude.between(-19.0, 1.0),
            tabla.c.longitude.between(-83.5, -68.0)
        )
        .order_by(tabla.c.occurred_at)
    )

    with engine.connect() as conexion:
        conexion.exec_driver_sql(
            "SET TRANSACTION READ ONLY"
        )
        registros = conexion.execute(consulta).all()
        conexion.rollback()

    if not registros:
        raise RuntimeError(
            "No hay registros historicos suficientes"
        )

    ultima_fecha = max(r[0] for r in registros)
    ultimo_dia = ultima_fecha.date()

    total_dias = (ultimo_dia - INICIO).days + 1

    conteos = np.zeros(
        (ZONAS, total_dias),
        dtype=np.int32
    )

    for fecha_evento, latitud, longitud in registros:
        dia = fecha_evento.date()
        indice_dia = (dia - INICIO).days

        if not (0 <= indice_dia < total_dias):
            continue

        fila = min(
            3, max(0, int((float(latitud) + 19) / 5))
        )

        columna = min(
            2,
            max(
                0,
                int(
                    (float(longitud) + 83.5)
                    / (15.5 / 3)
                )
            )
        )

        zona = fila * 3 + columna
        conteos[zona, indice_dia] += 1

    acumulado = np.pad(
        np.cumsum(conteos, axis=1),
        ((0, 0), (1, 0))
    )

    return (
        conteos,
        acumulado,
        ultima_fecha,
        len(registros)
    )


def ejemplos(acumulado, desde, hasta, horizonte):
    x, y, zonas = [], [], []

    dia = max(
        desde,
        INICIO + timedelta(days=365)
    )

    limite_datos = (
        INICIO
        + timedelta(days=acumulado.shape[1] - 1)
    )

    fin = min(hasta, limite_datos)

    while dia + timedelta(days=horizonte) <= fin:
        indice = (dia - INICIO).days

        for zona in range(ZONAS):
            recientes = [
                int(
                    acumulado[zona, indice]
                    - acumulado[zona, indice - plazo]
                )
                for plazo in (7, 30, 90, 365)
            ]

            variables = [
                float(np.log1p(n))
                for n in recientes
            ]

            variables.extend(
                1.0 if z == zona else 0.0
                for z in range(ZONAS)
            )

            futuros = (
                acumulado[zona, indice + horizonte]
                - acumulado[zona, indice]
            )

            x.append(variables)
            y.append(int(futuros > 0))
            zonas.append(zona)

        # Ventanas sin solapamiento para la evaluacion.
        dia += timedelta(days=horizonte)

    return (
        np.asarray(x, dtype=float),
        np.asarray(y, dtype=int),
        np.asarray(zonas, dtype=int)
    )


def referencia(conteos, zonas, horizonte):
    dias = (FIN_ENTRENAMIENTO - INICIO).days

    eventos = conteos[:, :dias].sum(axis=1)
    tasa_global = float(eventos.sum()) / (dias * ZONAS)

    # Suavizado para zonas con pocos registros.
    tasas = (
        eventos + tasa_global * 180
    ) / (dias + 180)

    return np.asarray([
        1.0 - exp(-float(tasas[z]) * horizonte)
        for z in zonas
    ])


def evaluar_horizonte(conteos, acumulado, horizonte):
    x_train, y_train, _ = ejemplos(
        acumulado,
        date(2011, 1, 1),
        FIN_ENTRENAMIENTO,
        horizonte
    )

    x_val, y_val, zonas_val = ejemplos(
        acumulado,
        FIN_ENTRENAMIENTO,
        FIN_VALIDACION,
        horizonte
    )

    x_test, y_test, zonas_test = ejemplos(
        acumulado,
        FIN_VALIDACION,
        FIN_PRUEBA,
        horizonte
    )

    if (
        len(y_train) == 0
        or len(y_val) == 0
        or len(y_test) == 0
        or len(np.unique(y_train)) < 2
    ):
        raise RuntimeError(
            "Datos insuficientes para evaluar "
            f"{horizonte} dias"
        )

    modelo = LogisticRegression(
        max_iter=600,
        C=0.5
    )

    modelo.fit(x_train, y_train)

    ml_val = modelo.predict_proba(x_val)[:, 1]
    base_val = referencia(
        conteos, zonas_val, horizonte
    )

    ml_test = modelo.predict_proba(x_test)[:, 1]
    base_test = referencia(
        conteos, zonas_test, horizonte
    )

    brier_ml_val = brier_score_loss(
        y_val, ml_val
    )

    brier_base_val = brier_score_loss(
        y_val, base_val
    )

    usar_ml = brier_ml_val < brier_base_val

    # Seleccion por validacion; 2025 queda como prueba.
    elegido_test = (
        ml_test if usar_ml else base_test
    )

    brier_elegido = brier_score_loss(
        y_test, elegido_test
    )

    brier_base_test = brier_score_loss(
        y_test, base_test
    )

    print(f"\n===== PRONOSTICO {horizonte} DIAS =====")
    print("UMBRAL_MAGNITUD=4.0")
    print("EJEMPLOS_ENTRENAMIENTO=", len(y_train))
    print("EJEMPLOS_VALIDACION_2024=", len(y_val))
    print("EJEMPLOS_PRUEBA_2025=", len(y_test))

    print("BRIER_ML_2024=", round(brier_ml_val, 5))
    print("BRIER_BASE_2024=", round(brier_base_val, 5))
    print("METODO_ELEGIDO=", (
        "ML_LOGISTICO" if usar_ml
        else "REFERENCIA_ESTADISTICA"
    ))

    print(
        "BRIER_ELEGIDO_2025=",
        round(brier_elegido, 5)
    )
    print(
        "BRIER_BASE_2025=",
        round(brier_base_test, 5)
    )

    print(
        "MEJORA_FRENTE_BASE_2025=",
        "SI" if brier_elegido < brier_base_test
        else "NO"
    )

    print(
        "FRECUENCIA_REAL_2025=",
        round(float(y_test.mean()), 5)
    )


def main():
    print("===== SISMOIA - MOTOR PREDICTIVO EXPERIMENTAL =====")

    conteos, acumulado, ultima, registros = (
        cargar_historial()
    )

    antiguedad_horas = (
        datetime.now(timezone.utc) - ultima
    ).total_seconds() / 3600

    print("FUENTE=HISTORICA_UNICA")
    print("EVENTOS_M4=", registros)
    print("ZONAS_GEOGRAFICAS=", ZONAS)
    print("REGION=PERU_Y_ENTORNO_RECTANGULAR")
    print("ULTIMO_EVENTO_FUENTE=", ultima)
    print(
        "ANTIGUEDAD_HORAS=",
        round(antiguedad_horas, 1)
    )

    for horizonte in UMBRALES:
        evaluar_horizonte(
            conteos, acumulado, horizonte
        )

    print("\n===== SEGURIDAD DEL PRONOSTICO =====")

    if antiguedad_horas > 24:
        print("DATOS_RECIENTES=DESACTUALIZADOS")
        print("PRONOSTICO_EN_VIVO=NO_HABILITADO")
    else:
        print("DATOS_RECIENTES=EN_PLAZO")
        print("PRONOSTICO_EN_VIVO=PENDIENTE_API")

    print("EPICENTRO_EXACTO=NO_PREDECIBLE")
    print("INTENSIDAD_LOCAL=MODELO_PENDIENTE")
    print("BASE_DATOS_MODIFICADA=NO")


if __name__ == "__main__":
    main()
