import { Service, type Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { LlmError } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import type { AuthEvent, AuthInteraction, AuthPrompt } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-questions'

import { createSystemUrlOpener } from './open-url.js'
import {
  assertCallbackPortFree,
  createCodexOAuthRuntime,
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
  DEFAULT_REFRESH_BEFORE_MS,
  expiryDescription,
  type CodexOAuthRuntime,
} from './runtime.js'

export const name = 'openai-codex-oauth'
export const inject = ['commands', 'credentials', 'userQuestions']
export const OPENAI_CODEX_OAUTH_SERVICE = 'openaiCodexOAuth'

const WAIT_FOR_CALLBACK_LABEL = '等待浏览器自动返回'

export interface Config {
  oauthCredentialRef?: string
  refreshBeforeMs?: number
}

export const Config: z<Config> = z.object({
  oauthCredentialRef: z.string().role('credential-ref').default(DEFAULT_OAUTH_CREDENTIAL_REF),
  refreshBeforeMs: z.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_REFRESH_BEFORE_MS),
})

export interface OpenAICodexOAuth {
  loginBrowser(signal?: AbortSignal): Promise<void>
  logout(): Promise<void>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    openaiCodexOAuth: OpenAICodexOAuth
  }
}

interface DeviceNotice {
  controller: AbortController
  settled: Promise<void>
}

function oauthAuth() {
  const oauth = openaiCodexProvider().auth.oauth
  if (oauth === undefined) {
    throw new Error('openai-codex provider does not expose OAuth in the installed pi-ai release')
  }
  return oauth
}

function answerValue(answer: Awaited<ReturnType<Context['userQuestions']['ask']>>, id: string): string {
  const item = answer.answers.find(entry => entry.id === id)
  const custom = item?.custom?.trim()
  if (custom !== undefined && custom.length > 0) return custom
  const selected = item?.selected[0]
  if (selected !== undefined && selected.length > 0) return selected
  throw new Error('OAuth login needs an answer to continue')
}

function combinedSignal(first: AbortSignal, second: AbortSignal | undefined): AbortSignal {
  return second === undefined ? first : AbortSignal.any([first, second])
}

function promptDetail(prompt: AuthPrompt, authorizationUrl: string | undefined): string | undefined {
  const parts: string[] = []
  if (authorizationUrl !== undefined) {
    parts.push(`[打开 OpenAI 登录页](${authorizationUrl})`)
    parts.push('完成登录后，此窗口会自动关闭。浏览器没有自动返回时，可将地址栏中的完整回调地址粘贴到下方输入框。')
  }
  return parts.length === 0 ? undefined : parts.join('\n\n')
}

function localizedSelectOption(option: { id: string; label: string; description?: string }): {
  label: string
  description?: string
} {
  if (option.id === 'browser') {
    return { label: '浏览器登录', description: '在本机浏览器中完成 OpenAI 授权。' }
  }
  if (option.id === 'device_code') {
    return { label: '设备码登录', description: '适用于远程主机和无图形界面的环境。' }
  }
  return {
    label: option.label,
    ...option.description === undefined ? {} : { description: option.description },
  }
}

function promptQuestion(prompt: AuthPrompt): string {
  if (prompt.type === 'select') return '选择 OpenAI 登录方式'
  if (prompt.type === 'manual_code') return '在浏览器中完成 OpenAI 登录'
  return prompt.message
}

function waitForCallback(signal: AbortSignal): Promise<string> {
  if (signal.aborted) return Promise.reject(new Error('browser callback completed'))
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { reject(new Error('browser callback completed')) }, { once: true })
  })
}

