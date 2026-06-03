// cn — tiny className helper around clsx for conditional/merged class lists.

import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
