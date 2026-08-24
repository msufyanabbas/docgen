import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes so later props win over component defaults. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
