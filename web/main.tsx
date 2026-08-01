import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { I18nProvider } from "@/hooks/useI18n";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <Suspense>
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  </Suspense>,
);
