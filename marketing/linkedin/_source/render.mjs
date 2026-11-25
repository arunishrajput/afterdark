// Renders each 1080×1350 slide of slides.html to a PNG, and all of them into one PDF (a LinkedIn document carousel).
import { chromium } from '@playwright/test';
import path from 'node:path';

const here = import.meta.dirname;
const out = path.resolve(here, '..', 'images');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(here, 'slides.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
const names = ['01-cover', '02-how-it-plays', '03-the-real-app', '04-under-the-hood', '05-trailer'];
const files = [];
for (let i = 0; i < names.length; i++) {
  const file = path.join(out, `${names[i]}.png`);
  await page.locator(`#s${i + 1}`).screenshot({ path: file });
  files.push(file);
}
// The carousel PDF: one slide per page, printed by Chromium so the text stays vector.
const pdfPage = await browser.newPage();
await pdfPage.goto('file://' + path.join(here, 'slides.html'));
await pdfPage.evaluate(() => document.fonts.ready);
await pdfPage.addStyleTag({ content: '@page { size: 1080px 1350px; margin: 0 } body { padding: 0 !important; gap: 0 !important; background: #04060c !important; display: block !important } .slide { break-after: page }' });
await pdfPage.waitForTimeout(800);
await pdfPage.pdf({ path: path.join(out, 'AfterDark-carousel.pdf'), width: '1080px', height: '1350px', printBackground: true });
await browser.close();
console.log('rendered', files.length, 'slides + PDF');
