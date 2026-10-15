# SISMOIA Enterprise

Sistema empresarial de monitoreo y analitica sismica con cobertura mundial y Peru como pais principal.

## Tecnologias
- Frontend: React, TypeScript y Vite.
- Backend: Python y FastAPI.
- Base de datos: PostgreSQL y SQLAlchemy.
- Migraciones: Alembic.
- Infraestructura local: Docker.
- Analitica futura: Pandas, NumPy y Scikit-learn.

## Estructura
- apps/web: interfaz empresarial React.
- services/api/app: backend FastAPI y modelos SQLAlchemy.
- database/migrations: migraciones de PostgreSQL.
- compose.yaml: configuracion de PostgreSQL.
- .github/workflows: integracion continua.

## Requisitos
Windows 11, Git Bash, Node.js 24, Python 3.13 y Docker Desktop.

## Instalacion inicial
Configurar .env a partir de .env.example, sin publicar credenciales.
Frontend: cd apps/web && npm install
Backend: cd services/api && python -m venv .venv
Dependencias: ./.venv/Scripts/python.exe -m pip install -r requirements.txt

## Ejecucion local
Terminal 1, desde la raiz: docker compose up -d db
Terminal 2, desde services/api: ./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
Terminal 3, desde apps/web: npm run dev -- --host 127.0.0.1 --port 5173

## Accesos
Frontend: http://127.0.0.1:5173
API: http://127.0.0.1:8000/docs
Salud: http://127.0.0.1:8000/api/v1/health
Base de datos: http://127.0.0.1:8000/api/v1/health/database

## Migraciones
Desde la raiz: services/api/.venv/Scripts/python.exe -m alembic upgrade head

## Estado
Fase 1 en validacion. Interfaz de 13 modulos, API y PostgreSQL conectados. Los modelos de ML, la ingesta sismica, las alertas y la autenticacion siguen pendientes de sus respectivas fases.

## Limitacion cientifica
El sistema no puede predecir con certeza fecha, lugar y magnitud de futuros terremotos. Los resultados experimentales no sustituyen alertas oficiales.
