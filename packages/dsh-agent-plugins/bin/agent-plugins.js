#!/usr/bin/env node
/**
 * agent-plugins CLI — thin shell over lib/cli.js. All command logic lives in
 * the compiled lib so the host adapter and the panel can call the same
 * functions (panel toggles never shell out).
 *
 * The CLI works without a running profile: it only reads/writes the store,
 * installed.json and (M3+) the managed home-patch section; effect is applied
 * by the adapter's store watch or reconciled at next profile boot.
 */
import { main } from '../lib/cli.js'

process.exitCode = await main(process.argv.slice(2))
