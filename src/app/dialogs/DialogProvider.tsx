import { useCallback, useContext, useState, type ReactNode } from "react";
import { DialogContext as Ctx } from "../ctx";
import type { ChaseKind } from "@/domain/types";
import { NewOrderDialog, EditOrderDialog, TrackingDialog } from "./OrderDialogs";
import { ArrivalDialog, EditArrivalDialog, MatchDialog } from "./ArrivalDialogs";
import { StockChangeDialog } from "./StockChangeDialog";
import { MessageDialog } from "./MessageDialog";
import { ChaseAllDialog } from "./ChaseAllDialog";

type Open =
  | { kind: "newOrder"; productId?: string; units?: number }
  | { kind: "editOrder"; orderId: string }
  | { kind: "tracking"; orderId: string }
  | { kind: "arrival"; productId?: string; orderId?: string; units?: number }
  | { kind: "match"; arrivalId: string }
  | { kind: "editArrival"; arrivalId: string }
  | { kind: "stockChange"; productId?: string }
  | { kind: "orderMessage"; orderId: string }
  | { kind: "chase"; orderId: string; chase: ChaseKind }
  | { kind: "chaseAll" }
  | null;

export interface Dialogs {
  newOrder: (o?: { productId?: string; units?: number }) => void;
  editOrder: (orderId: string) => void;
  tracking: (orderId: string) => void;
  arrival: (o?: { productId?: string; orderId?: string; units?: number }) => void;
  match: (arrivalId: string) => void;
  editArrival: (arrivalId: string) => void;
  stockChange: (productId?: string) => void;
  orderMessage: (orderId: string) => void;
  chase: (orderId: string, chase: ChaseKind) => void;
  chaseAll: () => void;
}


export function DialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open>(null);
  const close = useCallback(() => setOpen(null), []);
  const api: Dialogs = {
    newOrder: (o) => setOpen({ kind: "newOrder", ...o }),
    editOrder: (orderId) => setOpen({ kind: "editOrder", orderId }),
    tracking: (orderId) => setOpen({ kind: "tracking", orderId }),
    arrival: (o) => setOpen({ kind: "arrival", ...o }),
    match: (arrivalId) => setOpen({ kind: "match", arrivalId }),
    editArrival: (arrivalId) => setOpen({ kind: "editArrival", arrivalId }),
    stockChange: (productId) => setOpen({ kind: "stockChange", productId }),
    orderMessage: (orderId) => setOpen({ kind: "orderMessage", orderId }),
    chase: (orderId, chase) => setOpen({ kind: "chase", orderId, chase }),
    chaseAll: () => setOpen({ kind: "chaseAll" }),
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      {open?.kind === "newOrder" && (
        <NewOrderDialog
          productId={open.productId}
          units={open.units}
          onClose={close}
          onCreated={(orderId) => setOpen({ kind: "orderMessage", orderId })}
        />
      )}
      {open?.kind === "editOrder" && <EditOrderDialog orderId={open.orderId} onClose={close} />}
      {open?.kind === "tracking" && <TrackingDialog orderId={open.orderId} onClose={close} />}
      {open?.kind === "arrival" && <ArrivalDialog productId={open.productId} orderId={open.orderId} units={open.units} onClose={close} />}
      {open?.kind === "match" && <MatchDialog arrivalId={open.arrivalId} onClose={close} />}
      {open?.kind === "editArrival" && <EditArrivalDialog arrivalId={open.arrivalId} onClose={close} />}
      {open?.kind === "stockChange" && <StockChangeDialog productId={open.productId} onClose={close} />}
      {open?.kind === "orderMessage" && <MessageDialog orderId={open.orderId} onClose={close} />}
      {open?.kind === "chase" && <MessageDialog orderId={open.orderId} chase={open.chase} onClose={close} />}
      {open?.kind === "chaseAll" && <ChaseAllDialog onClose={close} />}
    </Ctx.Provider>
  );
}

export function useDialogs(): Dialogs {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDialogs outside DialogProvider");
  return c;
}
