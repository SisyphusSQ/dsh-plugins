import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const CODEX_LOGIN_NS = 'codex-login-dock' as const

export const zh = {
  'nav.label': 'Codex 订阅',
  'settings.intro': '使用 ChatGPT 订阅授权后，原生模型选择器中的 Codex 订阅才能发消息。',
  'title.signedOut': 'Codex 订阅需要登录',
  'title.authorizing': '正在等待浏览器授权',
  'title.expired': '登录已过期',
  'title.error': 'Codex 订阅登录失败',
  'title.missingPlugin': '未安装 OAuth 插件',
  'title.ready': 'Codex 订阅已连接',
  'body.signedOut': '使用 ChatGPT 订阅在系统浏览器完成授权。凭据写入 DSH credentials，不会读取 ~/.codex。',
  'body.authorizing': '请在系统浏览器中完成授权。完成后这张卡会自动消失。',
  'body.authorizingSettings': '请在系统浏览器中完成授权。完成后此页会显示已连接。',
  'body.expired': '登录已过期，请重新授权。凭据写入 DSH credentials，不会读取 ~/.codex。',
  'body.error': '浏览器登录没有完成。凭据写入 DSH credentials，不会读取 ~/.codex。',
  'body.missingPlugin': '请先安装 dsh-openai-codex-oauth。本包不会自行发起 PKCE。',
  'body.ready': '凭据已写入 DSH credentials。可以在原生模型选择器中选用 Codex 订阅。本包不会读取 ~/.codex。',
  'action.login': '打开浏览器登录',
  'action.retry': '重新登录',
  'action.cancel': '取消',
  'action.later': '稍后',
  'action.logout': '退出登录',
  'footnote.pkce': '主路径为浏览器 PKCE · 回调 localhost:1455',
  'block.reason': '登录 Codex 订阅后才能发送',
  'error.withCode': '{message}（{code}）',
} as const

export type CodexLoginLocaleKey = keyof typeof zh

export const en: Record<CodexLoginLocaleKey, string> = {
  'nav.label': 'Codex subscription',
  'settings.intro': 'Authorize with a ChatGPT subscription before Codex subscription can send from the native model selector.',
  'title.signedOut': 'Codex subscription needs sign-in',
  'title.authorizing': 'Waiting for browser authorization',
  'title.expired': 'Sign-in expired',
  'title.error': 'Codex subscription sign-in failed',
  'title.missingPlugin': 'OAuth plugin is not installed',
  'title.ready': 'Codex subscription is connected',
  'body.signedOut': 'Authorize with a ChatGPT subscription in the system browser. Credentials are stored in DSH credentials and ~/.codex is never read.',
  'body.authorizing': 'Finish authorization in the system browser. This card disappears when sign-in completes.',
  'body.authorizingSettings': 'Finish authorization in the system browser. This page shows Connected when sign-in completes.',
  'body.expired': 'Sign-in expired. Authorize again. Credentials are stored in DSH credentials and ~/.codex is never read.',
  'body.error': 'Browser sign-in did not finish. Credentials are stored in DSH credentials and ~/.codex is never read.',
  'body.missingPlugin': 'Install dsh-openai-codex-oauth first. This package does not start PKCE itself.',
  'body.ready': 'Credentials are stored in DSH credentials. Choose Codex subscription in the native model selector. This package never reads ~/.codex.',
  'action.login': 'Open browser to sign in',
  'action.retry': 'Sign in again',
  'action.cancel': 'Cancel',
  'action.later': 'Later',
  'action.logout': 'Sign out',
  'footnote.pkce': 'Browser PKCE is the primary path · callback localhost:1455',
  'block.reason': 'Sign in to Codex subscription before sending',
  'error.withCode': '{message} ({code})',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'codex-login-dock': CodexLoginLocaleKey
  }
  interface SlotMap {
    'settings.section': {
      kind: 'list'
      scope: 'root'
      owner: { close: () => void }
    }
  }
}
