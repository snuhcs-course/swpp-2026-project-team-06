from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.accounts.router import router as accounts_router
from app.ai.router import router as ai_router
from app.analytics.router import router as analytics_router
from app.catalog.router import admin_router as catalog_admin_router
from app.catalog.router import router as catalog_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.farms.router import home_router
from app.farms.router import router as farms_router
from app.messaging.router import router as messaging_router
from app.orders.router import router as orders_router

app = FastAPI(title="Farmclub API")
install_error_handlers(app)

# 두 앱(웹)과 API는 다른 주소다. 앱 주소만 허용한다.
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.consumer_app_url, settings.producer_app_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


for module_router in (
    accounts_router,
    home_router,
    farms_router,
    catalog_router,
    orders_router,
    messaging_router,
    ai_router,
    analytics_router,
):
    app.include_router(module_router, prefix="/api")

# 운영자 관리 API는 /admin 아래(ADR 0008). 모든 경로가 ADMIN 역할을 검사한다.
for admin_router in (catalog_admin_router,):
    app.include_router(admin_router)
