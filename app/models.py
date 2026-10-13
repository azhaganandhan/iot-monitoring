from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, Numeric, String, desc, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    device_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    location: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Telemetry(Base):
    __tablename__ = "telemetry"
    __table_args__ = (Index("idx_telemetry_device_time", "device_id", desc("timestamp")),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_id: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    water_total: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    flow_rate: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    moisture: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("NOW()"), nullable=False)


class RawUplink(Base):
    __tablename__ = "raw_uplinks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    device_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()"), nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    event_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
