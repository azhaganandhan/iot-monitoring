import json
import hashlib
import logging
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.database import SessionLocal
from app.models import Device, RawUplink, Telemetry

logger = logging.getLogger("mqtt_client")


def _numeric_value(payload: dict, *keys: str) -> float | None:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            logger.warning("Ignoring non-numeric decoded field %s=%r", key, value)
    return None


def _parse_timestamp(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)


def _validate_ttn_message(payload: dict) -> bool:
    """Confirm the message has the minimum shape of a TTN v3 uplink."""
    return "end_device_ids" in payload and "device_id" in payload["end_device_ids"]


def _upsert_device(db, device_id: str, last_seen_at: datetime) -> Device:
    device = db.query(Device).filter(Device.device_id == device_id).one_or_none()
    if device is None:
        device = Device(device_id=device_id, last_seen_at=last_seen_at)
        db.add(device)
        db.flush()
    else:
        device.last_seen_at = last_seen_at
    return device


def _handle_message(raw_body: bytes) -> bool:
    db = SessionLocal()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
        event_key = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

        if not _validate_ttn_message(payload):
            logger.warning("Skipping malformed TTN message: %s", payload)
            result = db.execute(
                insert(RawUplink)
                .values(
                    device_id=None,
                    payload=payload if isinstance(payload, dict) else {"raw": raw_body.decode("utf-8", "replace")},
                    event_key=event_key,
                )
                .on_conflict_do_nothing(index_elements=[RawUplink.event_key])
            )
            db.commit()
            return result.rowcount == 1

        end_device_ids = payload["end_device_ids"]
        device_id_str = end_device_ids["device_id"]
        timestamp = _parse_timestamp(payload.get("received_at"))

        result = db.execute(
            insert(RawUplink)
            .values(device_id=device_id_str, received_at=timestamp, payload=payload, event_key=event_key)
            .on_conflict_do_nothing(index_elements=[RawUplink.event_key])
        )
        if result.rowcount == 0:
            db.commit()
            return False

        _upsert_device(db, device_id_str, timestamp)

        uplink_message = payload.get("uplink_message") or {}
        decoded_payload = uplink_message.get("decoded_payload")
        if isinstance(decoded_payload, dict):
            db.add(
                Telemetry(
                    device_id=device_id_str,
                    timestamp=timestamp,
                    water_total=_numeric_value(
                        decoded_payload,
                        "water_total",
                        "Water_Flow_in_Cubic_Meter",
                    ),
                    flow_rate=_numeric_value(decoded_payload, "flow_rate"),
                    moisture=_numeric_value(decoded_payload, "water_SOIL", "moisture"),
                    temperature=_numeric_value(decoded_payload, "temp_SOIL", "temperature"),
                    payload=decoded_payload,
                )
            )
        else:
            logger.info("Uplink for %s has no decoded_payload, stored as raw only", device_id_str)

        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.exception("Failed to process incoming MQTT message")
    finally:
        db.close()


def _on_connect(client: mqtt.Client, userdata, flags, rc):
    if rc == 0:
        logger.info("Connected to MQTT broker %s:%s", settings.mqtt_broker, settings.mqtt_port)
        client.subscribe(settings.mqtt_topic)
    else:
        logger.error("Failed to connect to MQTT broker, return code %s", rc)


def _on_disconnect(client: mqtt.Client, userdata, rc):
    logger.warning("Disconnected from MQTT broker, return code %s", rc)


def _on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage):
    _handle_message(msg.payload)


def build_client() -> mqtt.Client:
    client = mqtt.Client()
    client.username_pw_set(settings.mqtt_username, settings.mqtt_password)

    if settings.mqtt_use_tls:
        client.tls_set()

    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = _on_message
    return client


class MQTTConsumer:
    """Wraps the paho-mqtt client and runs its network loop on a background thread."""

    def __init__(self):
        self.client = build_client()

    def start(self) -> None:
        self.client.connect(settings.mqtt_broker, settings.mqtt_port, settings.mqtt_keepalive)
        self.client.loop_start()
        logger.info("MQTT consumer started in background thread")

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()
        logger.info("MQTT consumer stopped")


mqtt_consumer = MQTTConsumer()
