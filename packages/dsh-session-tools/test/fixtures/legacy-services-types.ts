import {
  createSessionToolDefinitions,
  defaultSessionToolsConfig,
  type SessionToolServices,
} from '../../lib/index.js'

// The six service members exposed before workingDirectory was introduced.
// This fixture is compiled, not run: both assignment and the public call must
// continue accepting that original shape without a type assertion.
type LegacyServices = Pick<SessionToolServices,
  'agents' | 'approval' | 'sessionQuery' | 'sessionReferenceResolver' | 'sessionsApi' | 'resolveAgent'>
declare const legacy: LegacyServices
const compatible: SessionToolServices = legacy
createSessionToolDefinitions(legacy, defaultSessionToolsConfig)
void compatible
