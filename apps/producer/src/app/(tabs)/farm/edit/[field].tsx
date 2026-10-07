// SCR-30 하위 · 프로필 항목 고치기 `/farm/edit/:field` (FEAT-02, AC-02-2, 결정 34) — design: s-30-edit. field = name | region | intro
import { farms } from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Input,
  Notice,
  Screen,
  Scroll,
  T,
  useAsync,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { useHideTabBar, useSession } from "../../../../lib/session";
import { errMsg, fieldErrors } from "../../../../lib/views";

type Field = "name" | "region" | "intro";
const META: Record<
  Field,
  {
    label: string;
    hint: string;
    multiline?: boolean;
    max: number;
    required: boolean;
  }
> = {
  name: {
    label: "농가 이름",
    hint: "소비자 앱 농가 페이지 맨 위에 보여요.",
    max: 40,
    required: true,
  },
  region: {
    label: "지역",
    hint: "농가 이름 옆에 보여요. 예: 제주 서귀포",
    max: 60,
    required: true,
  },
  intro: {
    label: "소개",
    hint: "소비자 앱 농가 페이지 이름 아래에 보여요.",
    multiline: true,
    max: 300,
    required: false,
  },
};

export default function EditFarmField() {
  useHideTabBar();
  const { field } = useLocalSearchParams<{ field: Field }>();
  const router = useRouter();
  const { toast, failToast } = useSession();
  const meta = META[field] ?? META.name;
  const farm = useAsync(() => farms.mine(), []);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (farm.data) setValue(farm.data[field] ?? "");
  }, [farm.data, field]);

  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/farm");

  async function save() {
    // 필수값이 비면 저장하지 않고 빈 칸 표시(AC-02-2)
    if (meta.required && !value.trim())
      return setError(`${meta.label}을 적어 주세요`);
    setBusy(true);
    setFailed(null);
    try {
      await farms.updateMine({ [field]: value.trim() });
      toast("저장했어요");
      back();
    } catch (e) {
      if (failToast(e, () => void save())) return; // 입력 유지
      const f = fieldErrors(e);
      if (f[field]) setError(f[field]);
      else setFailed(errMsg(e, "저장하지 못했어요. 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <HeaderBar title={meta.label} onBack={back} />
      <Scroll bottom={140}>
        {failed ? (
          <Notice
            title={failed}
            tone="error"
            style={{ marginHorizontal: 20, marginTop: 16 }}
          />
        ) : null}
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Input
            label={meta.label}
            value={value}
            onChangeText={(v) => {
              setValue(v);
              setError(null);
            }}
            multiline={meta.multiline}
            height={160}
            maxLength={meta.max}
            error={error ?? undefined}
            hint={meta.hint}
          />
          {!farm.data ? (
            <T variant="sub" muted>
              불러오는 중
            </T>
          ) : null}
        </View>
      </Scroll>
      <BottomBar>
        <Button
          label="저장"
          size="producer"
          loading={busy}
          disabled={!farm.data}
          onPress={save}
        />
      </BottomBar>
    </Screen>
  );
}
