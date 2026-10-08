"""farms 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.farms.models import Farm


def get_farm_of_producer(db: Session, producer_id: str) -> Farm | None:
    return db.scalar(select(Farm).where(Farm.producer_id == producer_id))
