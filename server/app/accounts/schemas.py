"""accounts 모듈 Pydantic 입출력 스키마 (screens.md 7.2 accounts)."""

from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

App = Literal["consumer", "producer"]
FarmStatus = Literal["NONE", "PENDING", "REJECTED", "APPROVED", "SUSPENDED"]


class TestAccount(CamelModel):
    user_id: str
    name: str
    role: str
    farm_status: FarmStatus
    farm_name: str | None


class UserView(CamelModel):
    user_id: str
    name: str
    role: str
    is_test_account: bool
    farm_id: str | None
    farm_status: FarmStatus
    suspend_reason: str | None = None


class TestLoginInput(CamelModel):
    user_id: str
    app: App


class LoginResult(CamelModel):
    access_token: str
    user: UserView


class AddressInput(CamelModel):
    recipient_name: str = ""
    recipient_phone: str = ""
    postal_code: str = ""
    address: str = ""
    address_detail: str = ""
    label: str | None = Field(default=None, max_length=50)
    is_default: bool = False


class Address(CamelModel):
    address_id: str
    recipient_name: str
    recipient_phone: str
    postal_code: str
    address: str
    address_detail: str
    label: str | None
    is_default: bool
