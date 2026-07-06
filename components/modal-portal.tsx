"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Renderiza o conteúdo no <body>, escapando ancestrais com transform/filter
 * (ex.: .animate-fade-up) que "prendem" o position:fixed e deixam o header
 * do app por cima do modal no mobile.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
