import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const alexaConfigRouter = Router();
alexaConfigRouter.use(requireAuth);

function getAlexaUrl(): string | undefined {
  return process.env['ALEXA_SERVICE_URL'];
}

// GET /api/alexa/status — proxy to alexa-lists /auth/status
alexaConfigRouter.get('/status', async (_req, res) => {
  const url = getAlexaUrl();
  if (!url) {
    res.status(503).json({ error: 'Alexa service not configured', code: 'ALEXA_UNAVAILABLE' });
    return;
  }
  try {
    const r = await fetch(`${url}/auth/status`, { signal: AbortSignal.timeout(5_000) });
    const data = await r.json() as unknown;
    res.json(data);
  } catch (err) {
    logger.warn({ err }, '[ALEXA CONFIG] status fetch failed');
    res.status(503).json({ error: 'Could not reach Alexa service', code: 'ALEXA_UNREACHABLE' });
  }
});

// POST /api/alexa/auth/refresh — trigger token refresh on the alexa-lists service
alexaConfigRouter.post('/auth/refresh', async (_req, res) => {
  const url = getAlexaUrl();
  if (!url) {
    res.status(503).json({ error: 'Alexa service not configured', code: 'ALEXA_UNAVAILABLE' });
    return;
  }
  try {
    const r = await fetch(`${url}/auth/refresh`, { method: 'POST', signal: AbortSignal.timeout(30_000) });
    const data = await r.json() as unknown;
    res.json(data);
  } catch (err) {
    logger.warn({ err }, '[ALEXA CONFIG] refresh failed');
    res.status(503).json({ error: 'Could not reach Alexa service', code: 'ALEXA_UNREACHABLE' });
  }
});

// POST /api/alexa/auth/start — start proxy-based full re-auth
alexaConfigRouter.post('/auth/start', async (_req, res) => {
  const url = getAlexaUrl();
  if (!url) {
    res.status(503).json({ error: 'Alexa service not configured', code: 'ALEXA_UNAVAILABLE' });
    return;
  }
  try {
    const r = await fetch(`${url}/auth/start`, { method: 'POST', signal: AbortSignal.timeout(5_000) });
    const data = await r.json() as unknown;
    res.json(data);
  } catch (err) {
    logger.warn({ err }, '[ALEXA CONFIG] auth start failed');
    res.status(503).json({ error: 'Could not reach Alexa service', code: 'ALEXA_UNREACHABLE' });
  }
});
