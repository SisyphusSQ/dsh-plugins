declare module '@deepseek-ai/dsh-client-ui-input-trigger/client' {
  export class InputTriggerController {
    track(
      draft: string,
      caret: number,
      guard: { readonly tier: 'plain' | 'claimed' | 'frozen' },
      draftRev: number,
    ): void;
  }
}
