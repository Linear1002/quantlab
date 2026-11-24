"""FastAPI のエントリポイント。起動: `uv run uvicorn app.main:app --reload`"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import backtests, health, stocks, strategies, system
from app.config import get_settings
from app.data.base import (
    InvalidRequestError,
    NoDataError,
    ProviderError,
    RateLimitError,
    SymbolNotFoundError,
)
from app.db.session import get_engine
from quant.errors import InsufficientDataError, InvalidParameterError


@asynccontextmanager
async def lifespan(app: FastAPI):
    """起動時に DB を最新にしておく。リクエストが来てから準備すると、同時に来たときに衝突するため。
    (テストでは get_engine を一時 DB に差し替えているので、ここでも差し替え後のものを使う)"""
    get_db = app.dependency_overrides.get(get_engine, get_engine)
    get_db()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="QuantLab API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(stocks.router)
    app.include_router(strategies.router)
    app.include_router(backtests.router)
    app.include_router(system.router)
    _register_error_handlers(app)
    return app


def _error(status: int, code: str, message: str) -> JSONResponse:
    # すべてのエラーを {"error": {"code", "message"}} の同じ形で返す(DESIGN.md §3)
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(InvalidParameterError)
    async def _invalid(_: Request, e: InvalidParameterError):
        return _error(422, "INVALID_PARAMETER", str(e))

    @app.exception_handler(InsufficientDataError)
    async def _insufficient(_: Request, e: InsufficientDataError):
        return _error(422, "INSUFFICIENT_DATA", str(e))

    @app.exception_handler(RequestValidationError)
    async def _request(_: Request, e: RequestValidationError):
        # FastAPI 標準の {"detail": [...]} ではなく、統一形式で返す
        first = e.errors()[0] if e.errors() else {}
        where = ".".join(str(x) for x in first.get("loc", []))
        return _error(422, "INVALID_REQUEST", f"{where}: {first.get('msg', 'invalid')}")

    @app.exception_handler(InvalidRequestError)
    async def _bad(_: Request, e: InvalidRequestError):
        return _error(400, e.code, str(e))

    @app.exception_handler(NoDataError)
    async def _nodata(_: Request, e: NoDataError):
        return _error(404, e.code, str(e))

    @app.exception_handler(SymbolNotFoundError)
    async def _not_found(_: Request, e: SymbolNotFoundError):
        return _error(404, e.code, str(e))

    @app.exception_handler(RateLimitError)
    async def _rate(_: Request, e: RateLimitError):
        return _error(429, e.code, str(e))

    @app.exception_handler(ProviderError)
    async def _provider(_: Request, e: ProviderError):
        return _error(502, e.code, str(e))


app = create_app()
