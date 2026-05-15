import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { requireAdmin } from '../middleware/requireAdmin.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

// GET /admin/users — list all users with pending approvals first
adminRouter.get('/users', async (_req, res) => {
  const rows = await db
    .select({
      id:        users.id,
      email:     users.email,
      name:      users.name,
      approved:  users.approved,
      isAdmin:   users.isAdmin,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.approved), asc(users.createdAt));
  res.json(rows);
});

// PATCH /admin/users/:id/approve — approve a pending user
adminRouter.patch('/users/:id/approve', async (req, res) => {
  const id = Number(req.params['id']);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }
  const [updated] = await db
    .update(users)
    .set({ approved: true })
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email });
  if (!updated) {
    res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    return;
  }
  logger.info({ userId: id, email: updated.email }, '[ADMIN] user approved');
  res.json({ id: updated.id, approved: true });
});

// DELETE /admin/users/:id — revoke access
adminRouter.delete('/users/:id', async (req, res) => {
  const id = Number(req.params['id']);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION_ERROR' });
    return;
  }
  // Prevent self-deletion
  if (req.user?.id === id) {
    res.status(400).json({ error: 'Cannot revoke your own access', code: 'SELF_DELETE' });
    return;
  }
  const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id, email: users.email });
  if (!deleted.length) {
    res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
    return;
  }
  logger.info({ userId: id, email: deleted[0]?.email }, '[ADMIN] user deleted');
  res.status(204).send();
});
