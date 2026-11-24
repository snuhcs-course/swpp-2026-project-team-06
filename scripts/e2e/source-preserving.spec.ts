import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { apiUrl, producerUrl, apiLogin, loginProducer, monitor } from "./helpers";

// Invented source + fixed extraction response, real local worker/DB/editor. No provider calls.
const originalDate = "내년 이맘쯤에 감귤을 수확합니다.";
const confirmedDate = "2026년 12월에 감귤을 수확할 예정입니다.";
const warmCopy = "정성으로 키운 감귤을 전해요.";
const price = "선물 3kg은 30,000원입니다.";
const material = [warmCopy, originalDate, price, "서늘한 곳에 보관해 주세요."].join("\n");
function work() {
  const cwd = path.resolve("server");
  execFileSync(path.join(cwd, ".venv/bin/python"), ["-c", `
from app.source_analysis import worker
from app.ai.source_analysis import ExtractionResponse
from app.source_analysis.schemas import Extraction
mapping = {${JSON.stringify(warmCopy)}:'farmStory',${JSON.stringify(originalDate)}:'farmStory',${JSON.stringify(price)}:'composition','서늘한 곳에 보관해 주세요.':'storage'}
def reply(mode, model, chunk, targets, images, **kwargs):
 assert mode == 'mock'
 rows=[]
 for page in chunk['pages']:
  for span in page['spans']:
   text=span['text']
   if text in mapping:
    rows.append(dict(targetId=targets[0]['id'],fieldKey=mapping[text],value=text,historical=False,evidence=[dict(sourceId=chunk['sourceId'],sourceRevision=chunk['sourceRevision'],page=page['number'],spanIds=[span['id']],quote=text)]))
 return ExtractionResponse(Extraction(candidates=rows,photo_requests=[]),{'mock':True},None)
worker.extract=reply
for _ in range(100):
 if not worker.run_once(): break
`], {cwd, env:process.env, timeout:120000, stdio:"pipe"});
}

