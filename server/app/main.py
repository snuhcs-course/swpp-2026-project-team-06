from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.accounts.router import admin_router as accounts_admin_router
from app.accounts.router import router as accounts_router
from app.admin.farms import router as admin_farms_router
from app.admin.router import router as admin_exceptions_router
from app.admin.user_detail import router as admin_user_detail_router
from app.ai.router import router as ai_router
from app.analytics.router import router as analytics_router
from app.catalog.router import admin_router as catalog_admin_router
from app.catalog.router import capacity_admin_router as catalog_capacity_admin_router
from app.catalog.router import router as catalog_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.farms.router import home_router
from app.farms.router import router as farms_router
from app.farms.share import router as farm_share_router
from app.messaging.router import router as messaging_router
from app.orders.router import admin_router as orders_admin_router
from app.orders.router import router as orders_router
from app.source_analysis.middleware import SourceRequestMiddleware
from app.source_analysis.publish import public_router as source_public_router
from app.source_analysis.router import config_router as source_config_router
from app.source_analysis.router import router as source_analysis_router

app = FastAPI(title="Farmclub API")
app.add_middleware(SourceRequestMiddleware)
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
    source_config_router,
    source_analysis_router,
    source_public_router,
):
    app.include_router(module_router, prefix="/api")

app.include_router(farm_share_router)

# 운영자 관리 API는 /admin 아래(ADR 0008). 모든 경로가 ADMIN 역할을 검사한다.
for admin_router in (
    accounts_admin_router,
    catalog_admin_router,
    catalog_capacity_admin_router,
    orders_admin_router,
    admin_exceptions_router,
    admin_farms_router,
    admin_user_detail_router,
):
    app.include_router(admin_router)
