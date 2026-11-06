// DEV-134 demo:stitch: 짧은 가짜 구간 영상(ffmpeg testsrc)을 만들어 이어 붙이고, 역할별 영상과 manifest 길이를 확인한다.
// 시스템 ffmpeg가 없으면 건너뛴다(새 의존성 없음).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ffmpeg, hasFfmpeg, probe } from "../demo/cmd/lib.mjs";
import { concatArgs, findSegments, planOutputs, stitch } from "../demo/cmd/stitch.mjs";

const mini = { iteration: "t1", order: ["p1", "a1", "c1", "p2"], segments: {} };

test("DEV-134 stitch 계획: 전체 영상은 시나리오 순서, 앱 영상은 그 역할 구간만", () => {
  assert.deepEqual(planOutputs(mini.order), [
    { name: "story.mp4", segments: ["p1", "a1", "c1", "p2"] },
    { name: "consumer.mp4", segments: ["c1"] },
    { name: "producer.mp4", segments: ["p1", "p2"] },
    { name: "admin.mp4", segments: ["a1"] },
  ]);
  assert.deepEqual(planOutputs(["p1"]).map((o) => o.name), ["story.mp4", "producer.mp4"]);
  const args = concatArgs(["a.webm", "b.mp4"], "out.mp4", { width: 320, height: 200 });
  assert.equal(args.filter((a) => a === "-i").length, 2);
  assert.match(args[args.indexOf("-filter_complex") + 1], /\[v0\]\[v1\]concat=n=2:v=1:a=0\[out\]$/);
  assert.equal(args.at(-1), "out.mp4");
});

test("DEV-134 stitch: 가짜 구간 4개(mp4·webm 섞임, 크기 다름)를 잇고 길이를 manifest에 적는다", { skip: !hasFfmpeg() && "ffmpeg not installed" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "demo-stitch-"));
  try {
    const inDir = path.join(dir, "in");
    const outDir = path.join(dir, "out");
    mkdirSync(inDir);
    const make = (name, seconds, size, codec) => {
      ffmpeg(["-f", "lavfi", "-i", `testsrc=size=${size}:rate=30:duration=${seconds}`, "-pix_fmt", "yuv420p", "-c:v", codec, path.join(inDir, name)]);
    };
    make("p1.mp4", 1, "320x200", "libx264");
    make("a1.webm", 0.5, "640x400", "libvpx");
    make("c1.mp4", 1.5, "320x200", "libx264");
    make("p2.mp4", 1, "320x200", "libx264");
    make("p9.mp4", 1, "320x200", "libx264"); // 시나리오에 없는 구간은 쓰지 않는다
    assert.deepEqual(findSegments(inDir, [...mini.order, "c9"]).missing, ["c9"]);
    assert.throws(() => stitch({ inDir, outDir, scenario: { ...mini, order: ["p1", "c9"] }, log: () => {} }), /구간 영상이 없어요: c9/);

    const m = stitch({ inDir, outDir, scenario: mini, preset: "ultrafast", log: () => {} });
    assert.equal(m.iteration, "t1");
    assert.equal(m.size, "320x200");
    const near = (got, want) => assert.ok(Math.abs(got - want) < 0.15, `${got} ≈ ${want}`);
    near(m.videos["story.mp4"].seconds, 4);
    near(m.videos["producer.mp4"].seconds, 2);
    near(m.videos["consumer.mp4"].seconds, 1.5);
    near(m.videos["admin.mp4"].seconds, 0.5);
    assert.deepEqual(m.videos["producer.mp4"].segments, ["p1", "p2"]);
    assert.equal(m.segments.a1.file, "a1.webm");
    near(m.segments.c1.start, 1.5);
    const story = probe(path.join(outDir, "story.mp4"));
    assert.equal(`${story.width}x${story.height}`, "320x200"); // 크기가 다른 구간도 첫 구간 크기로 맞춘다
    near(story.seconds, m.videos["story.mp4"].seconds);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

