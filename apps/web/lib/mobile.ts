interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
  return capacitor?.isNativePlatform?.() === true;
}
