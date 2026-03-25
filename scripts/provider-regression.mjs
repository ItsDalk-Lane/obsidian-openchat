#!/usr/bin/env node

import { logger, parseArgs } from './provider-regression/shared.mjs'
import { runPR1, runPR2, runPR3, runPR4, runPR5, runPR6 } from './provider-regression/group-a.mjs'
import { runPR7, runPR8, runPR9, runPR10 } from './provider-regression/group-b.mjs'
import { runPR11, runPR12, runPR13, runPR14, runPR15, runPR16, runPR17, runPR18 } from './provider-regression/group-c.mjs'
import { runPR19, runPR20, runPR21, runPR22, runPR23 } from './provider-regression/group-d.mjs'

const CHECKS = [
	{ minPr: 1, run: runPR1 },
	{ minPr: 2, run: runPR2 },
	{ minPr: 3, run: runPR3 },
	{ minPr: 4, run: runPR4 },
	{ minPr: 5, run: runPR5 },
	{ minPr: 6, run: runPR6 },
	{ minPr: 7, run: runPR7 },
	{ minPr: 8, run: runPR8 },
	{ minPr: 9, run: runPR9 },
	{ minPr: 10, run: runPR10 },
	{ minPr: 11, run: runPR11 },
	{ minPr: 12, run: runPR12 },
	{ minPr: 13, run: runPR13 },
	{ minPr: 14, run: runPR14 },
	{ minPr: 15, run: runPR15 },
	{ minPr: 16, run: runPR16 },
	{ minPr: 17, run: runPR17 },
	{ minPr: 18, run: runPR18 },
	{ minPr: 19, run: runPR19 },
	{ minPr: 20, run: runPR20 },
	{ minPr: 21, run: runPR21 },
	{ minPr: 22, run: runPR22 },
	{ minPr: 23, run: runPR23 },
]

const main = async () => {
	const pr = parseArgs()
	for (const check of CHECKS) {
		if (pr >= check.minPr) {
			await check.run()
		}
	}
	logger.info(`PR-${pr} checks passed`)
}

try {
	await main()
} catch (error) {
	logger.error(`failed: ${error instanceof Error ? error.message : String(error)}`)
	process.exit(1)
}
