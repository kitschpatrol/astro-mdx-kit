import { log } from './log'

/**
 * Do something.
 */
export function doSomething(): string {
	log.info('Doing something...')
	return 'Something happened'
}

/**
 * Do something else.
 */
export function doSomethingElse(): string {
	log.info('Doing something else...')
	return 'Something else happened'
}

export { setLogger } from './log'
