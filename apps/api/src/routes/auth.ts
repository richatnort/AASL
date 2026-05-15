import { eq } from 'drizzle-orm';
import { Router } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { logger } from '../lib/logger.js';

export function configurePassport(): void {
  passport.use(
    new GoogleStrategy(
      {
        clientID:     process.env['GOOGLE_CLIENT_ID'] ?? '',
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
        callbackURL:  process.env['GOOGLE_CALLBACK_URL'] ?? 'http://localhost:3001/auth/google/callback',
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) return done(new Error('No email from Google profile'));

          const adminEmail = process.env['ADMIN_EMAIL'];
          const isAdminEmail = adminEmail && email.toLowerCase() === adminEmail.toLowerCase();

          const preApprovedEmails = (process.env['PRE_APPROVED_EMAILS'] ?? '')
            .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
          const isPreApproved = preApprovedEmails.includes(email.toLowerCase());

          // Upsert user — auto-approve admins and pre-approved emails
          const [user] = await db
            .insert(users)
            .values({
              googleId: profile.id,
              email,
              name: profile.displayName ?? null,
              approved: !!(isAdminEmail || isPreApproved ),
              isAdmin:  !!isAdminEmail,
            })
            .onConflictDoUpdate({
              target: users.googleId,
              // Note: approved/isAdmin are intentionally NOT refreshed on subsequent logins.
              // Admin status is set once at first login based on ADMIN_EMAIL.
              // To revoke admin: update is_admin = false directly in the DB or via /admin/users.
              set: { name: profile.displayName ?? null },
            })
            .returning();

          if (!user) return done(new Error('Failed to upsert user'));

          if (!user.approved && !isAdminEmail) {
            logger.info({ email }, '[AUTH] new pending user');
          }

          return done(null, {
            id:       user.id,
            googleId: user.googleId,
            email:    user.email,
            name:     user.name ?? null,
            approved: user.approved,
            isAdmin:  user.isAdmin,
          });
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!user[0]) return done(null, false);
      const u = user[0];
      done(null, {
        id:       u.id,
        googleId: u.googleId,
        email:    u.email,
        name:     u.name ?? null,
        approved: u.approved,
        isAdmin:  u.isAdmin,
      });
    } catch (err) {
      done(err);
    }
  });
}

export const authRouter = Router();

authRouter.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

authRouter.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/error' }),
  (req, res) => {
    if (!req.user?.approved) {
      res.redirect('/?pending=true');
    } else {
      res.redirect('/');
    }
  }
);

authRouter.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/');
  });
});

authRouter.get('/error', (_req, res) => {
  res.status(401).json({ error: 'Authentication failed', code: 'AUTH_FAILED' });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
    return;
  }
  res.json({
    id:       req.user.id,
    email:    req.user.email,
    name:     req.user.name,
    isAdmin:  req.user.isAdmin,
    approved: req.user.approved,
  });
});
