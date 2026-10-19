"""DEV-88 Figma 줄 검사. 모델·네트워크 없이 결정적으로 돈다."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import figma_line

SCREEN = ["apps/producer/src/app/login.tsx"]
LINK = "https://www.figma.com/design/X8RKiRPZbFEEEwi4OhkF0G?node-id=343-5945"


def body(line):
    return f"## 이슈\nLinear DEV-88\n\n## Figma\n<!-- Figma: 반영함 — 주석 안 예시는 세지 않는다 -->\n{line}\n"


class ScreenFilesTests(unittest.TestCase):
    def test_targets(self):
        for path in ("apps/consumer/src/app/(tabs)/index.tsx", "apps/producer/src/lib/kakao.ts",
                     "packages/ui/src/tokens.ts", "scripts/admin-web/index.html",
                     "scripts/admin-web/api/farms.js"):
            with self.subTest(path=path):
                self.assertEqual(figma_line.screen_files([path]), [path])

    def test_non_targets(self):
        for path in ("server/app/main.py", "packages/api/src/client.ts", "apps/producer/tasks.md",
                     "apps/producer/app.json", "docs/spec/screens.md", "scripts/run-integration.mjs",
                     "packages/ui/src/format.test.ts", "apps/consumer/src/lib/__tests__/x.tsx"):
            with self.subTest(path=path):
                self.assertEqual(figma_line.screen_files([path]), [])


class BodyTests(unittest.TestCase):
    def test_valid_lines(self):
        cases = {
            f"Figma: 반영함 — {LINK}": "반영함",
            "Figma: 반영함 — P02 로그인 343:5945": "반영함",
            "- Figma: 해당 없음 — 로그 문구만 바꿨고 화면은 같다": "해당 없음",
            "Figma: 후속 — DEV-90": "후속",
            "Figma: 후속 - DEV-90 관리자 화면": "후속",
            "Figma:해당 없음: 타입만 정리": "해당 없음",
        }
        for line, value in cases.items():
            with self.subTest(line=line):
                self.assertEqual(figma_line.check_body(body(line))[0], value)

    def test_invalid_lines(self):
        cases = {
            "": "없다",                                  # 줄 자체가 없음(주석 안 예시만 있음)
            "Figma:": "하나가 아니다",                    # 빈 Figma 줄
            "Figma:   ": "하나가 아니다",
            "Figma: 반영함": "비어 있다",                 # 값 뒤가 빔
            "Figma: 반영함 —": "비어 있다",
            "Figma: 해당 없음 — <이유>": "비어 있다",     # 템플릿 자리표시 그대로
            "Figma: 후속 —  ": "비어 있다",
            "Figma: 반영함 — 고쳤음": "링크",             # 링크·node-id 없음
            "Figma: 후속 — 나중에": "DEV-숫자",           # 이슈 키 없음
            "Figma: 후속 — SWPP-12": "DEV-숫자",
            "Figma: 했음 — 링크": "하나가 아니다",        # 세 값 밖
            "Figma: 반영함/해당 없음/후속": "하나가 아니다",
            f"Figma: 반영함 — {LINK}\nFigma: 해당 없음 — 중복": "2개",
        }
        for line, message in cases.items():
            with self.subTest(line=line):
                with self.assertRaises(ValueError) as caught:
                    figma_line.check_body(body(line))
                self.assertIn(message, str(caught.exception))

    def test_none_body(self):
        with self.assertRaises(ValueError):
            figma_line.check_body(None)


class EvaluateTests(unittest.TestCase):
    def test_empty_figma_line_fails_when_screen_changes(self):
        ok, summary = figma_line.evaluate(body("Figma:"), SCREEN)
        self.assertFalse(ok)
        self.assertIn("FAIL", summary)
        self.assertIn("apps/producer/src/app/login.tsx", summary)

    def test_valid_line_passes(self):
        ok, summary = figma_line.evaluate(body("Figma: 후속 — DEV-90"), SCREEN + ["server/app/main.py"])
        self.assertTrue(ok)
        self.assertIn("PASS", summary)

    def test_no_screen_change_skips_even_without_line(self):
        ok, summary = figma_line.evaluate("", ["server/app/main.py", ".github/workflows/ci.yml"])
        self.assertTrue(ok)
        self.assertIn("건너뛴다", summary)


class MainTests(unittest.TestCase):
    """git test-merge 커밋과 이벤트 파일로 실제 진입점을 돌린다."""

    def run_main(self, pr_body, changed_path):
        with tempfile.TemporaryDirectory() as tmp:
            git = ["git", "-C", tmp, "-c", "user.name=t", "-c", "user.email=t@example.com"]
            subprocess.run(["git", "init", "-q", tmp], check=True)
            Path(tmp, "README.md").write_text("base\n")
            subprocess.run(git + ["add", "."], check=True)
            subprocess.run(git + ["commit", "-qm", "base"], check=True)
            target = Path(tmp, changed_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("changed\n")
            subprocess.run(git + ["add", "."], check=True)
            subprocess.run(git + ["commit", "-qm", "pr"], check=True)
            event = Path(tmp, "event.json")
            event.write_text(json.dumps({"pull_request": {"body": pr_body}}), encoding="utf-8")
            env = {**os.environ, "GITHUB_EVENT_PATH": str(event)}
            env.pop("GITHUB_STEP_SUMMARY", None)
            script = Path(__file__).with_name("figma_line.py")
            return subprocess.run([sys.executable, str(script)], cwd=tmp, env=env,
                                  capture_output=True, text=True)

    def test_main_fails_on_empty_line(self):
        result = self.run_main(body("Figma:"), "packages/ui/src/Button.tsx")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("FAIL", result.stdout)

    def test_main_passes_on_valid_line(self):
        result = self.run_main(body(f"Figma: 반영함 — {LINK}"), "packages/ui/src/Button.tsx")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_main_passes_without_screen_change(self):
        result = self.run_main(None, "server/app/main.py")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
