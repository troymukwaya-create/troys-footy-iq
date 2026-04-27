import puppeteer from 'puppeteer';
(async () => {
  try {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto('http://localhost:5173/');
    await new Promise(r => setTimeout(r, 2000));
    const text = await page.evaluate(() => document.body.innerText);
    console.log("PAGE_TEXT:\\n", text);
    await browser.close();
  } catch (err) {
    console.error("Puppeteer Error:", err);
  }
})();
