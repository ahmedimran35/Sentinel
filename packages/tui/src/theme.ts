export interface Theme {
  brand: string;
  user: string;
  text: string;
  dim: string;
  muted: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  diffAdd: string;
  diffDel: string;
  diffAddBg: string;
  diffDelBg: string;
  border: string;
  borderFocus: string;
  modeBadge: { plan: string; build: string; auto: string; yolo: string };
  syntax: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
    type: string;
  };
}

export const darkTheme: Theme = {
  brand: '#d4a76a',
  user: '#6a9fb5',
  text: '#e0e0e0',
  dim: '#888888',
  muted: '#555555',
  success: '#7ecf7e',
  warning: '#e5c07b',
  error: '#e06c75',
  info: '#61afef',
  diffAdd: '#98c379',
  diffDel: '#e06c75',
  diffAddBg: '#2d3d2d',
  diffDelBg: '#3d2d2d',
  border: '#444444',
  borderFocus: '#d4a76a',
  modeBadge: { plan: '#61afef', build: '#98c379', auto: '#e5c07b', yolo: '#e06c75' },
  syntax: {
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    comment: '#5c6370',
    function: '#61afef',
    type: '#e5c07b',
  },
};

export const lightTheme: Theme = {
  brand: '#c97e2e',
  user: '#3a7fa5',
  text: '#2c2c2c',
  dim: '#8a8a8a',
  muted: '#bbbbbb',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3',
  diffAdd: '#2e7d32',
  diffDel: '#c62828',
  diffAddBg: '#e8f5e9',
  diffDelBg: '#ffebee',
  border: '#cccccc',
  borderFocus: '#c97e2e',
  modeBadge: { plan: '#2196f3', build: '#4caf50', auto: '#ff9800', yolo: '#f44336' },
  syntax: {
    keyword: '#9c27b0',
    string: '#2e7d32',
    number: '#e65100',
    comment: '#9e9e9e',
    function: '#1565c0',
    type: '#f57f17',
  },
};

export const gruvboxTheme: Theme = {
  brand: '#d79921',
  user: '#83a598',
  text: '#ebdbb2',
  dim: '#a89984',
  muted: '#665c54',
  success: '#b8bb26',
  warning: '#fabd2f',
  error: '#fb4934',
  info: '#83a598',
  diffAdd: '#b8bb26',
  diffDel: '#fb4934',
  diffAddBg: '#3c3836',
  diffDelBg: '#3c3836',
  border: '#504945',
  borderFocus: '#d79921',
  modeBadge: { plan: '#83a598', build: '#b8bb26', auto: '#fabd2f', yolo: '#fb4934' },
  syntax: {
    keyword: '#fb4934',
    string: '#b8bb26',
    number: '#d79921',
    comment: '#928374',
    function: '#83a598',
    type: '#fabd2f',
  },
};

export const themes: Record<string, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  gruvbox: gruvboxTheme,
};
