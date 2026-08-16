import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { statSync } from "node:fs";

/**
 * Renders a document in docs/ to PDF using the Chromium that Playwright already
 * installs for the end-to-end suite — so there is no extra toolchain to set up
 * and the PDF looks exactly like the page in a browser.
 *
 *   npx tsx scripts/make-pdf.ts docs/groundwork-explained.html
 */
async function main() {
  const input = process.argv[2] ?? "docs/groundwork-explained.html";
  const source = resolve(process.cwd(), input);
  const output = source.replace(/\.html$/, ".pdf");

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });

  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `
      <div style="width:100%;font-size:8px;font-family:-apple-system,sans-serif;
                  color:#6b7570;padding:0 16mm;display:flex;justify-content:space-between">
        <span>Groundwork — WSI ALM candidate assignment</span>
        <span class="pageNumber"></span>
      </div>`,
    margin: { top: "16mm", bottom: "18mm", left: "16mm", right: "16mm" },
  });

  await browser.close();

  const kb = Math.round(statSync(output).size / 1024);
  console.log(`✓ ${output.replace(process.cwd() + "/", "")} (${kb}KB)`);
  process.exit(0);
}

main().catch((error) => {
  console.error("✗ could not render the PDF");
  console.error(error);
  process.exit(1);
});
