// SPDX-License-Identifier: MIT

/**
 * Calls `check` until `done` accepts its result, up to `tries` times with
 * `delayMs` between calls, and returns the last result. GitHub can take a few
 * seconds to show an app that was just created, installed or deleted.
 */
export async function poll<T>(check: () => Promise<T>, done: (value: T) => boolean, { tries = 10, delayMs = 2000 } = {}): Promise<T> {
  let value = await check();
  for (let i = 1; i < tries && !done(value); i++) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    value = await check();
  }
  return value;
}
