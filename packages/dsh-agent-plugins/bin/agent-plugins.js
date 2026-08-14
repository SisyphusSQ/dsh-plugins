#!/usr/bin/env node
/**
 * agent-plugins CLI — thin shell over the shared store/ledger library.
 *
 * M0 state: usage stub only. M1 implements install / uninstall / update /
 * enable / disable / list / doctor (including --skill/--mcp component flags)
 * by calling the same lib functions the host adapter uses, so the panel
 * toggles and the CLI never diverge.
 *
 * The CLI works without a running profile: it only reads/writes the store,
 * installed.json and the managed home-patch section; effect is applied by
 * the adapter's store watch or by reconciliation at next profile boot.
 */
const commands = ['install', 'uninstall', 'update', 'enable', 'disable', 'list', 'doctor']

const [command, ...rest] = process.argv.slice(2)

if (command === undefined || !commands.includes(command) || rest.includes('--help') || rest.includes('-h')) {
  console.log(`agent-plugins — manage Agent Plugins 1.0.0 packages for DeepSeek Harness

Usage:
  agent-plugins install <dir|zip|git-url>   validate and install into the store
  agent-plugins uninstall <name>            remove from the store (keeps PLUGIN_DATA)
  agent-plugins update [name...|--all]      re-fetch and replace by ledger source
  agent-plugins enable|disable <name>       toggle a plugin (component flags: --skill <name>|--mcp <server>)
  agent-plugins list                        list installed plugins and component states
  agent-plugins doctor                      check store, ledger and managed patch health

(M1: commands are implemented; this is the M0 stub.)
`)
  process.exit(command === undefined || !commands.includes(command) ? 1 : 0)
}

console.error(`agent-plugins: "${command}" is not implemented yet (M1)`)
process.exit(2)
