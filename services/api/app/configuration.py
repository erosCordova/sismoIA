"""Supabase es el entorno principal; la base local requiere seleccion explicita."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TARGET = os.getenv("SISMOIA_TARGET", "supabase").lower()
if TARGET not in ("supabase", "local"):
    raise RuntimeError("SISMOIA_TARGET debe ser supabase o local")
ENV_FILE = ROOT / (".env.local" if TARGET == "local" else ".env.supabase" if (ROOT / ".env.supabase").is_file() else ".env")
