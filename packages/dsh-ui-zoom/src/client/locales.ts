/** `ui-zoom` namespace dictionaries (the settings row copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'zoom.title': '整体界面缩放',
  'zoom.description': '缩放整个界面；会话内容的字号仍在「外观 → 字号大小」单独设置',
  'zoom.unit': '%',
  'zoom.increase': '放大界面',
  'zoom.decrease': '缩小界面',
  'zoom.reset': '恢复 100%',
} satisfies Record<string, string>

/** The `ui-zoom` namespace key union. */
export type UiZoomKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'zoom.title': 'Interface zoom',
  'zoom.description': 'Scales the whole interface; conversation text size stays under Appearance → Font size',
  'zoom.unit': '%',
  'zoom.increase': 'Zoom in the interface',
  'zoom.decrease': 'Zoom out the interface',
  'zoom.reset': 'Reset to 100%',
} satisfies Record<UiZoomKey, string>