async function answerAuthPrompt(
  ctx: Context,
  invocation: CommandInvocation,
  prompt: AuthPrompt,
  forcedMethod: string | undefined,
  authorizationUrl: string | undefined,
): Promise<string> {
  if (prompt.type === 'select' && forcedMethod !== undefined) return forcedMethod

  const id = `codex-oauth-${prompt.type}`
  const options = prompt.type === 'select'
    ? prompt.options.map(localizedSelectOption)
    : prompt.type === 'manual_code'
      ? [{
          label: WAIT_FOR_CALLBACK_LABEL,
          description: '页面会在 OAuth 回调成功后自动关闭。',
        }]
      : undefined
  const detail = promptDetail(prompt, authorizationUrl)
  const signal = combinedSignal(invocation.signal, prompt.signal)
  const answer = await ctx.userQuestions.ask({
    agent: invocation.agent,
    signal,
    questions: [{
      id,
      header: 'OpenAI 登录',
      question: promptQuestion(prompt),
      ...detail === undefined ? {} : { detail },
      ...options === undefined ? {} : { options },
    }],
  })
  const value = answerValue(answer, id)
  if (prompt.type === 'manual_code' && value === WAIT_FOR_CALLBACK_LABEL) {
    return waitForCallback(signal)
  }
  if (prompt.type !== 'select') return value
  const selected = prompt.options.find(option => localizedSelectOption(option).label === value)
  if (selected !== undefined) return selected.id
  const custom = prompt.options.find(option => option.id === value)
  if (custom !== undefined) return custom.id
  throw new Error('OAuth login method is not recognized')
}

function beginDeviceNotice(ctx: Context, invocation: CommandInvocation, event: Extract<AuthEvent, { type: 'device_code' }>): DeviceNotice {
  const controller = new AbortController()
  const signal = AbortSignal.any([invocation.signal, controller.signal])
  const expiry = event.expiresInSeconds === undefined
    ? ''
    : `\n\n授权码有效期：${event.expiresInSeconds} 秒。`
  const settled = ctx.userQuestions.ask({
    agent: invocation.agent,
    signal,
    questions: [{
      id: 'codex-device-code',
      header: 'OpenAI 设备码',
      question: '在 OpenAI 页面输入设备码，然后等待登录完成。',
      detail: `[打开 OpenAI 设备登录页](${event.verificationUri})\n\n设备码：\`${event.userCode}\`${expiry}`,
      options: [{ label: '已提交设备码', description: 'Harness 会继续轮询登录结果。' }],
    }],
  }).then(() => undefined, (error: unknown) => {
    if (!signal.aborted) {
      ctx.logger.warn(`openai-codex-oauth: device-code notice failed: ${safeInteractionError(error)}`)
    }
  })
  return { controller, settled }
}

function safeInteractionError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown interaction error'
  if (/cancel|abort/iu.test(error.message)) return 'login cancelled'
  if (/no user-questions provider/iu.test(error.message)) return 'the current Harness surface cannot show login questions'
  return 'the login interaction failed'
}

function safeLoginError(error: unknown): string {
  if (!(error instanceof Error)) return 'OpenAI OAuth 登录失败。'
  const message = error.message
  if (/cancel|abort/iu.test(message)) return 'OpenAI OAuth 登录已取消。'
  if (/device code login is not enabled/iu.test(message)) return 'OpenAI 服务器未启用设备码登录，请使用浏览器登录。'
  const status = /status\s+(\d{3})/iu.exec(message)?.[1]
  if (status !== undefined) return `OpenAI OAuth 请求失败，HTTP 状态码为 ${status}。`
  if (/state mismatch/iu.test(message)) return 'OpenAI OAuth 回调的 state 参数不匹配，请重新登录。'
  if (/Missing authorization code/iu.test(message)) return 'OpenAI OAuth 回调缺少授权码，请重新登录。'
  if (/credential/iu.test(message)) return 'Harness 凭据存储操作失败，请检查对应凭据来源是否可写。'
  if (/EADDRINUSE|1455/iu.test(message)) return '无法监听 localhost:1455，请结束占用该端口的登录或 Codex 进程后重试。'
  return 'OpenAI OAuth 登录失败，请重新运行 /codex-login。'
}

function requestedMethod(rawInput: string): string | undefined {
  const value = rawInput.trim().toLowerCase()
  if (value.length === 0) return undefined
  if (value === 'browser') return 'browser'
  if (value === 'device' || value === 'device-code' || value === 'device_code') return 'device_code'
  throw new Error('用法：/codex-login [browser|device]')
}

