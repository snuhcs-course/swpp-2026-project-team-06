"""운영자 토큰 발급(ADR 0008). Swagger UI(/docs)의 Authorize에 넣어 관리 API를 부른다.

실행: uv run python -m app.accounts.admin_token [운영자 user id, 기본 u-admin]
서버의 JWT_SECRET을 아는 운영자만 쓸 수 있다. 테스트 계정에는 ADMIN을 주지 않는다(ADR 0009).
"""

import sys

from app.accounts.models import User
from app.core.db import get_sessionmaker
from app.core.security import issue_token


def main(argv: list[str]) -> None:
    user_id = argv[0] if argv else "u-admin"
    with get_sessionmaker()() as session:
        user = session.get(User, user_id)
    if user is None or user.role != "ADMIN":
        sys.exit(f"{user_id}는 운영자 계정이 아니에요.")
    print(issue_token(user.id, user.role))


if __name__ == "__main__":
    main(sys.argv[1:])
