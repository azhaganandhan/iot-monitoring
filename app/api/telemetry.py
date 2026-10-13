from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Device, Telemetry

router = APIRouter(prefix="/api", tags=["telemetry"])
IST = ZoneInfo("Asia/Kolkata")


def _format_ist(timestamp: datetime | None) -> str | None:
    if timestamp is None:
        return None
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(IST).strftime("%d %b %Y, %I:%M:%S %p IST")


@router.get("/devices")
def list_devices(db: Session = Depends(get_db)):
    devices = db.query(Device).order_by(Device.last_seen_at.desc().nullslast()).all()
    return [
        {
            "id": d.id,
            "device_id": d.device_id,
            "name": d.name,
            "device_type": d.device_type,
            "location": d.location,
            "last_seen_at": _format_ist(d.last_seen_at),
        }
        for d in devices
    ]


@router.get("/telemetry")
def list_telemetry(
    device_id: str | None = Query(default=None, description="Filter by TTN device_id"),
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0, description="Number of telemetry rows to skip"),
    db: Session = Depends(get_db),
):
    query = db.query(Telemetry)
    if device_id:
        query = query.filter(Telemetry.device_id == device_id)

    rows = query.order_by(Telemetry.timestamp.desc()).offset(offset).limit(limit).all()
    return [
        {
            "id": t.id,
            "device_id": t.device_id,
            "timestamp": _format_ist(t.timestamp),
            "timestamp_utc": t.timestamp,
            "water_total": t.water_total,
            "flow_rate": t.flow_rate,
            "moisture": t.moisture,
            "temperature": t.temperature,
            "payload": t.payload,
        }
        for t in rows
    ]


@router.get("/telemetry/summary")
def telemetry_summary(
    device_id: str | None = Query(default=None, description="Filter by TTN device_id"),
    db: Session = Depends(get_db),
):
    query = db.query(
        Telemetry.device_id,
        func.count(Telemetry.id).label("count"),
        func.max(Telemetry.timestamp).label("last_timestamp"),
        func.avg(Telemetry.flow_rate).label("avg_flow_rate"),
        func.avg(Telemetry.moisture).label("avg_moisture"),
    )

    if device_id:
        query = query.filter(Telemetry.device_id == device_id)
        result = query.group_by(Telemetry.device_id).one_or_none()
        if result is None:
            raise HTTPException(status_code=404, detail="Device not found or has no telemetry")
        rows = [result]
    else:
        rows = query.group_by(Telemetry.device_id).all()

    return [
        {
            "device_id": r.device_id,
            "count": r.count,
            "last_timestamp": r.last_timestamp,
            "avg_flow_rate": float(r.avg_flow_rate) if r.avg_flow_rate is not None else None,
            "avg_moisture": float(r.avg_moisture) if r.avg_moisture is not None else None,
        }
        for r in rows
    ]
