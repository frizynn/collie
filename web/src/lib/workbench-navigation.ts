import { createContext } from "react";

export interface WorkbenchNavigation {
  open: boolean;
  onOpen: () => void;
}

// The shell owns the drawer; a pane can put its trigger in the existing chat header.
export const WorkbenchNavigationContext = createContext<WorkbenchNavigation | undefined>(undefined);