function createInteractiveLogin(
  ctx: Context,
  runtime: CodexOAuthRuntime,
): (invocation: CommandInvocation) => Promise<CommandResult> {
  return async (invocation) => {
    const notices: DeviceNotice[] = []
    let authorizationUrl: string | undefined
    try {
      const method = requestedMethod(invocation.rawInput)
      if (method === 'browser') await assertCallbackPortFree()
      const interaction: AuthInteraction = {
        signal: invocation.signal,
        prompt: prompt => answerAuthPrompt(ctx, invocation, prompt, method, authorizationUrl),
        notify: event => {
          if (event.type === 'auth_url') authorizationUrl = event.url
          if (event.type === 'device_code') notices.push(beginDeviceNotice(ctx, invocation, event))
          if (event.type === 'info' || event.type === 'progress') {
            ctx.logger.info(`openai-codex-oauth: ${event.message}`)
          }
        },
      }
      const credential = await runtime.loginWithInteraction(interaction)
      return {
        kind: 'success',
        text: `OpenAI Codex OAuth 登录成功。访问令牌到期时间：${expiryDescription(credential)}。`,
      }
    } catch (error: unknown) {
      return { kind: 'error', text: safeLoginError(error) }
    } finally {
      for (const notice of notices) notice.controller.abort('OAuth login settled')
      await Promise.allSettled(notices.map(notice => notice.settled))
    }
  }
}

export class OpenAICodexOAuthService extends Service implements OpenAICodexOAuth {
  static inject = ['credentials']

  constructor(ctx: Context, config: { runtime: CodexOAuthRuntime }) {
    super(ctx, OPENAI_CODEX_OAUTH_SERVICE)
    this.loginBrowser = (signal) => (
      signal === undefined ? config.runtime.loginBrowser() : config.runtime.loginBrowser(signal)
    )
    this.logout = () => config.runtime.logout()
  }

  loginBrowser: OpenAICodexOAuth['loginBrowser']
  logout: OpenAICodexOAuth['logout']
}

export function apply(ctx: Context, config: Config = {}): void {
  const oauth = oauthAuth()
  const runtime = createCodexOAuthRuntime({
    credentials: ctx.credentials,
    oauth,
    openUrl: createSystemUrlOpener(),
    oauthCredentialRef: credentialRef(config.oauthCredentialRef ?? DEFAULT_OAUTH_CREDENTIAL_REF),
    accessTokenRef: credentialRef(DEFAULT_ACCESS_TOKEN_REF),
    ...config.refreshBeforeMs === undefined ? {} : { refreshBeforeMs: config.refreshBeforeMs },
  })
  const login = createInteractiveLogin(ctx, runtime)

  ctx.plugin(OpenAICodexOAuthService, { runtime })

  ctx.commands.register({
    name: 'codex-login',
    description: '使用 ChatGPT Plus/Pro 登录 OpenAI Codex',
    input: { hint: '[browser|device]' },
    handler: login,
  })
  ctx.commands.register({
    name: 'codex-logout',
    description: '清除 OpenAI Codex OAuth 凭据',
    handler: async (invocation) => {
      if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: '用法：/codex-logout' }
      try {
        await runtime.logout()
        return { kind: 'success', text: 'OpenAI Codex OAuth 凭据已清除。' }
      } catch (error: unknown) {
        return { kind: 'error', text: safeLoginError(error) }
      }
    },
  })
  ctx.commands.register({
    name: 'codex-status',
    description: '查看 OpenAI Codex OAuth 状态',
    handler: async (invocation) => {
      if (invocation.rawInput.trim().length > 0) return { kind: 'error', text: '用法：/codex-status' }
      return { kind: 'success', text: await runtime.statusText() }
    },
  })

  ctx.on('agent/request', async ({ signal }, next) => {
    const request = await next()
    if (request.provider === 'openai-codex') await runtime.ensureAccessToken(signal)
    if (signal.aborted) {
      throw new LlmError('OpenAI Codex request was aborted before authentication completed.', 'ABORTED')
    }
    return request
  })
}

export { createSilentBrowserInteraction, hangUntilAborted } from './silent.js'
export { createSystemUrlOpener, assertHttpUrl } from './open-url.js'
export {
  createCodexOAuthRuntime,
  parseOAuthCredential,
  assertCallbackPortFree,
  DEFAULT_ACCESS_TOKEN_REF,
  DEFAULT_OAUTH_CREDENTIAL_REF,
} from './runtime.js'
export type { CodexOAuthRuntime, CodexOAuthRuntimeOptions } from './runtime.js'
export type { OpenUrl } from './open-url.js'
