import { chromium } from '@playwright/test';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({baseURL:'http://127.0.0.1:3138'});
const page=await context.newPage();
page.on('request',r=>{if(r.url().includes('/app')||r.url().includes('/sign-in')) console.log('REQ',r.method(),r.url(),r.headers()['x-sploot-qa-auth']?'qa':'noqa')});
page.on('response',r=>{if(r.url().includes('/app')||r.url().includes('/sign-in')) console.log('RES',r.status(),r.url(),r.headers()['location']||'')});
await page.goto('/app',{waitUntil:'domcontentloaded',timeout:75000});
console.log('FINAL',page.url()); console.log('COOKIES',JSON.stringify(await context.cookies())); console.log('BODY',(await page.locator('body').innerText()).slice(0,400)); await browser.close();