"""
DELOS Configuration Management
Centralized settings using Pydantic for type safety and validation.
"""

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Environment variables can be set directly or via .env file.
    """

    # BCB API Configuration
    bcb_api_timeout: float = 30.0
    bcb_max_retries: int = 3
    bcb_retry_base_delay: float = 1.0
    bcb_retry_max_delay: float = 60.0

    # Oracle Contract Configuration
    oracle_address: Optional[str] = None
    private_key: Optional[str] = None
    rpc_url: str = "https://sepolia-rollup.arbitrum.io/rpc"

    # Scheduler Configuration (BRT = UTC-3)
    daily_update_hour: int = 19  # 19:00 BRT
    daily_update_minute: int = 0
    monthly_update_day: int = 10  # ~10th of each month

    # Anomaly Detection Configuration
    anomaly_std_threshold: float = 3.0  # Flag if > N std devs from mean
    anomaly_lookback_days: int = 30  # Historical window for statistics
    anomaly_velocity_threshold: float = 0.5  # Max 50% daily change

    # Data Storage Configuration
    database_path: str = "data/rates.db"

    # API Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "*"  # Comma-separated list or "*" for all

    # Alerting Configuration (optional)
    slack_webhook_url: Optional[str] = None
    alert_email: Optional[str] = None

    # Logging Configuration
    log_level: str = "INFO"
    log_json_format: bool = True  # JSON logs for production

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        # Also check parent contracts directory for shared .env
        env_file = [".env", "../contracts/.env"]


# Global settings instance
settings = Settings()
