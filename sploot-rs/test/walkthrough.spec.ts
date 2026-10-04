import { createPrivateKey } from "node:crypto";
import fs from "node:fs";
import { devices, expect, test, type Page, type Response } from "@playwright/test";
import { signJwt } from "../dev/jwt.mjs";

const issuer = "http://127.0.0.1:8787";
const login = "http://127.0.0.1:8789";
const iphone = devices["iPhone 14"];
const saved = JSON.parse(fs.readFileSync(new URL("../dev/.stub-key.json", import.meta.url), "utf8"));
const privateKey = createPrivateKey({ key: saved.pem, format: "pem" });

function mint(email: string, seconds: number) {
  return signJwt(privateKey, saved.jwk, { iss: issuer, aud: "sploot-rs-local", email, seconds });
}

function chain(response: Response | null) {
  const urls: string[] = [];
  let request = response?.request();
  while (request) {
    urls.push(request.url());
    request = request.redirectedFrom();
  }
  return urls.reverse();
}

async function layout(page: Page) {
  const tap = page.locator("button, a.btn").first();
  const box = await tap.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  const reading = await page.locator("body").evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  expect(reading).toBeGreaterThanOrEqual(16);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth);
  expect(overflow).toBe(true);
}

test("installed shell", async ({ browser }) => {
  test.setTimeout(180_000);
  const steps: { story: string; step: string; pass: boolean; shot: string }[] = [];
  const context = await browser.newContext({
    viewport: iphone.viewport,
    deviceScaleFactor: iphone.deviceScaleFactor,
    isMobile: iphone.isMobile,
    hasTouch: iphone.hasTouch,
    userAgent: iphone.userAgent,
    recordVideo: { dir: "evidence-out", size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const video = page.video();

  async function shot(story: string, step: string, file: string) {
    await page.screenshot({ path: `evidence-out/${file}` });
    steps.push({ story, step, pass: true, shot: file });
  }

  try {
    const absent = await page.goto(`${issuer}/`);
    expect(chain(absent)).toHaveLength(2);
    expect(page.url()).toContain("/cdn-cgi/access/login");
    expect(absent?.status()).toBe(200);
    await shot("install / sign-in", "absent session prompts once", "s0-01-signed-out-login.png");

    await page.getByRole("link", { name: "demo@sploot.test" }).click();
    await page.waitForURL(/127\.0\.0\.1:8787\/?$/);
    await expect(page.getByText("signed in as demo@sploot.test")).toBeVisible();
    await expect(page.getByText("Nothing saved yet.")).toBeVisible();
    await expect(page.locator(".tag")).toHaveText("LOCAL");
    await shot("sign-in", "shell shows the demo owner", "s0-01-shell.png");

    await context.clearCookies();
    await context.addCookies([{ name: "CF_Authorization", value: mint("demo@sploot.test", 3600), url: issuer, httpOnly: true, sameSite: "Lax" }]);
    let sawLogin = false;
    const watch = (url: string) => {
      if (url.startsWith(login) || url.includes("/cdn-cgi/access/login")) sawLogin = true;
    };
    page.on("request", (request) => watch(request.url()));
    await page.goto(`${issuer}/`);
    expect(sawLogin).toBe(false);
    await expect(page.getByText("signed in as demo@sploot.test")).toBeVisible();
    await shot("install", "inherited session opens the shell", "s0-01-inherited.png");

    const manifest = await page.request.get(`${issuer}/manifest.webmanifest`);
    expect(manifest.status()).toBe(200);
    expect((await manifest.json()).display).toBe("standalone");
    await page.goto(`${issuer}/icons/icon-512.png`);
    await shot("install", "public icon", "s0-02-icon.png");

    const relaunch = await context.newPage();
    await relaunch.goto(`${issuer}/`);
    await expect(relaunch.getByText("signed in as demo@sploot.test")).toBeVisible();
    await relaunch.screenshot({ path: "evidence-out/s0-03-relaunch.png" });
    steps.push({ story: "relaunch", step: "second page skips login", pass: true, shot: "s0-03-relaunch.png" });
    await relaunch.close();
    await page.goto(`${issuer}/`);

    await context.clearCookies();
    await context.addCookies([{ name: "CF_Authorization", value: mint("demo@sploot.test", 15), url: issuer, httpOnly: true, sameSite: "Lax" }]);
    await page.waitForTimeout(16_000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("#expired")).toBeVisible();
    await expect(page.locator("#denied")).toBeHidden();
    await shot("expiry", "banner offers sign in", "s0-04-expired.png");
    await page.locator("#sign-in").click();
    await page.waitForURL(/\/cdn-cgi\/access\/login/);
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/cdn-cgi/access/login");
    await page.getByRole("link", { name: "demo@sploot.test" }).click();
    await page.waitForURL(/127\.0\.0\.1:8787\/?$/);

    await context.setOffline(true);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("#offline")).toBeVisible();
    await shot("offline", "banner says offline", "s0-04-offline.png");
    await context.setOffline(false);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("#offline")).toBeHidden();

    await context.clearCookies();
    await context.addCookies([{ name: "CF_Authorization", value: mint("unmapped@sploot.test", 3600), url: issuer, httpOnly: true, sameSite: "Lax" }]);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator("#denied")).toBeVisible();
    await expect(page.locator("#expired")).toBeHidden();
    expect(page.url()).not.toContain("/cdn-cgi/access/login");
    await page.waitForTimeout(1000);
    expect(page.url()).not.toContain("/cdn-cgi/access/login");

    const forbidden = await page.goto(`${issuer}/`);
    expect(forbidden?.status()).toBe(403);
    expect(await page.locator("script").count()).toBe(0);
    await expect(page.getByText("This account isn't on the allowlist.")).toBeVisible();
    await page.waitForTimeout(1500);
    expect(page.url()).not.toContain("/cdn-cgi/access/login");
    await shot("allowlist", "403 page does not return to login", "s0-05-forbidden.png");
    await page.getByRole("link", { name: "[ sign out ]" }).click();
    await page.waitForURL(/\/cdn-cgi\/access\/login/);

    await page.getByRole("link", { name: "demo@sploot.test" }).click();
    await page.waitForURL(/127\.0\.0\.1:8787\/?$/);
    await page.goto(`${login}/evil`);
    await page.waitForLoadState("load");
    await page.goto(`${issuer}/`);
    await expect(page.getByText("signed in as demo@sploot.test")).toBeVisible();
    await shot("csrf", "cross-site logout leaves the session", "s0-06-still-signed-in.png");
    await page.getByRole("button", { name: "[ sign out ]" }).click();
    await page.waitForURL(/\/cdn-cgi\/access\/login/);
    await shot("sign out", "login after sign out", "s0-06-signed-out.png");
    await page.getByRole("link", { name: "demo@sploot.test" }).click();
    await page.waitForURL(/127\.0\.0\.1:8787\/?$/);
    await expect(page.getByText("signed in as demo@sploot.test")).toBeVisible();
    await shot("sign in", "signed in again", "s0-06-signed-in-again.png");

    await page.goto(`${issuer}/healthz`);
    await expect(page.getByText('"status":"ok"')).toBeVisible();
    await shot("health", "public healthz", "s0-07-healthz.png");
    await page.goto(`${issuer}/`);

    for (const width of [375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await layout(page);
      if (width !== 390) await shot("layout", `${width}px fits`, `s0-08-${width}.png`);
    }
  } finally {
    const passed = steps.filter((step) => step.pass).length;
    const lines = [
      "# S0 walkthrough",
      "",
      "WebKit, 390×844, device scale 3, iPhone 14 user agent. Local Access stub only.",
      "",
      "| Story | Step | Result | Screenshot |",
      "| --- | --- | --- | --- |",
      ...steps.map((step) => `| ${step.story} | ${step.step} | ${step.pass ? "pass" : "fail"} | ${step.shot} |`),
      "",
      "## Friction",
      "",
      "- The login list is the local stub on the app origin, so sign-out can redirect without leaving `form-action`. Port 8789 only hosts the cross-site form.",
      "- An inherited session is a CF_Authorization cookie set before navigation. A real iPhone can copy Safari's cookie into the installed app, so the first standalone launch must not be assumed to prompt.",
      "- Expiry uses a 15 second stub session, then one reload into the login page.",
      "- The allowlist page signs out with the Access logout link. It does not reload into login.",
      "- The cross-site form is on the stub login origin. SameSite=Lax keeps the cookie off that POST.",
      "- Home Screen install, safe areas on a real notch, and a 15 minute Access session are Phaedrus's check.",
      "",
      `${passed} recorded steps.`,
      "",
    ];
    fs.mkdirSync("evidence-out", { recursive: true });
    fs.writeFileSync("evidence-out/walkthrough.md", lines.join("\n"));
    await context.close();
    await video?.saveAs("evidence-out/walkthrough.webm");
  }
});
