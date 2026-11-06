import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DatabaseIcon, HardDriveIcon } from "lucide-react";
import { CoffeeBackdrop, FillingCup } from "@/app/components/coffee";
import "./index.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { App } from "@/app/App";
import { initTheme } from "@/app/theme";
import { AppProvider } from "@/app/context";
import { DialogProvider } from "@/app/dialogs/DialogProvider";
import { ErrorBoundary } from "@/app/components/ErrorBoundary";
import { loadDemoIntoShared, startStore, switchToSandbox, type StoreState } from "@/app/store";

initTheme();
void startStore();

function Waiting({ store }: { store: StoreState }) {
  if (store.mode === "empty") {
    return (
      <div className="grid min-h-dvh place-items-center px-4">
        <div className="grid max-w-md gap-4 rounded-xl border bg-card p-6 text-center">
          <DatabaseIcon className="mx-auto size-6 text-muted-foreground" />
          <div>
            <h1 className="text-lg font-semibold">No shared stock data yet</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Load the demo business (Ridgeline Coffee Supply: 6 products, six months of sales, supplier orders and arrivals) into shared storage, or try it
              in a private copy first.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => switchToSandbox()}>
              <HardDriveIcon /> Private copy
            </Button>
            <Button onClick={() => void loadDemoIntoShared()}>
              <DatabaseIcon /> Load demo data
            </Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-4">
      <CoffeeBackdrop />
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground" role="status">
        <FillingCup className="size-12 text-foreground/70" />
        {store.slow ? "Shared data is slow to answer. Still trying…" : "Loading stock data…"}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider delayDuration={150}>
      <ErrorBoundary scope="app">
        <AppProvider fallback={(s) => <Waiting store={s} />}>
          <DialogProvider>
            <App />
          </DialogProvider>
        </AppProvider>
      </ErrorBoundary>
      <Toaster position="top-center" richColors closeButton />
    </TooltipProvider>
  </StrictMode>,
);
