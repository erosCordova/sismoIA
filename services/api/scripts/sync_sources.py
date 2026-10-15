import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.igp import sincronizar_todas

def main():
    resultado = sincronizar_todas({"roles": ["Administrador"]})
    for nombre, datos in resultado["fuentes"].items():
        print(f"{nombre}: recibidos={datos.get("recibidos")}, nuevos={datos.get("importados")}")
    print("SINCRONIZACION_CONJUNTA=OK")

if __name__ == "__main__":
    main()
