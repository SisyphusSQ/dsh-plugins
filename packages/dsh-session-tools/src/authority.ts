import type { Agent } from '@deepseek-ai/dsh-agent'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { ApprovalOutcome, ApprovalRequest } from '@deepseek-ai/dsh-user-approval'

export interface AgentAuthorityRegistry {
  get(id: SessionId): Agent | undefined
  currentInitiator(): Agent | undefined
  roots(): Agent[]
}

export interface ApprovalRequester {
  request(request: ApprovalRequest): Promise<ApprovalOutcome>
}

export function requireRootExecution(
  _registry: AgentAuthorityRegistry,
  execution: Pick<ToolExecution, 'agent'>,
): Agent {
  const agent = execution.agent
  if (agent === undefined) throw new HarnessError('session tools require a calling agent', 'SESSION_TOOLS_AGENT_REQUIRED')
  if (_registry.get(agent.id) !== agent || agent.status !== 'running' || _registry.currentInitiator() !== agent) {
    throw new HarnessError(
      'session tools require the exact live calling agent inside its active driver',
      'SESSION_TOOLS_DRIVER_REQUIRED',
    )
  }
  if (!_registry.roots().includes(agent)) {
    throw new HarnessError('session tools are available only to root agents', 'SESSION_TOOLS_ROOT_REQUIRED')
  }
  return agent
}

export async function requireApproval(
  approval: ApprovalRequester,
  agent: Agent,
  execution: Pick<ToolExecution, 'callId' | 'name' | 'signal'>,
  reason: string,
): Promise<void> {
  const outcome = await approval.request({
    agent,
    toolName: execution.name,
    callId: execution.callId,
    reason,
    signal: execution.signal,
  })
  if (outcome !== 'allowed-once') {
    throw new HarnessError(
      `session tool approval was not granted (${outcome})`,
      `SESSION_TOOLS_APPROVAL_${outcome.toUpperCase().replace('-', '_')}`,
    )
  }
}
