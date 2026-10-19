import { test, expect } from '@playwright/test';

async function enter(page, gender) {
    await page.goto('/');
    await page.locator('label.push').filter({ hasText: new RegExp(`^${gender}$`) }).click();
    await page.getByRole('button', { name: /step in/i }).first().click();
    await page.getByRole('button', { name: /skip intro/i }).click();
    await page.locator('.check').nth(0).click();
    await page.locator('.check').nth(1).click();
    await page.getByRole('button', { name: /agree/i }).click();
    await expect(page.locator('.dash')).toBeVisible();
}

const say = async (page, text) => { await page.fill('#msg', text); await page.press('#msg', 'Enter'); };

test('two strangers match, chat, reveal, video, skip, and chat again as friends', async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    const b = await (await browser.newContext()).newPage();
    await enter(a, 'Female');
    await enter(b, 'Male');

    // Match: strangers see aliases, never names.
    await a.locator('.stepin .btn-go').click();
    await b.locator('.stepin .btn-go').click();
    await expect(a.locator('.chat')).toBeVisible();
    await expect(b.locator('.chat')).toBeVisible();
    await expect(a.locator('.chat-who-name')).not.toContainText('Guest-');

    // Messages arrive exactly as typed (no double escaping).
    await say(b, "I'm <3 you & me");
    await expect(a.locator('.msg[data-from="partner"] .bubble').last()).toContainText("I'm <3 you & me");

    // Mutual enjoy, then friend request and accept reveal names.
    await b.getByRole('button', { name: /enjoying this/i }).click();
    await a.getByRole('button', { name: /me too/i }).click();
    await a.getByRole('button', { name: /add friend/i }).click();
    await b.locator('.rail-btns .btn-lamp').click();
    await expect(a.locator('.rail')).toContainText(/friends now/i);
    await expect(b.locator('.rail')).toContainText(/friends now/i);

    // Video (fake devices): both sides get a stream.
    await a.getByRole('button', { name: /start video call/i }).click();
    await a.getByRole('button', { name: /continue/i }).click();
    await b.getByRole('button', { name: /^accept$/i }).click();
    await b.getByRole('button', { name: /continue/i }).click();
    await expect.poll(() => a.evaluate(() => [...document.querySelectorAll('.video video')].every(v => v.readyState >= 2)), { timeout: 20_000 }).toBe(true);
    await a.getByRole('button', { name: /^end$/i }).click();

    // Skip returns both to matching; feedback is offered.
    await b.getByRole('button', { name: /skip/i }).click();
    await expect(a.locator('.feedback')).toBeVisible();
    await a.getByRole('button', { name: /cancel/i }).click();
    await b.getByRole('button', { name: /cancel/i }).click();

    // Direct chat between the new friends.
    await b.locator('.friend .btn-quiet').first().click();
    await a.locator('.toast .btn').click();
    await expect(a.locator('.chat')).toBeVisible();
    await say(b, 'found you');
    await expect(a.locator('.msg[data-from="partner"]').last()).toContainText('found you');
});

test('legal pages render and the landing switches to Hindi', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /privacy notice/i })).toBeVisible();
    await page.goto('/');
    await page.getByRole('button', { name: 'हिन्दी' }).click();
    await expect(page.getByRole('button', { name: /अंदर आएँ/ }).first()).toBeVisible();
});
