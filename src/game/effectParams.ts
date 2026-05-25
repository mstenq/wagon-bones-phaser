// ─── Effect param resolution (no ItemsSystem imports — safe for data/items.ts) ───

/** Resolve an effect param, using profession-specific overrides when present. */
export function resolveEffectParam<T>(params: Record<string, unknown>, key: string, professionId?: string | null): T {
  const overrides = params.professionOverrides as Record<string, Record<string, unknown>> | undefined;
  if (professionId && overrides?.[professionId]?.[key] !== undefined) {
    return overrides[professionId][key] as T;
  }
  return params[key] as T;
}

/** Resolve a [numerator, denominator] chance tuple with profession overrides. */
export function resolveChance(params: Record<string, unknown>, professionId?: string | null): [number, number] {
  return resolveEffectParam<[number, number]>(params, 'chance', professionId);
}

/** Balance counted toward Savings Account interest chunks (capped unless profession override). */
export function savingsAccountEligibleBalance(
  balance: number,
  interestCap: number,
  params: Record<string, unknown>,
  professionId?: string | null,
): number {
  const ignoreCap = resolveEffectParam<boolean>(params, 'ignoreInterestCap', professionId) ?? false;
  return ignoreCap ? balance : Math.min(balance, interestCap);
}
