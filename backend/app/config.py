"""アプリ設定。値は環境変数 または backend/.env から読む(QUANTLAB_ で始まる名前)。"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="QUANTLAB_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./quantlab.db"
    data_provider: str = "yahoo"
    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
