from fastapi import FastAPI

from app.accounts.router import router as accounts_router
from app.ai.router import router as ai_router
from app.analytics.router import router as analytics_router
from app.catalog.router import router as catalog_router
from app.farms.router import router as farms_router
from app.messaging.router import router as messaging_router
from app.orders.router import router as orders_router

app = FastAPI(title="Farmclub API")


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


for module_router in (
    accounts_router,
    farms_router,
    catalog_router,
    orders_router,
    messaging_router,
    ai_router,
    analytics_router,
):
    app.include_router(module_router, prefix="/api")
