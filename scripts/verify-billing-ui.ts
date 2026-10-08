// Isolated visual/component check using synthetic data only. No production login.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { loadScribeReadiness } from "../src/lib/billing-readiness";
import { renderBillingReadiness } from "../src/lib/billing-readiness-html";

async function main() {
  const patientId = "00000000-0000-4000-8000-000000000001";
  const data = {
    patient: { id: patientId, name: "Musterpatientin Beispiel" }, patientArt: "privat",
    positionen: [{ goz_nr: "6100", bezeichnung: "Testleistung – nur Beispieldaten", faktor: 2.3,
      anzahl: 1, preis: 21.34, gkv_abzug: 0, endpreis: 21.34, begruendung: "", datum: "2026-07-05", region: "11" }],
    gesamtEndpreis: 21.34, gesamtGKV: 0, gesamtBrutto: 21.34, ratenAnzahl: 1,
    rateProMonat: 21.34, startDatum: "2026-10-08", paketName: "Testentwurf",
  };
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './src/app/(dashboard)/rechnungen/vorschau/page'; createRoot(document.getElementById('root')).render(<Page/>);`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "isolate-navigation-and-theme", setup(builder) {
      builder.onResolve({ filter: /^(next\/link|@\/hooks\/useAppStore)$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ resolveDir: process.cwd(), loader: "jsx", contents: args.path === "next/link"
        ? `import React from 'react'; export default function Link(props){return <a {...props}/>;}`
        : `export const useAppStore=()=>({theme:window.__billingTheme||'light',locale:'de'});` }));
    } }],
  });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const [name, width, height] of [["desktop", 1440, 1100], ["mobile", 390, 844]] as const) {
      const page = await browser.newPage({ viewport: { width, height } });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => route.request().url().startsWith("https://billing-test.invalid/")
        ? route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="de"><body style="margin:20px;font-family:Arial"><div id="root"></div></body></html>' })
        : route.abort());
      await page.goto("https://billing-test.invalid/");
      await page.evaluate((value) => sessionStorage.setItem("ac-rechnung-preview", JSON.stringify(value)), data);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.locator(".draft-notice").waitFor();
      assert.match(await page.locator("#invoice").innerText(), /RECHNUNGSENTWURF/);
      assert.match(await page.locator("#invoice").innerText(), /Noch nicht vergeben/);
      assert.match(await page.locator("#invoice").innerText(), /05\.07\.26/);
      assert.doesNotMatch(await page.locator("#invoice").innerText(), /Bitte überweisen/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator(".draft-notice").evaluate((el) => getComputedStyle(el).fontSize), "16px");
      await page.screenshot({ path: `output/billing-draft-${name}.png`, fullPage: true });
      await page.emulateMedia({ media: "print" });
      assert.equal(await page.locator(".draft-notice").isVisible(), true);
      assert.equal(await page.getByRole("button", { name: "Entwurf drucken" }).isVisible(), false);
      await page.emulateMedia({ media: "screen" });
      const result = await loadScribeReadiness(patientId, "2026-07-01", "2026-09-30", async () => [{
        id: "fixture", patient_id: patientId, version: 1, termin_datum: "2026-07-05",
        status: "bestaetigt", bestaetigt_am: "2026-07-05T12:00:00Z",
        positionen: [{ code: "BEMA 119/120", text: "Testleistung", anzahl: 1 }],
      }]);
      await page.setContent(renderBillingReadiness({ id: patientId, name: "Musterpatientin Beispiel" }, result, "de"));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByText("Was diese Prüfung abdeckt").click();
      assert.equal(await page.getByText(/Ein bestätigter Behandlungstext/).isVisible(), true);
      await page.screenshot({ path: `output/billing-preflight-${name}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("Billing UI: desktop, mobile, print safeguards and preflight details passed (synthetic isolated components).");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
