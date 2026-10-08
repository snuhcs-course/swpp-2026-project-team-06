"""테스트에서 모든 모듈의 모델을 불러온다(migrations/env.py와 같은 목록)."""

from app.accounts import models as _accounts  # noqa: F401
from app.catalog import models as _catalog  # noqa: F401
from app.core import models as _core  # noqa: F401
from app.farms import models as _farms  # noqa: F401
from app.messaging import models as _messaging  # noqa: F401
from app.orders import models as _orders  # noqa: F401
