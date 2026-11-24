/** Local-only source-guided shared-renderer harness (DEV-464). Never deploy its generated route/assets. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSourceStoryDesign } from '../packages/ui/src/sourceStoryDesign.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const routeDir = path.join(root, 'apps/consumer/src/app/source-reference-local');
const publicDir = path.join(root, 'apps/consumer/public/__source_reference');
const marker = '.dev464-owned';
const [mode, ...args] = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
const usage = 'node scripts/source-guided-reference.mjs prepare|start --fixture PRIVATE.json [--port 8094], or clean';
if (!['prepare', 'start', 'clean'].includes(mode)) throw Error(usage);
async function ownedDirectory(dir) {
  try {
    await mkdir(dir);
    await writeFile(path.join(dir, '.gitignore'), '*\n');
    await writeFile(path.join(dir, marker), 'DEV-464 local-only reference\n');
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if ((await readFile(path.join(dir, marker), 'utf8')) !== 'DEV-464 local-only reference\n') throw Error('Refusing an unowned preview directory');
  }
}
async function clean() {
  for (const dir of [routeDir, publicDir]) {
    try {
      if ((await readFile(path.join(dir, marker), 'utf8')) !== 'DEV-464 local-only reference\n') throw Error('Refusing to clean an unowned directory');
      await rm(dir, { recursive: true });
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
async function prepare() {
  const fixturePath = value('--fixture');
  if (!fixturePath) throw Error(usage);
  const fixture = JSON.parse(await readFile(path.resolve(fixturePath), 'utf8'));
  const design = getSourceStoryDesign(fixture.content?.modules ?? [], fixture.design);
  if (!design || !Array.isArray(fixture.localAssets)) throw Error('Invalid reference fixture or bounded source design');
  const expected = new Set(Object.values(design.media).map(m => m.uri));
  const assets = [];
  for (const a of fixture.localAssets) {
    if (!a || !/^[a-zA-Z0-9_-]+\.png$/.test(a.name) || !/^[a-f0-9]{64}$/.test(a.sha256) || !expected.delete(`/__source_reference/${a.name}`)) throw Error('Unexpected or duplicate local media asset');
    const file = await realpath(a.path);
    if (!(await stat(file)).isFile()) throw Error('Media must be a regular file');
    const bytes = await readFile(file);
    if (createHash('sha256').update(bytes).digest('hex') !== a.sha256) throw Error('Source crop hash mismatch');
    assets.push({ file, name: a.name });
  }
  if (expected.size) throw Error('Reference media asset missing');
  await ownedDirectory(routeDir); await ownedDirectory(publicDir);
  for (const a of assets) await copyFile(a.file, path.join(publicDir, a.name));
  await writeFile(path.join(routeDir, 'fixture.json'), JSON.stringify({ content: fixture.content, design }, null, 2) + '\n');
  const source = `import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ModuleStory } from "@farmclub/ui";
import fixture from "./fixture.json";
export default function SourceReferenceLocal() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode ?? "reference";
  let content: Parameters<typeof ModuleStory>[0]["content"] = fixture.content;
  let design: unknown = fixture.design;
  if (mode === "default") design = undefined;
  if (mode === "invalid") design = { ...fixture.design, theme: "invalid" };
  if (mode === "hidden") content = { ...content, hiddenSectionIds: ["taste"] };
  if (mode === "empty") content = { ...content, modules: [] };
  if (mode === "broken") design = { ...fixture.design, media: { ...fixture.design.media, heroFruit: { ...fixture.design.media.heroFruit, uri: "/__source_reference/missing.png" } } };
  return <ScrollView style={{ flex: 1, backgroundColor: "#E8E2D8" }}>
    <View style={{ width: "100%", maxWidth: 480, alignSelf: "center" }}>
      <View style={{ padding: 16, backgroundColor: "#FFF6E9" }}><Text style={{ fontSize: 14, lineHeight: 20, color: "#493B2D" }}>Local design reference · curated source plan · saved experimental text · human review pending</Text></View>
      <ModuleStory content={content} design={design} />
    </View>
  </ScrollView>;
}
`;
  await writeFile(path.join(routeDir, 'index.tsx'), source);
  console.log(JSON.stringify({ status: 'PREPARED_LOCAL_ONLY', media: assets.length, path: '/source-reference-local' }));
}
if (mode === 'clean') await clean();
else {
  await prepare();
  if (mode === 'start') {
    const port = Number(value('--port') ?? '8094');
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid local port');
    console.log(`Reference: http://localhost:${port}/source-reference-local (local-only)`);
    const child = spawn(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'start', '--web', '--host', 'localhost', '--port', String(port)], {
      cwd: path.join(root, 'apps/consumer'), stdio: 'inherit',
      env: { ...process.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_API_MOCK: '0', EXPO_PUBLIC_API_URL: 'http://127.0.0.1:1', EXPO_PUBLIC_CONSUMER_URL: `http://localhost:${port}`, REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1' },
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
    child.once('error', e => { console.error(e.message); process.exitCode = 1; });
    child.once('exit', code => { process.exitCode = code ?? 0; });
  }
}
