import {
  ApiError,
  catalog,
  farms,
  isMock,
  newIdempotencyKey,
  type DetailBlock,
  type DetailContent,
  type MyFarm,
  type MyProduct,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  DetailStory,
  HeaderBar,
  Notice,
  Screen,
  Scroll,
  Sheet,
  StoryImage,
  T,
  tokens,
} from "@farmclub/ui";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { pickMedia } from "./pick";
import { useHideTabBar, useSession } from "./session";
const inputStyle = {
  padding: 14,
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: 14,
  fontSize: 16,
  fontFamily: tokens.fontFamily,
  color: tokens.color.text,
  backgroundColor: "#FFFFFF",
};
export function DetailEditor({ productId }: { productId?: string }) {
  const { user } = useSession();
  return (
    <Editor
      key={(user?.userId ?? "") + ":" + (productId ?? "farm")}
      productId={productId}
    />
  );
}
function Editor({ productId }: { productId?: string }) {
  useHideTabBar();
  const router = useRouter(),
    navigation = useNavigation();
  const [record, setRecord] = useState<MyFarm | MyProduct | null>(null);
  const [content, setContent] = useState<DetailContent>({ blocks: [] });
  const [baseline, setBaseline] = useState("");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [preview, setPreview] = useState(false),
    [replace, setReplace] = useState(false);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [saved, setSaved] = useState(false);
  const alive = useRef(true);
  const pending = useRef<{ body: string; key: string; version: number } | null>(
    null,
  );
  const dirty =
    !!record &&
    (JSON.stringify(content) !== baseline ||
      ((!!text || !!photos.length) && !saved));
  const allowLeave = useRef(false);
  function back() {
    const go = () => {
      allowLeave.current = true;
      if (router.canGoBack()) router.back();
      else if (productId)
        router.replace({
          pathname: "/products/[id]/edit",
          params: { id: productId },
        });
      else router.replace("/farm");
    };
    if (dirty || busy) setLeaving(() => go);
    else go();
  }

  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (allowLeave.current || !(dirty || busy)) return;
        event.preventDefault();
        setLeaving(() => () => {
          allowLeave.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [navigation, dirty, busy],
  );
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    if (typeof window !== "undefined")
      window.addEventListener("beforeunload", handler);
    return () => {
      if (typeof window !== "undefined")
        window.removeEventListener("beforeunload", handler);
    };
  }, [dirty, busy]);
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, []);
  async function load() {
    setError("");
    try {
      const r = productId
        ? await catalog.myProduct(productId)
        : await farms.mine();
      if (!alive.current) return;
      setRecord(r);
      const c = r.detailContent ?? {
        blocks: [
          {
            id: "intro",
            type: "text" as const,
            title: r.name,
            body: "intro" in r ? r.intro : r.description,
          },
        ].filter((b) => b.title || b.body),
      };
      setContent(c);
      setBaseline(JSON.stringify(c));
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "불러오지 못했어요");
    }
  }
  const locked =
    !!record && ["PENDING_APPROVAL", "CLOSED"].includes(record.status);
  function change(blocks: DetailBlock[]) {
    setContent({ blocks });
    setSaved(false);
    setError("");
  }
  async function pick(forBlocks: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await pickMedia({ multiple: true, imageWidth: 1200 });
      if (!alive.current) return;
      const good = result.flatMap((r) => (r.ok ? [r.uri] : []));
      const failures = result.flatMap((r) => (!r.ok ? [r.reason] : []));
      if (forBlocks)
        change(
          [
            ...content.blocks,
            ...good.map((uri) => ({
              id: newIdempotencyKey(),
              type: "image" as const,
              uri,
              alt: record?.name ?? "상세 사진",
            })),
          ].slice(0, 30),
        );
      else {
        setPhotos((p) => [...p, ...good].slice(0, 10));
        setSaved(false);
      }
      if (failures.length) setError(failures.join("\n"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function generate() {
    setReplace(false);
    setBusy(true);
    setError("");
    try {
      const r = productId
        ? await catalog.detailDraft(productId, { inputText: text, photos })
        : await farms.detailDraft({ inputText: text, photos });
      if (alive.current) change(r.content.blocks);
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error
            ? e.message
            : "생성에 실패했어요. 직접 편집하거나 다시 시도해 주세요",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function save() {
    if (!record || busy) return;
    setBusy(true);
    setError("");
    const body = JSON.stringify(content);
    if (!pending.current || pending.current.body !== body)
      pending.current = {
        body,
        key: newIdempotencyKey(),
        version: "version" in record ? record.version : 0,
      };
    try {
      const r = productId
        ? await catalog.update(
            productId,
            { version: pending.current.version, detailContent: content },
            pending.current.key,
          )
        : await farms.updateMine({ detailContent: content });
      if (!alive.current) return;
      setRecord(r);
      setBaseline(body);
      setSaved(true);
      pending.current = null;
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status === 409 && productId) {
        try {
          const latest = await catalog.myProduct(productId);
          if (alive.current) {
            setRecord(latest);
            pending.current = null;
          }
        } catch {
          /* Preserve editing content. */
        }
        setError(
          "상품이 변경됐어요. 편집 내용은 보존했어요. 최신 상품 정보와 상태를 확인한 뒤 다시 저장해 주세요.",
        );
      } else
        setError(
          e instanceof Error
            ? e.message
            : "저장하지 못했어요. 다시 시도해 주세요",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function move(i: number, delta: number) {
    const blocks = [...content.blocks],
      j = i + delta;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    change(blocks);
  }
  function patch(i: number, value: Partial<DetailBlock>) {
    change(
      content.blocks.map((b, n) =>
        n === i ? ({ ...b, ...value } as DetailBlock) : b,
      ),
    );
  }
  return (
    <Screen>
      <HeaderBar
        title={productId ? "상품 상세 편집" : "농가 상세 편집"}
        onBack={back}
      />
      <Scroll bottom={150}>
        <View style={{ padding: 20, gap: 16 }}>
          <T variant="title">{record?.name ?? "상세 불러오는 중…"}</T>
          <T muted>
            사진과 글로 우리 이야기를 전해요. 저장하면 소비자에게 보여요.
          </T>
          {error ? <Notice tone="error" title={error} /> : null}
          {!record && error ? (
            <Button label="다시 불러오기" onPress={load} />
          ) : null}
          {saved ? <Notice title="상세 페이지를 저장했어요" /> : null}
          {locked ? (
            <Notice
              title="현재 상태에서는 수정할 수 없어요"
              body="심사 중이면 신청을 철회한 뒤 수정해 주세요. 판매 종료 상품은 수정할 수 없어요."
            />
          ) : null}
          {record ? (
            <>
              <View
                style={{
                  padding: 18,
                  gap: 12,
                  borderRadius: 20,
                  backgroundColor: tokens.color.surface,
                }}
              >
                <T variant="heading">이야기 초안 만들기</T>
                <T variant="sub" muted>
                  {isMock
                    ? "Mock 미리보기 · 실제 AI 호출 없이 등록 정보와 입력을 구성해요."
                    : "등록 정보와 글·사진으로 상세 초안을 만들어요."}
                </T>
                <TextInput
                  accessibilityLabel="상세 생성 참고 글"
                  value={text}
                  onChangeText={(v) => {
                    setText(v);
                    setSaved(false);
                  }}
                  editable={!busy && !locked}
                  multiline
                  maxLength={3000}
                  placeholder="농가의 이야기, 과일의 특징을 적어 주세요"
                  style={[inputStyle, { minHeight: 120 }]}
                />
                <T variant="caption" muted>
                  {text.length}/3,000 · 가격·예약 날짜는 판매 설정에서 관리해요
                </T>
                {photos.map((uri, i) => (
                  <View key={uri + i} style={{ gap: 6 }}>
                    <StoryImage uri={uri} alt={"참고 사진 " + (i + 1)} />
                    <Button
                      label={"참고 사진 " + (i + 1) + " 삭제"}
                      variant="text"
                      disabled={busy}
                      onPress={() =>
                        setPhotos((p) => p.filter((_, n) => n !== i))
                      }
                    />
                  </View>
                ))}
                <Button
                  label={"참고 사진 추가 (" + photos.length + "/10)"}
                  variant="outline"
                  disabled={busy || locked || photos.length >= 10}
                  onPress={() => void pick(false)}
                />
                <Button
                  label="상세 초안 생성"
                  loading={busy}
                  disabled={locked}
                  onPress={() =>
                    content.blocks.length ? setReplace(true) : void generate()
                  }
                />
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label="내용 편집"
                  variant={preview ? "outline" : "primary"}
                  onPress={() => setPreview(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  label="미리보기"
                  variant={preview ? "primary" : "outline"}
                  onPress={() => setPreview(true)}
                  style={{ flex: 1 }}
                />
              </View>
            </>
          ) : null}
        </View>
        {record && preview ? (
          <DetailStory
            content={content}
            fallback={"intro" in record ? record.intro : record.description}
            title={record.name}
          />
        ) : record ? (
          <View style={{ paddingHorizontal: 20, gap: 16 }}>
            {content.blocks.map((b, i) => (
              <View
                key={b.id}
                style={{
                  borderWidth: 1,
                  borderColor: tokens.color.border,
                  borderRadius: 20,
                  padding: 16,
                  gap: 12,
                }}
              >
                <T variant="sub" weight="semibold">
                  {i + 1}. {b.type === "text" ? "글" : "사진"}
                </T>
                {b.type === "text" ? (
                  <>
                    <TextInput
                      accessibilityLabel={"섹션 " + (i + 1) + " 제목"}
                      value={b.title}
                      onChangeText={(title) => patch(i, { title })}
                      editable={!busy && !locked}
                      placeholder="제목"
                      maxLength={100}
                      style={inputStyle}
                    />
                    <TextInput
                      accessibilityLabel={"섹션 " + (i + 1) + " 본문"}
                      value={b.body}
                      onChangeText={(body) => patch(i, { body })}
                      editable={!busy && !locked}
                      multiline
                      placeholder="이야기를 적어 주세요"
                      maxLength={3000}
                      style={[inputStyle, { minHeight: 150 }]}
                    />
                  </>
                ) : (
                  <>
                    <StoryImage uri={b.uri} alt={b.alt} />
                    <TextInput
                      accessibilityLabel={"사진 " + (i + 1) + " 설명"}
                      value={b.alt}
                      onChangeText={(alt) => patch(i, { alt })}
                      editable={!busy && !locked}
                      placeholder="사진 설명"
                      maxLength={200}
                      style={inputStyle}
                    />
                  </>
                )}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    label="위로"
                    variant="text"
                    disabled={busy || locked || i === 0}
                    onPress={() => move(i, -1)}
                  />
                  <Button
                    label="아래로"
                    variant="text"
                    disabled={busy || locked || i === content.blocks.length - 1}
                    onPress={() => move(i, 1)}
                  />
                  <Button
                    label="삭제"
                    variant="text"
                    disabled={busy || locked}
                    onPress={() =>
                      change(content.blocks.filter((_, n) => n !== i))
                    }
                  />
                </View>
              </View>
            ))}
            <Button
              label="글 섹션 추가"
              variant="outline"
              disabled={busy || locked || content.blocks.length >= 30}
              onPress={() =>
                change([
                  ...content.blocks,
                  {
                    id: newIdempotencyKey(),
                    type: "text",
                    title: "",
                    body: "",
                  },
                ])
              }
            />
            <Button
              label="상세 사진 추가"
              variant="outline"
              disabled={busy || locked || content.blocks.length >= 30}
              onPress={() => void pick(true)}
            />
          </View>
        ) : null}
      </Scroll>
      <BottomBar>
        <Button
          label="상세 저장"
          loading={busy}
          disabled={!record || locked}
          onPress={save}
        />
      </BottomBar>
      <Sheet visible={replace} onClose={() => setReplace(false)}>
        <T variant="heading">초안을 새로 만들까요?</T>
        <T>
          현재 편집 내용은 새 초안으로 바뀌어요. 저장된 상세는 바뀌지 않아요.
        </T>
        <Button label="새로 만들기" onPress={generate} />
        <Button
          label="계속 편집하기"
          variant="outline"
          onPress={() => setReplace(false)}
        />
      </Sheet>
      <Sheet visible={!!leaving} onClose={() => setLeaving(null)}>
        <T variant="heading">저장하지 않고 나갈까요?</T>
        <T>생성·저장 중에는 완료될 때까지 기다려 주세요.</T>
        <Button
          label="나가기"
          disabled={busy}
          onPress={() => {
            const go = leaving;
            setLeaving(null);
            go?.();
          }}
        />
        <Button
          label="계속 편집하기"
          variant="outline"
          onPress={() => setLeaving(null)}
        />
      </Sheet>
    </Screen>
  );
}
