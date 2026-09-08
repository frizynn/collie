import { createContext } from "react";

export const FilePreviewContext = createContext<((path: string) => void) | null>(null);
