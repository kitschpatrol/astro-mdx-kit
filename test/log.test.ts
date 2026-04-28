import { afterEach, describe, expect, it, vi } from 'vitest'
import { log, setLogger } from '../src/log'

afterEach(() => {
	// Reset to a fresh default logger after each test so cross-test state
	// doesn't leak through the live binding.
	setLogger()
})

describe('setLogger', () => {
	it('routes warn() through a console-shaped logger', () => {
		const sink = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			trace: vi.fn(),
			warn: vi.fn(),
		}

		setLogger(sink)
		log.warn('hello from test')

		expect(sink.warn).toHaveBeenCalled()
	})

	it('routes info() through a console-shaped logger', () => {
		const sink = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			trace: vi.fn(),
			warn: vi.fn(),
		}

		setLogger(sink)
		log.info('info message')

		expect(sink.info).toHaveBeenCalled()
	})

	it('restores a default logger when called with no argument', () => {
		const sink = {
			debug: vi.fn(),
			error: vi.fn(),
			info: vi.fn(),
			trace: vi.fn(),
			warn: vi.fn(),
		}

		setLogger(sink)
		setLogger()
		log.warn('after reset')

		expect(sink.warn).not.toHaveBeenCalled()
	})
})
