// 판매 시작 전 구매자 화면 미리보기(DEV-184). 소비자 상품 상세와 같은 ProductPageBody를 쓰고,
// 승인 전이라 공개 API 대신 생산자 값(MyProduct·MyFarm)과 신청 물량으로 화면 값을 만든다.
import {
  apiUrl,
  productWorkspace,
  referencePrice,
  type MyFarm,
  type MyProduct,
  type ProductDetail,
} from "@farmclub/api";
import { ProductPageBody, type ProductPageData } from "@farmclub/ui";
import { useEffect, useState, type ReactNode } from "react";

import { daysBetween } from "./fields";
import { seoulToday } from "./HarvestStart";

const PRIVATE = "/api/source-media/";

/** 생산자 값으로 구매자 화면 데이터를 만든다(미리보기·채우기 화면 공용). */
export function toPageData(
  p: MyProduct,
  farmName: string,
  requestedGrams: number,
): ProductPageData {
  const stages = [...p.stages].sort((a, b) => a.seq - b.seq);
  const first = stages[0];
  return {
    ...p,
    photo: p.photos[0] ?? null,
    farmName,
    // 비어 있으면 비운 채로 넘긴다. 상세가 '예상'(마지막 예약 기간에서 유도) 또는 '확정 전'으로 그린다(DEV-227, HE-X7).
    deliveryWindow: p.deliveryWindow,
    maxDelayUntil: p.maxDelayUntil,
    // 승인되면 신청 물량만큼 열리고 첫 기간부터 예약을 받는다고 보고 그린다.
    soldOut: false,
    availability: "AVAILABLE",
    nextStageStartsAt: null,
    currentStageId: first?.stageId ?? null,
    remainingGrams: requestedGrams,
    dDay: first ? daysBetween(seoulToday(), first.endsAt) : null,
    // MyProduct에는 농가 한마디가 없다(API 변경은 범위 밖). 새 상품은 기본값이 빈 값이라 구매자 화면과 같다.
    farmerNote: "",
  };
}

export function BuyerPreview({
  product,
  farm,
  requestedGrams,
  salesPreview,
}: {
  product: MyProduct;
  farm: MyFarm;
  requestedGrams: number;
  salesPreview?: ReactNode;
}) {
  // 승인 전 사진은 공개 주소로 열리지 않아 인증 blob으로 불러온다(`sourcePhoto.productPhotoUrl`과 같은 규칙).
  const [urls, setUrls] = useState<Record<string, string>>({});
  const uris = [
    ...product.photos,
    ...(product.moduleDetail?.modules ?? []).flatMap((m) =>
      m.photos.map((x) => x.uri),
    ),
  ].filter((u) => u.startsWith(PRIVATE));
  const key = [...new Set(uris)].join(",");
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    // 사진마다 따로 받는다(DEV-341). 한 장이 실패해도 나머지는 보이고, 실패한 사진은 기본 자리로 남는다.
    for (const uri of new Set(uris))
      productWorkspace
        .photo(product.productId, uri.split("/").pop()!)
        .then((url) => {
          if (!alive) return URL.revokeObjectURL(url);
          made.push(url);
          setUrls((old) => ({ ...old, [uri]: url }));
        })
        .catch(() => {});
    return () => {
      alive = false;
      // 해제할 주소는 화면에서도 뺀다(해제된 주소가 깨진 사진으로 남지 않게)
      const gone = new Set(made);
      setUrls((old) =>
        Object.fromEntries(Object.entries(old).filter(([, url]) => !gone.has(url))),
      );
      made.forEach(URL.revokeObjectURL);
    };
    // key가 사진 목록을 대표한다.
  }, [product.productId, key]);
  const media = (uri: string) =>
    uri.startsWith(PRIVATE)
      ? (urls[uri] ?? "")
      : uri.startsWith("/")
        ? apiUrl + uri
        : uri;
  // 상품 사진 주소(DEV-322): 비공개 사진은 받은 blob, API 경로만 API 주소를 붙이고 나머지(시드 `/photos/…`·절대 주소)는 그대로.
  // 비공개 사진은 blob, `/api/` 주소는 API 주소를 붙인다. 아직 못 받은 비공개 사진("")은 빼서 기본 사진이 대신한다
  const photoUrl = (uri: string) =>
    uri.startsWith(PRIVATE)
      ? (urls[uri] ?? "")
      : uri.startsWith("/api/")
        ? apiUrl + uri
        : uri;
  const data = toPageData(product, farm.name, requestedGrams);
  return (
    <ProductPageBody
      // 여러 장이면 갤러리가 photos를 쓰므로 같이 바꾼다
      p={{
        ...data,
        photo: data.photo ? photoUrl(data.photo) : null,
        photos: (data.photos ?? []).map(photoUrl).filter(Boolean),
      }}
      // 소비자 화면과 같은 참고가 규칙(품절·남은 물량 조건 포함)을 그대로 쓴다.
      reference={(optionId) =>
        referencePrice(
          { ...product, ...data } as unknown as ProductDetail,
          optionId,
        )
      }
      slots={salesPreview === undefined ? undefined : { sale: salesPreview }}
      mediaUrl={media}
    />
  );
}
