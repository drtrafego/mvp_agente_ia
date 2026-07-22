"use client";

import { StackProvider, StackTheme } from "@stackframe/stack";
import { stackClientApp } from "@/lib/stack-client";

export default function HandlerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StackProvider app={stackClientApp}>
      <StackTheme>
        <div className="grid min-h-dvh place-items-center px-4 py-10">
          {children}
        </div>
      </StackTheme>
    </StackProvider>
  );
}
