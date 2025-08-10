import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
