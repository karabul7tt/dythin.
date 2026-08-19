export const themes = {
  purple: {
    bg: '#0e0e1a',
    card: '#161622',
    border: '#1e1e2e',
    accent: '#7F77DD',
    accentLight: '#EEEDFE',
    accentText: '#AFA9EC',
    text: '#f0f0f0',
    textSub: '#666',
    tabBar: '#0e0e1a',
  },
  gold: {
    bg: '#111108',
    card: '#161610',
    border: '#2a2208',
    accent: '#C9A84C',
    accentLight: '#2a2208',
    accentText: '#e0c878',
    text: '#f0e6c8',
    textSub: '#666',
    tabBar: '#111108',
  },
  pink: {
    bg: '#fdf6f0',
    card: '#fff',
    border: '#f0ddd0',
    accent: '#D4537E',
    accentLight: '#fde8ef',
    accentText: '#993556',
    text: '#2a1520',
    textSub: '#999',
    tabBar: '#fdf6f0',
  },
  green: {
    bg: '#f5f2ec',
    card: '#fff',
    border: '#ddd8cc',
    accent: '#3B6D11',
    accentLight: '#eaf3de',
    accentText: '#27500A',
    text: '#1a2a10',
    textSub: '#888',
    tabBar: '#f5f2ec',
  },
}

export type ThemeName = keyof typeof themes
export type Theme = typeof themes.purple
