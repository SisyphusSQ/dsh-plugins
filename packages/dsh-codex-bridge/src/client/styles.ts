/** Local settings styles; inherit Host typography and light/dark theme tokens. */
export const pageStyles = `
.dsh-codex-home-page {
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  width: 100%;
  max-width: 780px;
  min-width: 0;
  padding: 4px 0 20px;
  overflow-wrap: anywhere;
}
.dsh-codex-home-page * { box-sizing: border-box; }
.dsh-codex-home-page h2 { margin: 0 0 6px; font-size: 20px; font-weight: 600; }
.dsh-codex-home-page h3 { margin: 0; font-size: 14px; font-weight: 600; }
.dsh-codex-home-page p { margin: 0; }
.dsh-codex-home-page .ch-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-codex-home-page .ch-group { margin-top: 24px; }
.dsh-codex-home-page .ch-group-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.dsh-codex-home-page .ch-rows { border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; min-width: 0; }
.dsh-codex-home-page .ch-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 14px; min-width: 0; }
.dsh-codex-home-page .ch-row + .ch-row { border-top: 1px solid var(--dsw-alias-border-l2); }
.dsh-codex-home-page .ch-copy { display: grid; gap: 3px; min-width: 0; }
.dsh-codex-home-page .ch-label { font-weight: 500; }
.dsh-codex-home-page input, .dsh-codex-home-page button { font: inherit; color: inherit; }
.dsh-codex-home-page input[type="text"], .dsh-codex-home-page button {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  min-height: 34px;
  padding: 6px 10px;
}
.dsh-codex-home-page button { cursor: pointer; flex-shrink: 0; font-size: 12px; }
.dsh-codex-home-page button:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
.dsh-codex-home-page :is(input, button, summary):focus-visible { outline: 2px solid var(--dsw-alias-label-primary); outline-offset: 3px; }
.dsh-codex-home-page :is(input, button):disabled { opacity: .5; cursor: not-allowed; }
.dsh-codex-home-page .ch-switch {
  appearance: none;
  -webkit-appearance: none;
  width: 34px;
  height: 20px;
  flex: 0 0 34px;
  margin: 0;
  border: 1px solid var(--dsw-alias-label-secondary);
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  position: relative;
}
.dsh-codex-home-page .ch-switch::before {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  top: 3px;
  left: 3px;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
}
.dsh-codex-home-page .ch-switch:checked { background: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-primary); }
.dsh-codex-home-page .ch-switch:checked::before { left: 17px; background: var(--dsw-alias-bg-layer-2); }
.dsh-codex-home-page .ch-directory { display: grid; gap: 7px; padding: 12px 14px; border-top: 1px solid var(--dsw-alias-border-l2); }
.dsh-codex-home-page .ch-directory-controls { display: flex; gap: 8px; align-items: start; }
.dsh-codex-home-page .ch-directory-field { flex: 1; min-width: 0; }
.dsh-codex-home-page .ch-directory input { width: 100%; min-width: 0; }
.dsh-codex-home-page .ch-field-error { display: none; margin-top: 5px; font-size: 12px; }
.dsh-codex-home-page input:invalid:not(:disabled) + .ch-field-error { display: block; }
.dsh-codex-home-page .ch-notice { margin-top: 10px; padding-left: 10px; border-left: 2px solid var(--dsw-alias-border-l2); }
.dsh-codex-home-page .ch-notice:empty { display: none; }
.dsh-codex-home-page .ch-error, .dsh-codex-home-page .ch-field-error { color: var(--dsw-alias-state-error-primary); }
.dsh-codex-home-page .ch-error { font-size: 12px; font-weight: 500; white-space: pre-wrap; }
.dsh-codex-home-page .ch-risk { margin: 0 14px 12px; padding: 10px 0 0; border-top: 1px solid var(--dsw-alias-border-l2); }
.dsh-codex-home-page .ch-diagnostics { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; min-width: 0; }
.dsh-codex-home-page .ch-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); margin: 0; gap: 12px; }
.dsh-codex-home-page .ch-counts dt { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-codex-home-page .ch-counts dd { margin: 2px 0 0; font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; }
.dsh-codex-home-page .ch-scan { display: grid; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-codex-home-page details { min-width: 0; border-top: 1px solid var(--dsw-alias-border-l2); padding-top: 10px; }
.dsh-codex-home-page summary { cursor: pointer; font-size: 12px; font-weight: 500; }
.dsh-codex-home-page .ch-list { margin: 10px 0 0; padding-left: 20px; display: grid; gap: 10px; }
.dsh-codex-home-page .ch-list li { min-width: 0; font-size: 12px; }
.dsh-codex-home-page .ch-list p { white-space: pre-wrap; }
@media (max-width: 480px) {
  .dsh-codex-home-page .ch-row { gap: 12px; padding: 12px; }
  .dsh-codex-home-page .ch-directory-controls { flex-direction: column; align-items: stretch; }
  .dsh-codex-home-page .ch-directory-field { width: 100%; }
  .dsh-codex-home-page .ch-group-heading { align-items: flex-start; flex-wrap: wrap; }
}
@media (forced-colors: active) {
  .dsh-codex-home-page .ch-switch { appearance: auto; -webkit-appearance: auto; }
  .dsh-codex-home-page .ch-switch::before { display: none; }
}
`
