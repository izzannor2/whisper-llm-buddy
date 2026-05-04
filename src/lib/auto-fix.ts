// Generic auto-fix loop: generate → validate → fix → retry.
export interface AutoFixOptions<T> {
  maxAttempts?: number;
  generate: (prompt: string) => Promise<T>;
  fix: (prompt: string, prev: T, errors: string[]) => Promise<T>;
  validate: (out: T) => { ok: boolean; errors: string[] };
  onStatus?: (s: 'generating' | 'fixing', attempt: number) => void;
}

export async function autoFix<T>(prompt: string, opts: AutoFixOptions<T>): Promise<{ result: T; attempts: number; errors: string[] }> {
  const max = opts.maxAttempts ?? 3;
  let result: T = (await (opts.onStatus?.('generating', 1), opts.generate(prompt)));
  for (let i = 1; i <= max; i++) {
    const v = opts.validate(result);
    if (v.ok) return { result, attempts: i, errors: [] };
    if (i === max) return { result, attempts: i, errors: v.errors };
    opts.onStatus?.('fixing', i + 1);
    result = await opts.fix(prompt, result, v.errors);
  }
  return { result, attempts: max, errors: [] };
}
