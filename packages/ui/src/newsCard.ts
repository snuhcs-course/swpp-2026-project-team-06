/**
 * 소식 카드 배치의 순수 계산(DEV-467, 시안 ‘다듬은 A’ 2026-11-24).
 * NewsRoom이 쓰고 scripts/test-news-cards.mjs가 검사한다.
 */

/** 카드 사이 간격 */
export const NEWS_CARD_GAP = 12;
/** 두 장 이상 사진 사이 간격 */
export const NEWS_PHOTO_GAP = 2;

/** 카드 폭 = 방 폭(최대 maxWidth) − 좌우 여백 */
export function newsCardWidth(windowWidth: number, maxWidth: number, gutter: number) {
  return Math.max(0, Math.round(Math.min(windowWidth, maxWidth) - gutter * 2));
}

export type NewsPhotoCell = {
  /** 사진 순서(0부터) */
  index: number;
  width: number;
  height: number;
  /** 2장 이상일 때 오른쪽 아래 ‘i/N’. 1장이면 null */
  badge: string | null;
};

/**
 * 사진을 카드 폭에 맞춘 줄로 나눈다. 1장 = 카드 폭 4:3, 2장 = 정사각형 두 칸(사이 2px).
 * 3장 이상은 두 장씩 정사각형 줄이고, 홀수로 남은 마지막 한 장은 카드 폭 4:3이다.
 */
export function newsPhotoRows(count: number, cardWidth: number): NewsPhotoCell[][] {
  const rows: NewsPhotoCell[][] = [];
  const badge = (i: number) => (count > 1 ? `${i + 1}/${count}` : null);
  const half = Math.floor((cardWidth - NEWS_PHOTO_GAP) / 2);
  for (let i = 0; i < count; i += 2) {
    if (i + 1 < count)
      rows.push([
        { index: i, width: half, height: half, badge: badge(i) },
        { index: i + 1, width: half, height: half, badge: badge(i + 1) },
      ]);
    else rows.push([{ index: i, width: cardWidth, height: Math.round((cardWidth * 3) / 4), badge: badge(i) }]);
  }
  return rows;
}
