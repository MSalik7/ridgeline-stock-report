import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ActionError } from "@/domain/mutations";
import { buildReport, type Report } from "@/domain/report";
import type { Actor, AppState, ChangeSet, Role } from "@/domain/types";
import { commit, ReadOnlyError, useStore, type StoreState } from "./store";
import { AppContext as Ctx } from "./ctx";

const ROLE_KEY = "ridgeline-stock:role";

export interface Viewer {
  role: Role;
  supplierId: string | null;
}

export interface AppCtx {
  store: StoreState;
  data: AppState;
  report: Report;
  now: Date;
  viewer: Viewer;
  setViewer: (v: Viewer) => void;
  actor: Actor;
  /**
   * Runs a mutation and saves it. Shows the problem as a toast and returns
   * false when the action isn't allowed, so dialogs can stay open.
   */
  run: (make: (s: AppState, actor: Actor, now: Date) => ChangeSet, success?: string) => Promise<boolean>;
}


function readViewer(): Viewer {
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (raw?.startsWith("supplier:")) return { role: "supplier", supplierId: raw.slice(9) };
  } catch {
    /* ignore */
  }
  return { role: "staff", supplierId: null };
}

/** Store time is shown down to the minute, so the clock ticks every 30 s. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: (s: StoreState) => ReactNode }) {
  const store = useStore();
  const now = useNow();
  const [viewer, setViewerState] = useState<Viewer>(readViewer);

  const setViewer = useCallback((v: Viewer) => {
    setViewerState(v);
    try {
      localStorage.setItem(ROLE_KEY, v.role === "supplier" ? `supplier:${v.supplierId}` : "staff");
    } catch {
      /* ignore */
    }
  }, []);

  const actor: Actor = useMemo(
    () => ({
      role: viewer.role,
      ...(viewer.role === "supplier" && viewer.supplierId ? { supplierId: viewer.supplierId } : {}),
      userId: store.mode === "shared" ? store.viewerId : null,
    }),
    [viewer, store.mode, store.viewerId],
  );

  const report = useMemo(() => (store.data ? buildReport(store.data, now) : null), [store.data, now]);

  const run = useCallback<AppCtx["run"]>(
    async (make, success) => {
      if (!store.data) return false;
      try {
        const changes = make(store.data, actor, new Date());
        await commit(changes);
        if (success) toast.success(success);
        return true;
      } catch (e) {
        if (e instanceof ActionError || e instanceof ReadOnlyError) toast.error(e.message);
        else toast.error(e instanceof Error ? e.message : "Something went wrong. Try again.");
        return false;
      }
    },
    [store.data, actor],
  );

  if (!store.data || !report) return <>{fallback(store)}</>;

  return (
    <Ctx.Provider value={{ store, data: store.data, report, now, viewer, setViewer, actor, run }}>
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}
