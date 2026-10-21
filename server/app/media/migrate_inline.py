"""DB에 data URL로 저장된 공개 사진·영상을 저장소(R2)로 옮기고 주소로 바꾼다(DEV-102).

실행: uv run python -m app.media.migrate_inline --base-url https://api.farmclub.kr [--commit]
기본은 시험 실행이다. 옮길 개수만 보여 주고 저장소에도 쓰지 않는다. --commit을 붙여야 바꾼다.

대상: farms.photo·detail_content, products.photos·detail_content·module_detail,
broadcasts.photos·videos.
값 자체는 출력하지 않는다. 형식 검사(core/images)에 걸리는 값은 그대로 두고 개수만 알린다.
--base-url은 앱이 업로드 때 저장하는 주소(apiUrl + /api/media/...)와 같게 맞춘다.
"""

import base64
import binascii
import copy
import sys
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts import models as _accounts_models  # noqa: F401
from app.catalog.models import Product
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.errors import ApiError
from app.farms.models import Farm
from app.media import service
from app.messaging.models import Broadcast


class Migrator:
    def __init__(self, session: Session, base_url: str, commit: bool):
        self.session = session
        self.base_url = base_url.rstrip("/")
        self.commit = commit
        self.moved: Counter[str] = Counter()
        self.rejected: Counter[str] = Counter()
        self._done: dict[str, str] = {}

    def uri(self, farm: Farm, value, where: str):
        """data URL이면 옮긴 주소를, 아니면 받은 값을 그대로 돌려준다."""
        if not isinstance(value, str) or not value.startswith("data:"):
            return value
        if value in self._done:
            self.moved[where] += 1
            return self._done[value]
        header, _, payload = value.partition(",")
        try:
            data = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError):
            self.rejected[where] += 1
            return value
        declared = header.removeprefix("data:").split(";")[0] or None
        try:
            if not self.commit:
                service.check(data, declared)
                self.moved[where] += 1
                return value
            row = service.save(self.session, farm, data, declared)
        except ApiError:
            self.rejected[where] += 1
            return value
        url = self.base_url + service.url_of(row)
        self._done[value] = url
        self.moved[where] += 1
        return url

    def blocks(self, farm: Farm, content: dict | None, where: str) -> dict | None:
        if not content:
            return content
        out = copy.deepcopy(content)
        for block in out.get("blocks", []):
            if block.get("type") == "image":
                block["uri"] = self.uri(farm, block.get("uri"), where)
        return out

    def modules(self, farm: Farm, detail: dict | None, where: str) -> dict | None:
        if not detail:
            return detail
        out = copy.deepcopy(detail)
        for module in out.get("modules", []):
            for photo in module.get("photos", []):
                photo["uri"] = self.uri(farm, photo.get("uri"), where)
        return out


def _set(row, attr: str, value) -> None:
    # 바뀐 값만 쓴다(다른 행·열은 건드리지 않는다)
    if getattr(row, attr) != value:
        setattr(row, attr, value)


def run(session: Session, base_url: str, commit: bool) -> Migrator:
    m = Migrator(session, base_url, commit)
    farms = {f.id: f for f in session.scalars(select(Farm))}
    for farm in farms.values():
        _set(farm, "photo", m.uri(farm, farm.photo, "farms.photo"))
        _set(farm, "detail_content", m.blocks(farm, farm.detail_content, "farms.detail_content"))
    for p in session.scalars(select(Product)):
        farm = farms[p.farm_id]
        _set(p, "photos", [m.uri(farm, u, "products.photos") for u in p.photos or []])
        _set(p, "detail_content", m.blocks(farm, p.detail_content, "products.detail_content"))
        _set(p, "module_detail", m.modules(farm, p.module_detail, "products.module_detail"))
    for b in session.scalars(select(Broadcast)):
        farm = farms[b.farm_id]
        _set(b, "photos", [m.uri(farm, u, "broadcasts.photos") for u in b.photos or []])
        _set(b, "videos", [m.uri(farm, u, "broadcasts.videos") for u in b.videos or []])
    return m


def main(argv: list[str]) -> int:
    args = list(argv)
    commit = "--commit" in args
    if commit:
        args.remove("--commit")
    # 저장한 주소가 사진 주소 검증(core/detail.MediaUri)을 통과해야 하므로 local만 http를 받는다
    schemes = ("https://", "http://") if get_settings().app_env == "local" else ("https://",)
    if len(args) != 2 or args[0] != "--base-url" or not args[1].startswith(schemes):
        print(__doc__)
        return 2
    with get_sessionmaker()() as session:
        m = run(session, args[1], commit)
        if commit:
            session.commit()
        else:
            session.rollback()
    mode = "바꿨어요" if commit else "시험 실행(바꾸지 않음)"
    print(f"{mode}: 옮김 {sum(m.moved.values())}개, 형식 오류로 남김 {sum(m.rejected.values())}개")
    for where in sorted(set(m.moved) | set(m.rejected)):
        print(f"  {where}: 옮김 {m.moved[where]}, 남김 {m.rejected[where]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
