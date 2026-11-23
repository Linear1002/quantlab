from fastapi import APIRouter

from app.config import get_settings
from quant import ENGINE_VERSION

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health() -> dict:
    """フロントエンドから「バックエンドが起動しているか」を確認するためのAPI。"""
    s = get_settings()
    return {"status": "ok", "engine_version": ENGINE_VERSION, "data_provider": s.data_provider}
