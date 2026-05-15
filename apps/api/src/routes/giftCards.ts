import { isIP } from 'net';
import { GiftCardSchema } from '@shopping-list/shared';
import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { giftCards } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const giftCardsRouter = Router();
giftCardsRouter.use(requireAuth);

// Reject URLs that resolve to internal/private hosts (SSRF guard)
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;
  if (isIP(h) === 4) {
    const [a, b] = h.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  return false;
}

function assertSafeUrl(raw: string): void {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL must use http or https');
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error('URL resolves to a private/internal address');
  }
}

// Columns returned to the client — credentials are deliberately excluded from list/detail responses
const safeColumns = {
  id:              giftCards.id,
  name:            giftCards.name,
  categoryKey:     giftCards.categoryKey,
  balanceCheckUrl: giftCards.balanceCheckUrl,
  lastBalance:     giftCards.lastBalance,
  lastCheckedAt:   giftCards.lastCheckedAt,
} as const;

// GET /api/gift-cards — list all (credentials omitted)
giftCardsRouter.get('/', async (_req, res) => {
  const rows = await db.select(safeColumns).from(giftCards);
  res.json(rows);
});

// POST /api/gift-cards — create
giftCardsRouter.post('/', async (req, res) => {
  const parsed = GiftCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  try {
    assertSafeUrl(parsed.data.balanceCheckUrl);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
    return;
  }
  const [inserted] = await db.insert(giftCards).values(parsed.data).returning(safeColumns);
  res.status(201).json(inserted);
});

// PATCH /api/gift-cards/:id — update
giftCardsRouter.patch('/:id', async (req, res) => {
  const id = Number(req.params['id']);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }
  const parsed = GiftCardSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' });
    return;
  }
  if (parsed.data.balanceCheckUrl) {
    try {
      assertSafeUrl(parsed.data.balanceCheckUrl);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
      return;
    }
  }
  const [updated] = await db.update(giftCards).set(parsed.data).where(eq(giftCards.id, id)).returning(safeColumns);
  if (!updated) {
    res.status(404).json({ error: 'Gift card not found', code: 'NOT_FOUND' });
    return;
  }
  res.json(updated);
});

// DELETE /api/gift-cards/:id — remove
giftCardsRouter.delete('/:id', async (req, res) => {
  const id = Number(req.params['id']);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }
  const deleted = await db.delete(giftCards).where(eq(giftCards.id, id)).returning({ id: giftCards.id });
  if (!deleted.length) {
    res.status(404).json({ error: 'Gift card not found', code: 'NOT_FOUND' });
    return;
  }
  res.status(204).send();
});

// GET /api/gift-cards/:id/balance — fetch balance from prepaytec
giftCardsRouter.get('/:id/balance', async (req, res) => {
  const id = Number(req.params['id']);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }

  // Fetch the full row (including credentials) for the balance check — server-side only
  const [card] = await db.select().from(giftCards).where(eq(giftCards.id, id)).limit(1);
  if (!card) {
    res.status(404).json({ error: 'Gift card not found', code: 'NOT_FOUND' });
    return;
  }

  // SSRF guard — re-validate the stored URL before making an outbound request
  try {
    assertSafeUrl(card.balanceCheckUrl);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message, code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    // Step 1: GET the balance check page to extract the CSRF nonce and session cookies
    const pageRes = await fetch(card.balanceCheckUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });
    const html = await pageRes.text();

    // Early return: direct balance page (prepaytec be.do with encoded card in URL).
    // These pages return the balance on GET with no form submission required.
    if (html.includes('BELBalanceValue')) {
      const directMatch = html.match(/[£$€]\s*([\d,]+(?:\.\d{1,2})?)/);
      if (directMatch) {
        const balance = `£${directMatch[1]!.replace(/,/g, '')}`;
        const checkedAt = new Date();
        await db.update(giftCards)
          .set({ lastBalance: balance, lastCheckedAt: checkedAt })
          .where(eq(giftCards.id, id));
        res.json({ balance, checkedAt: checkedAt.toISOString() });
        return;
      }
      logger.warn({ cardId: id }, '[GIFT CARD] BELBalanceValue found but no currency amount — cannot parse balance');
      res.status(502).json({ error: 'Balance page loaded but amount could not be parsed', code: 'SCRAPE_ERROR' });
      return;
    }

    // Capture session cookies from GET response — required for POST (server uses JSESSIONID)
    const setCookies: string[] = (pageRes.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const cookieHeader = setCookies.map((c: string) => c.split(';')[0]).join('; ');

    // Step 2: Extract CSRF nonce from the form action attribute
    const nonceMatch = html.match(/CSRF_NONCE=([A-F0-9]+)/i);
    if (!nonceMatch) {
      logger.warn({ cardId: id }, '[GIFT CARD] Could not extract CSRF nonce');
      res.status(502).json({ error: 'Could not extract CSRF token from balance page', code: 'SCRAPE_ERROR' });
      return;
    }

    // Step 3: Build the POST action URL — the form action is a relative URL that strips all
    // original query params, so we use only origin+pathname and add just the fresh nonce
    const base = new URL(card.balanceCheckUrl);
    const actionUrl = new URL(`${base.origin}${base.pathname}`);
    actionUrl.searchParams.set('org.apache.catalina.filters.CSRF_NONCE', nonceMatch[1]!);

    // Step 4: POST form data (card number + PIN) — credentials never leave the server
    const formData = new URLSearchParams({
      panDecrypted: card.cardNumber,
      pin: card.pin,
    });
    const postRes = await fetch(actionUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': ua,
        'Referer': card.balanceCheckUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Origin': new URL(card.balanceCheckUrl).origin,
        ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const resultHtml = await postRes.text();

    // Step 5: Parse balance from response HTML — prepaytec shows "£X.XX"
    const balanceMatch = resultHtml.match(/[£$€]\s*([\d,]+\.?\d{0,2})/);
    if (!balanceMatch) {
      logger.warn({ cardId: id }, '[GIFT CARD] Balance not found in response — possible reCAPTCHA block');
      res.status(502).json({ error: 'Balance not found in response — reCAPTCHA may be blocking', code: 'SCRAPE_ERROR' });
      return;
    }

    const balance = `£${balanceMatch[1]}`;

    // Step 6: Cache the result
    await db.update(giftCards)
      .set({ lastBalance: balance, lastCheckedAt: new Date() })
      .where(eq(giftCards.id, id));

    res.json({ balance, checkedAt: new Date().toISOString() });

  } catch (err) {
    logger.error({ err, cardId: id }, '[GIFT CARD] Balance check failed');
    res.status(503).json({ error: 'Failed to reach balance check service', code: 'BALANCE_CHECK_ERROR' });
  }
});
