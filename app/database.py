import hashlib
import json

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _is_legacy_numeric_device_id(columns: dict[str, object]) -> bool:
    device_id = columns.get("device_id")
    return device_id is not None and str(device_id["type"]).lower() in {"integer", "bigint"}


def _migrate_legacy_schema() -> None:
    with engine.begin() as connection:
        inspector = inspect(connection)
        table_columns = {
            table_name: {column["name"]: column for column in inspector.get_columns(table_name)}
            for table_name in ("devices", "telemetry", "raw_uplinks")
            if inspector.has_table(table_name)
        }

        telemetry_columns = table_columns.get("telemetry", {})
        legacy_telemetry = _is_legacy_numeric_device_id(telemetry_columns)
        has_legacy_telemetry_columns = legacy_telemetry or "device_ref_id" in telemetry_columns
        if legacy_telemetry:
            connection.execute(text("ALTER TABLE telemetry RENAME COLUMN device_id TO device_ref_id"))

        raw_uplink_columns = table_columns.get("raw_uplinks", {})
        legacy_raw_uplinks = _is_legacy_numeric_device_id(raw_uplink_columns)
        has_legacy_raw_uplink_columns = legacy_raw_uplinks or "device_ref_id" in raw_uplink_columns
        if legacy_raw_uplinks:
            connection.execute(text("ALTER TABLE raw_uplinks RENAME COLUMN device_id TO device_ref_id"))

        statements = [
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type VARCHAR(50)",
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS location VARCHAR(200)",
            "ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ",
            "ALTER TABLE devices ALTER COLUMN created_at SET DEFAULT NOW()",
            "ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS device_id VARCHAR(100)",
            "ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS water_total NUMERIC",
            "ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS flow_rate NUMERIC",
            "ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS moisture NUMERIC",
            "ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS temperature NUMERIC",
            "ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS payload JSONB",
            "ALTER TABLE telemetry ALTER COLUMN created_at SET DEFAULT NOW()",
            "ALTER TABLE raw_uplinks ADD COLUMN IF NOT EXISTS device_id VARCHAR(100)",
            "ALTER TABLE raw_uplinks ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ",
            "ALTER TABLE raw_uplinks ADD COLUMN IF NOT EXISTS payload JSONB",
            "ALTER TABLE raw_uplinks ADD COLUMN IF NOT EXISTS event_key VARCHAR(64)",
            "CREATE INDEX IF NOT EXISTS idx_telemetry_device_time "
            "ON telemetry (device_id, timestamp DESC)",
        ]
        if "last_seen" in table_columns.get("devices", {}):
            statements.append("UPDATE devices SET last_seen_at = last_seen WHERE last_seen_at IS NULL")
        if legacy_telemetry:
            statements.extend(
                (
                    "UPDATE telemetry SET device_id = devices.device_id FROM devices "
                    "WHERE telemetry.device_ref_id = devices.id AND telemetry.device_id IS NULL",
                    "UPDATE telemetry SET payload = decoded_payload WHERE payload IS NULL",
                    "ALTER TABLE telemetry ALTER COLUMN decoded_payload DROP NOT NULL",
                    "ALTER TABLE telemetry ALTER COLUMN device_id SET NOT NULL",
                )
            )
        if has_legacy_telemetry_columns:
            statements.append("ALTER TABLE telemetry ALTER COLUMN device_ref_id DROP NOT NULL")
        if legacy_raw_uplinks:
            statements.extend(
                (
                    "UPDATE raw_uplinks SET device_id = devices.device_id FROM devices "
                    "WHERE raw_uplinks.device_ref_id = devices.id AND raw_uplinks.device_id IS NULL",
                    "UPDATE raw_uplinks SET received_at = timestamp WHERE received_at IS NULL",
                    "UPDATE raw_uplinks SET payload = raw_payload WHERE payload IS NULL",
                    "ALTER TABLE raw_uplinks ALTER COLUMN payload SET NOT NULL",
                    "ALTER TABLE raw_uplinks ALTER COLUMN timestamp SET DEFAULT NOW()",
                    "ALTER TABLE raw_uplinks ALTER COLUMN created_at SET DEFAULT NOW()",
                )
            )
        if has_legacy_raw_uplink_columns:
            statements.extend(
                (
                    "ALTER TABLE raw_uplinks ALTER COLUMN device_ref_id DROP NOT NULL",
                    "ALTER TABLE raw_uplinks ALTER COLUMN raw_payload DROP NOT NULL",
                )
            )
        for statement in statements:
            connection.execute(text(statement))

        existing_keys = set(
            connection.execute(
                text("SELECT event_key FROM raw_uplinks WHERE event_key IS NOT NULL")
            ).scalars()
        )
        old_uplinks = connection.execute(
            text(
                "SELECT id, payload FROM raw_uplinks "
                "WHERE event_key IS NULL AND payload IS NOT NULL ORDER BY id"
            )
        )
        for uplink_id, payload in old_uplinks:
            canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
            event_key = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
            if event_key in existing_keys:
                continue
            connection.execute(
                text("UPDATE raw_uplinks SET event_key = :event_key WHERE id = :id"),
                {"event_key": event_key, "id": uplink_id},
            )
            existing_keys.add(event_key)
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_uplinks_event_key "
                "ON raw_uplinks (event_key)"
            )
        )


def _seed_known_devices() -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO devices (device_id, name, device_type) VALUES "
                "(:moisture_id, :moisture_name, :moisture_type), "
                "(:flow_meter_id, :flow_meter_name, :flow_meter_type), "
                "(:mango_flow_meter_id, :mango_flow_meter_name, :mango_flow_meter_type) "
                "ON CONFLICT (device_id) DO UPDATE SET "
                "name = EXCLUDED.name, device_type = EXCLUDED.device_type"
            ),
            {
                "moisture_id": "ao-ms-01",
                "moisture_name": "Banana Field Mositure",
                "moisture_type": "moisture_sensor",
                "flow_meter_id": "aofm-sm-01",
                "flow_meter_name": "Overhead Tank Water consumption",
                "flow_meter_type": "flow_meter",
                "mango_flow_meter_id": "aofm-01",
                "mango_flow_meter_name": "Mango Orchard Irrigation",
                "mango_flow_meter_type": "flow_meter",
            },
        )


def init_db() -> None:
    # Import models so they are registered on Base before creating tables.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _migrate_legacy_schema()
    _seed_known_devices()
