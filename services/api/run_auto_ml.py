"""Proceso autonomo para un programador de tareas."""

import json
import os

from fastapi import HTTPException
from app.governance import ejecutar_auto_ml


def main():
    if os.getenv(
        "SISMOIA_AUTO_ML_ENABLED",
        "false"
    ).lower() != "true":
        print("AUTO_ML=INACTIVO")
        return 0

    try:
        resultado = ejecutar_auto_ml({"id": None})

    except HTTPException as error:
        if error.status_code == 422:
            print(json.dumps({
                "estado": "esperando_datos",
                "detalle": str(error.detail)
            }, ensure_ascii=False))
            return 0

        raise

    print(json.dumps({
        "estado": resultado["estado"],
        "nuevos_entrenamientos":
            resultado["entrenamientos_nuevos"],
        "dataset_id": resultado["dataset_id"],
        "aprobacion_automatica": False
    }, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
