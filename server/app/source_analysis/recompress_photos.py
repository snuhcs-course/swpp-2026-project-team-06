"""DEV-328: 예전에 원본 크기 PNG로 저장한 공개 상품사진을 표시용 JPEG로 바꾼다.

실행: uv run python -m app.source_analysis.recompress_photos [--backup-done --commit]
기본은 시험 실행이다. 바꿀 사진(id, 예전 키)과 전후 바이트만 보여 주고, --commit을 붙여야 바꾼다.
--commit에는 --backup-done(R2 사진 저장소를 백업했다는 사람의 확인)이 함께 있어야 한다. 예전 PNG는
되돌릴 수 없기 때문이다(작업실 업로드 사진은 원본 크기 사본이 이것뿐일 수 있다).
사진 id(`/api/source-media/{id}`)는 그대로라 상품 데이터는 바꾸지 않는다. 저장 키만 새로 쓴다.
예전 키는 바로 지우지 않는다(읽는 중인 요청이 깨지지 않게).
참조가 없어진 키는 worker cleanup이 지운다.
이미 JPEG인 사진은 건너뛰므로 다시 실행해도 된다. 실패한 사진이 있으면 종료 코드 1.
"""

import sys
from dataclasses import dataclass, field

from sqlalchemy import select

from app.core.db import get_sessionmaker
from app.core.images import sniff
from app.source_analysis.models import PublicPhoto
from app.source_analysis.photos import public_photo
from app.source_analysis.preprocess import PreparationError
from app.source_analysis.storage import Storage


@dataclass
class Result:
    # (id, 예전 키, before, after)
    converted: list[tuple[str, str, int, int]] = field(default_factory=list)
    skipped: int = 0  # 이미 PNG가 아님
    failed: list[str] = field(default_factory=list)  # 읽거나 변환하지 못한 사진 id

    @property
    def before(self):
        return sum(b for _, _, b, _ in self.converted)

    @property
    def after(self):
        return sum(a for _, _, _, a in self.converted)


def recompress(session, store, commit: bool) -> Result:
    result = Result()
    for photo in session.scalars(select(PublicPhoto).order_by(PublicPhoto.id)):
        try:
            data = store.get(photo.storage_key)
        except Exception:
            result.failed.append(photo.id)
            continue
        if sniff(data) != "image/png":
            result.skipped += 1
            continue
        try:
            smaller = public_photo(data)
        except PreparationError:
            result.failed.append(photo.id)
            continue
        result.converted.append((photo.id, photo.storage_key, len(data), len(smaller)))
        if commit:
            photo.storage_key = store.put(smaller)
    if commit:
        # 예전 키는 지우지 않는다. 참조가 없어지면 worker cleanup이 지운다(읽는 중인 요청 보호)
        session.commit()
    else:
        session.rollback()
    return result


def main(argv: list[str]) -> None:
    usage = "사용법: python -m app.source_analysis.recompress_photos [--backup-done --commit]"
    if set(argv) - {"--commit", "--backup-done"}:
        sys.exit(usage)
    commit = "--commit" in argv
    if commit and "--backup-done" not in argv:
        sys.exit("--commit에는 --backup-done이 필요해요(R2 사진 저장소를 먼저 백업). " + usage)
    with get_sessionmaker()() as session:
        result = recompress(session, Storage(), commit)
    for pid, old_key, before, after in result.converted:
        print(f"{pid} {old_key} {before:,} B -> {after:,} B")
    print(
        f"PNG {len(result.converted)}장 {result.before:,} B -> {result.after:,} B, "
        f"건너뜀 {result.skipped}장, 실패 {len(result.failed)}장"
    )
    for pid in result.failed:
        print(f"실패: {pid} (그대로 둠)")
    if commit:
        print("JPEG로 바꿨어요.")
    else:
        print(
            "시험 실행이라 바꾸지 않았어요. "
            "바꾸려면 R2를 백업한 뒤 --backup-done --commit을 붙이세요."
        )
    if result.failed:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
