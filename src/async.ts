/** Settle promptly on cancellation even when application code ignores it. */
export function abortable<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () =>
      reject(new DOMException("Operation cancelled", "AbortError"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(value)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
