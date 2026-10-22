// 생산자 화면/UI 커버리지 보고서(DEV-118). FARMCLUB_COVERAGE=1 통합 테스트가 scripts/e2e/fixtures.ts로 쌓은 캐시를 합친다.
// 범위는 Testing Documentation 2.2에 측정 전에 적은 대로: apps/producer/src의 .tsx와 브라우저 파일 고르기(pick.ts·sourceFiles.ts).
import { CoverageReport } from "monocart-coverage-reports";

const report = new CoverageReport({
  name: "Producer screens/UI coverage (DEV-118)",
  outputDir: ".artifacts/coverage/producer-ui",
  reports: ["v8", "console-summary", "json-summary"],
  sourceFilter: (path) =>
    /(^|\/)apps\/producer\/src\/(.*\.tsx|lib\/pick\.ts|lib\/sourceFiles\.ts)$/.test(path),
});
const results = await report.generate();
if (!results) {
  console.error("No coverage cache: run with FARMCLUB_COVERAGE=1 npm run test:integration:full first");
  process.exit(1);
}
console.log(`Report: ${results.reportPath}`);
