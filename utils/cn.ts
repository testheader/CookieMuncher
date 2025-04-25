// utils/cn.ts
import { twMerge } from 'tailwind-merge';

export function cn(...classes: any[]) {
  return twMerge(...classes);
}
