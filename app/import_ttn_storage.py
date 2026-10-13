import logging
import json
import argparse
import logging
from socket import timeout as SocketTimeout
from threading import Event
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import settings
from app.database import init_db
from app.mqtt_client import _handle_message

logger = logging.getLogger("ttn_storage_import")


def import_uplinks(device_id: str | None = None) -> int:
    if not settings.ttn_application_id or not settings.ttn_storage_api_key:
        raise RuntimeError("TTN_APPLICATION_ID and TTN_STORAGE_API_KEY must be configured")

    query = urlencode({"last": f"{settings.ttn_storage_hours}h"})
    url = (
        "https://eu1.cloud.thethings.network/api/v3/as/applications/"
        f"{settings.ttn_application_id}/packages/storage/uplink_message?{query}"
    )
    request = Request(
        url,
        headers={
            "Authorization": f"Bearer {settings.ttn_storage_api_key}",
            "Accept": "text/event-stream",
        },
    )
    imported = 0

    try:
        with urlopen(request, timeout=settings.ttn_storage_idle_timeout) as response:
            for line in response:
                event = line.strip()
                if event.startswith(b"data:"):
                    event = event.removeprefix(b"data:").strip()
                if not event or not event.startswith(b"{"):
                    continue
                payload = json.loads(event)
                uplink = payload.get("result", payload)
                if device_id and uplink.get("end_device_ids", {}).get("device_id") != device_id:
                    continue
                if _handle_message(json.dumps(uplink).encode("utf-8")):
                    imported += 1
    except SocketTimeout:
        logger.info("Storage stream idle after importing %s uplinks", imported)

    return imported


def run_storage_sync(stop_event: Event) -> None:
    while not stop_event.is_set():
        try:
            count = import_uplinks()
            logger.info("TTN Storage sync imported %s new uplinks", count)
        except Exception:
            logger.exception("TTN Storage sync failed")
        stop_event.wait(settings.ttn_storage_sync_interval_seconds)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import historical TTN Storage uplinks")
    parser.add_argument("--device-id", help="Import only uplinks for this TTN device ID")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    init_db()
    count = import_uplinks(device_id=args.device_id)
    logger.info("Imported %s TTN storage uplinks", count)