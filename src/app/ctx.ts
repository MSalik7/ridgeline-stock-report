/**
 * React contexts live in their own module so hot reloading a component
 * during development never creates a second copy of a context.
 */
import { createContext } from "react";
import type { AppCtx } from "./context";
import type { Dialogs } from "./dialogs/DialogProvider";

export const AppContext = createContext<AppCtx | null>(null);
export const DialogContext = createContext<Dialogs | null>(null);
