"use client";
import { StackClientApp } from "@stackframe/stack";

/**
 * App do Stack Auth no client, usado só pelo StackProvider das telas de
 * /handler. Os placeholders "missing" evitam quebra de build quando as envs
 * ainda não existem; nesse caso o login simplesmente não autentica.
 */
export const stackClientApp = new StackClientApp({
  tokenStore: "nextjs-cookie",
  projectId: process.env.NEXT_PUBLIC_STACK_PROJECT_ID || "missing",
  publishableClientKey:
    process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY || "missing",
});
