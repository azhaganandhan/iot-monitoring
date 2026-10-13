import logging
from contextlib import asynccontextmanager
from threading import Event, Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.telemetry import router as telemetry_router
from app.config import settings
from app.database import init_db
from app.import_ttn_storage import run_storage_sync
from app.mqtt_client import mqtt_consumer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    mqtt_consumer.start()
    storage_stop = Event()
    storage_thread = None
    if settings.ttn_application_id and settings.ttn_storage_api_key:
        storage_thread = Thread(
            target=run_storage_sync,
            args=(storage_stop,),
            name="ttn-storage-sync",
            daemon=True,
        )
        storage_thread.start()
    logger.info("IoT monitoring API started")
    yield
    storage_stop.set()
    if storage_thread is not None:
        storage_thread.join(timeout=settings.ttn_storage_idle_timeout + 1)
    mqtt_consumer.stop()


app = FastAPI(title="IoT Monitoring API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(telemetry_router)


@app.get("/health")
def health():
    return {"status": "ok"}
