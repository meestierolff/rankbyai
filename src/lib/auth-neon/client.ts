"use client";

import { createAuthClient } from "@neon/auth/next";

/** Browser-side auth client. It talks to our own /api/auth routes, which proxy to Neon Auth. */
export const authClient = createAuthClient();