test("DEV-452 AC-SRC-2/3/5/7/11: original copy, owner dates, private save/reopen and explicit apply", async ({page, request}, info) => {
  test.skip(process.env.SOURCE_ANALYSIS_ENABLED !== "true", "Requires isolated local source stack");
  test.setTimeout(120000);
  await page.setViewportSize({width:390,height:900});
  const clean = monitor(page);
  const pid = `p-source-copy-${Date.now()}`;
  execFileSync(path.resolve("server/.venv/bin/python"), ["-c", `
import sys,copy
from sqlalchemy.engine import make_url
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.seed import PRODUCTS,CAPACITY,seed_product,seed_options_and_stages
settings=get_settings()
assert settings.app_env=='local' and settings.source_analysis_provider=='mock'
assert make_url(settings.database_url).host in ('localhost','127.0.0.1','::1')
fields,options,stages=copy.deepcopy(next(p for p in PRODUCTS if p[0]['id']=='p-house'))
fields['id']=sys.argv[1]
with get_sessionmaker()() as db,db.begin():
 seed_product(db,sys.argv[1],products=[(fields,options,stages)],capacity={sys.argv[1]:CAPACITY['p-house']})
 seed_options_and_stages(db,sys.argv[1],options,stages)
`, pid], {cwd:path.resolve("server"), env:process.env, stdio:"pipe"});
  const token = await apiLogin(request,"u-kang","producer");
  const headers={Authorization:`Bearer ${token}`};
  const key=()=>({...headers,"Idempotency-Key":crypto.randomUUID()});
  const before=await (await request.get(`${apiUrl}/api/products/${pid}`)).json();
  const opened=await request.post(`${apiUrl}/api/source-analysis/product-workspaces`,{headers:key(),data:{productId:pid,composer:true,sourceCopyEnabled:true}});
  expect(opened.ok()).toBeTruthy();const workspace=await opened.json();
  const bid=workspace.batchId, tid=workspace.targetId;
  const base=`${apiUrl}/api/source-analysis/batches/${bid}`;
  let batch=await (await request.get(base,{headers})).json();
  expect(batch.sourceCopyEnabled).toBe(true);
  const uploaded=await request.post(`${base}/sources`,{headers:key(),multipart:{batchVersion:String(batch.version),targetIds:tid,common:"false",originalPhoto:"false",file:{name:"source-copy-invented.txt",mimeType:"text/plain",buffer:Buffer.from(material)}}});
  expect(uploaded.status(),await uploaded.text()).toBe(201);
  batch=await (await request.get(base,{headers})).json();
  const run=await request.post(`${base}/runs`,{headers:key(),data:{batchVersion:batch.version}});expect(run.status()).toBe(202);
  work();
  const state=await (await request.get(`${base}/source-copy?targetId=${tid}`,{headers})).json();
  expect(state.plan.passages).toHaveLength(4);
  expect(state.plan.modules.flatMap((m:any)=>m.texts.map((t:any)=>t.value))).toContain(warmCopy);
  const date=state.plan.passages.find((p:any)=>p.originalValue===originalDate);
  const priced=state.plan.passages.find((p:any)=>p.originalValue===price);
  expect(date.reviewPending).toBe(true);expect(priced.reviewPending).toBe(true);
  expect(date.includedInDraft).toBe(true);expect(priced.includedInDraft).toBe(true);
  const draftTexts = state.plan.modules.flatMap((m:any)=>m.texts.map((t:any)=>t.value));
  expect(draftTexts).toContain(originalDate);expect(draftTexts).toContain(price);
  expect(date.reviewExplanations.length).toBeGreaterThan(0);
  await loginProducer(page,"강영수");await page.goto(`${producerUrl}/products/${pid}/detail`);
  const panel=page.getByTestId("source-copy-review");await expect(panel).toBeVisible();
  const farmAdd=page.getByRole("button",{name:"농가 이야기 추가",exact:true});if(await farmAdd.isVisible()) { await farmAdd.click(); await expect(farmAdd).not.toBeVisible(); }
  await expect(panel.getByText(/자료의 문구를 비공개 초안에 담았어요/)).toBeVisible();
  const initialSave = page.waitForResponse((r) => r.url() === `${base}/editor` && r.request().method() === "PUT");
  await page.getByRole("button",{name:"임시 저장",exact:true}).click();
  const initialResponse = await initialSave;
  expect(initialResponse.ok(), await initialResponse.text()).toBeTruthy();
  const initialBody = initialResponse.request().postDataJSON();
  expect(initialBody.targets.find((t:any)=>t.targetId===tid).enabledModuleIds).toContain("farmStory");
  await expect(page.getByText(/비공개로 저장했어요|저장했어요. 구매자에게는/)).toBeVisible();
  await page.reload();await expect(panel).toBeVisible();
  const unreviewed=await (await request.get(`${base}/source-copy?targetId=${tid}`,{headers})).json();
  expect(unreviewed.plan.modules.flatMap((m:any)=>m.texts.map((t:any)=>t.value))).toContain(originalDate);
  expect(unreviewed.plan.modules.flatMap((m:any)=>m.texts.map((t:any)=>t.value))).toContain(price);
  expect((await (await request.get(`${apiUrl}/api/products/${pid}`)).json()).moduleDetail).toEqual(before.moduleDetail);
  const card=page.getByTestId(`source-copy-passage-${date.id}-OWNER_CONFIRMATION`);
  await expect(card).toBeVisible();await card.getByRole("button",{name:"직접 수정",exact:true}).click();
  await card.getByLabel("사용할 문구",{exact:true}).fill(confirmedDate);
  await card.getByLabel("수정한 이유와 확인한 내용",{exact:true}).fill("생산자가 이번 수확 시점을 2026년 12월로 확인했습니다.");
  const priceCard=page.getByTestId(`source-copy-passage-${priced.id}-OWNER_CONFIRMATION`);
  await priceCard.getByRole("button",{name:"판매 설정에서 입력하기로 기록",exact:true}).click();
  await panel.getByRole("button",{name:"검토 선택 저장",exact:true}).click();
  await expect(panel.getByText("비공개 검토 내용을 저장했어요. 상품에 반영하려면 기존 반영 절차를 진행해 주세요.",{exact:true})).toBeVisible();
  const checked=await (await request.get(`${base}/source-copy?targetId=${tid}`,{headers})).json();
  expect(checked.plan.passages.find((p:any)=>p.originalValue===originalDate).value).toBe(confirmedDate);
  expect(checked.plan.passages.find((p:any)=>p.originalValue===price).status).toBe("EXCLUDED");
  expect((await (await request.get(`${apiUrl}/api/products/${pid}`)).json()).moduleDetail).toEqual(before.moduleDetail);
  await page.getByRole("button",{name:"임시 저장",exact:true}).click();
  await expect(page.getByText(/비공개로 저장했어요|저장했어요. 구매자에게는/)).toBeVisible();
  await page.reload();await expect(panel).toBeVisible();
  const saved=await (await request.get(`${base}/source-copy?targetId=${tid}`,{headers})).json();
  expect(saved.plan.passages.find((p:any)=>p.originalValue===originalDate).decision.action).toBe("EDIT");
  expect((await (await request.get(`${apiUrl}/api/products/${pid}`)).json()).moduleDetail).toEqual(before.moduleDetail);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByTestId(`source-copy-passage-${date.id}-OWNER_CONFIRMATION`).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath("source-copy-owner-mobile.png"),fullPage:false});
  await page.getByRole("button",{name:/^상품에 반영/}).click();
  const confirm=page.getByTestId("apply-confirm");
  await expect(confirm.getByRole("button",{name:"반영하기",exact:true})).toBeVisible();
  await confirm.getByRole("button",{name:"반영하기",exact:true}).click();
  await expect(page.getByText("상품에 반영했어요",{exact:true})).toBeVisible();
  const after=await (await request.get(`${apiUrl}/api/products/${pid}`)).json();
  const texts=JSON.stringify(after.moduleDetail);
  expect(texts).toContain(confirmedDate);expect(texts).toContain(warmCopy);expect(texts).not.toContain(originalDate);expect(texts).not.toContain("30,000");
  await page.setViewportSize({width:1365,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  clean();
});
