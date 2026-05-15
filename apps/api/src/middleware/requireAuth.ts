import type { NextFunction, Request, Response } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
    return;
  }
  if (!req.user.approved) {
    res.status(403).json({ error: 'Your account is pending approval. Contact Richard.', code: 'PENDING_APPROVAL' });
    return;
  }
  next();
}
