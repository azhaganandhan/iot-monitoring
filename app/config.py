from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # PostgreSQL
    database_url: str = "postgresql+psycopg2://iot:iot_password@localhost:5432/iot_monitoring"

    # TTN MQTT
    mqtt_broker: str = "eu1.cloud.thethings.network"
    mqtt_port: int = 8883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_topic: str = "v3/+/devices/+/up"
    mqtt_use_tls: bool = True
    mqtt_keepalive: int = 60

    # TTN Storage Integration
    ttn_application_id: str = ""
    ttn_storage_api_key: str = ""
    ttn_storage_hours: int = 2160
    ttn_storage_idle_timeout: int = 20
    ttn_storage_sync_interval_seconds: int = 86400

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://95.217.220.40:3000,http://127.0.0.1:3000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
