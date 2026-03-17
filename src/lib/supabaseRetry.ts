/**
 * Wrapper for Supabase queries that retries on LockManager timeout errors.
 * These errors happen on mobile browsers when the auth token lock times out.
 */
export function isLockManagerError(error: any): boolean {
  const msg = error?.message || error?.toString() || "";
  return msg.includes("LockManager") || msg.includes("lock") && msg.includes("timed out");
}

export async function supabaseRetry<T>(
  queryFn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 1500,
  label = "query"
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await queryFn();
      // Check if result has an error property (Supabase query result shape)
      const r = result as any;
      if (r?.error && isLockManagerError(r.error)) {
        if (attempt < maxRetries) {
          console.warn(`[supabaseRetry] ${label}: LockManager error, retrying (${attempt + 1}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
      }
      return result;
    } catch (err) {
      lastError = err;
      if (isLockManagerError(err) && attempt < maxRetries) {
        console.warn(`[supabaseRetry] ${label}: LockManager catch, retrying (${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}
