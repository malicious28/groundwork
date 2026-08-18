import { chromium } from "@playwright/test";
import { resolve } from "node:path";

/**
 * Draws the master tracker screenshot fixture.
 *
 * The demo needs a real screenshot because reading one is a distinct capability
 * — a spreadsheet nobody exports is exactly the kind of evidence a client
 * actually sends, and it has to survive the same citation check as a transcript.
 * Generating it here rather than committing a photograph keeps it honest about
 * what it is, and keeps it consistent with the rest of the Nova story: the same
 * projects, the same people, the same stale dates the calls complain about.
 */

const HTML = `<!doctype html>
<meta charset="utf-8">
<style>
  body { margin: 0; font: 13px -apple-system, "Segoe UI", sans-serif; background: #fff; }
  .bar { background: #1e6f5c; color: #fff; padding: 8px 12px; font-size: 12px; font-weight: 600; }
  .tabs { display: flex; gap: 0; border-bottom: 1px solid #c9ccc7; background: #f1f3ef; font-size: 11px; }
  .tabs div { padding: 5px 10px; border-right: 1px solid #c9ccc7; color: #444; }
  .tabs .on { background: #fff; font-weight: 600; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #eef1ed; text-align: left; font-size: 11px; padding: 6px 8px; border: 1px solid #d5d8d3; }
  td { padding: 5px 8px; border: 1px solid #e2e5e0; font-size: 12px; }
  .amber { background: #fff2cc; }
  .red { background: #fbdad5; }
  .empty { background: #fafafa; }
  .foot { padding: 6px 10px; font-size: 11px; color: #666; }
</style>
<div class="bar">Nova Master Tracker 2026.xlsx &nbsp;·&nbsp; Shared drive &nbsp;·&nbsp; Last saved by Priya 11 days ago</div>
<div class="tabs">
  <div class="on">Kharadi 3BHK</div><div>Baner Duplex</div><div>Wakad Office</div>
  <div>Viman Nagar 2BHK</div><div>Hinjewadi Villa</div><div>+ 11 more</div>
</div>
<table>
  <tr>
    <th style="width:26%">Stage</th><th style="width:16%">Owner</th>
    <th style="width:14%">Planned</th><th style="width:14%">Actual</th>
    <th style="width:16%">Payment stage</th><th style="width:14%">Client told?</th>
  </tr>
  <tr><td>Design sign-off</td><td>Sameer</td><td>02-Feb</td><td>09-Feb</td><td>Advance received</td><td>Yes</td></tr>
  <tr><td>Site prep &amp; demolition</td><td>Site team</td><td>16-Feb</td><td>21-Feb</td><td>—</td><td>Yes</td></tr>
  <tr><td>Carpentry — modular</td><td>Sameer</td><td>08-Mar</td><td class="amber">delayed</td><td>Milestone 2 due</td><td class="amber">?</td></tr>
  <tr class="red"><td>Hardware delivery (Hettich)</td><td>Deshmukh Traders</td><td>14-Mar</td><td class="red">not delivered</td><td>—</td><td class="red">No</td></tr>
  <tr><td>Plywood delivery</td><td>Sharma Timber</td><td>18-Mar</td><td>18-Mar</td><td>—</td><td>Yes</td></tr>
  <tr class="empty"><td>False ceiling</td><td class="empty"></td><td>25-Mar</td><td class="empty"></td><td class="empty"></td><td class="empty"></td></tr>
  <tr class="empty"><td>Painting</td><td class="empty"></td><td>02-Apr</td><td class="empty"></td><td class="empty"></td><td class="empty"></td></tr>
  <tr class="empty"><td>Handover</td><td class="empty"></td><td>15-Apr</td><td class="empty"></td><td>Final 10% due</td><td class="empty"></td></tr>
</table>
<div class="foot">Rows 9–41 hidden &nbsp;·&nbsp; 16 project tabs &nbsp;·&nbsp; no formulas on this sheet</div>`;

async function main() {
  const out = resolve(process.cwd(), "fixtures/nova-interiors/master-tracker-screenshot.png");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 420 } });
  await page.setContent(HTML, { waitUntil: "load" });
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(`✓ wrote ${out}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
