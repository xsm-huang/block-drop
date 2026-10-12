import type { Kind } from './game/engine';
export const palette = {
  background: '#12161C', board: '#1B222C', surface: '#252E3A', text: '#F1F5F9',
  muted: '#A8B5C5', accent: '#93C5FD', grid: '#293340', error: '#EF939D',
};
export const blockColors: Record<Kind, string> = {
  I: '#67D5E8', O: '#F1D879', T: '#B9A0EA', S: '#8BD6A0', Z: '#EF939D', J: '#8BAEF0', L: '#EFB782',
};
