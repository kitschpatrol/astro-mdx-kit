import type { ILogBasic, ILogLayer } from 'lognow'
import { createLogger, injectionHelper } from 'lognow'
import { name } from '../package.json' with { type: 'json' }

export let log = createLogger(name)

/**
 * Replace the default logger used by astro-mdx-kit with a custom one.
 *
 * Call this before the remark plugin runs to route all internal log output
 * (debug, info, warn) through your own logging infrastructure. If called
 * without arguments, resets to a fresh default logger.
 *
 * @param logger - A `LogLayer` instance for full control, or any object with
 *   `Console`-compatible `log`/`warn`/`error` methods (e.g. `console`).
 */
export function setLogger(logger?: ILogBasic | ILogLayer<unknown>) {
	log = injectionHelper(logger)
}
