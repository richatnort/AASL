// Augments Express.User so req.user is properly typed everywhere.
// Must match the shape set during passport.serializeUser/deserializeUser.
declare namespace Express {
  interface User {
    id: number;
    googleId: string;
    email: string;
    name: string | null;
    approved: boolean;
    isAdmin: boolean;
  }
}
