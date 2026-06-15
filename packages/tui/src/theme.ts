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

  background?: string;
  backgroundPanel?: string;
  backgroundElement?: string;
  borderSubtle?: string;
  diffContext?: string;
  diffHunkHeader?: string;
  diffHighlightAdd?: string;
  diffHighlightDel?: string;
  diffContextBg?: string;
  diffLineNumber?: string;
  diffAddLineNumberBg?: string;
  diffDelLineNumberBg?: string;
  markdownText?: string;
  markdownHeading?: string;
  markdownLink?: string;
  markdownLinkText?: string;
  markdownCode?: string;
  markdownBlockQuote?: string;
  markdownEmph?: string;
  markdownStrong?: string;
  markdownHorizontalRule?: string;
  markdownListItem?: string;
  markdownListEnumeration?: string;
  markdownImage?: string;
  markdownImageText?: string;
  markdownCodeBlock?: string;

  syntaxVariable?: string;
  syntaxOperator?: string;
  syntaxPunctuation?: string;
}

export const sentinelTheme: Theme = {
  brand: '#a855f7',
  user: '#22d3ee',
  text: '#e2e8f0',
  dim: '#787c99',
  muted: '#565676',
  success: '#34d399',
  warning: '#fbbf24',
  error: '#fb7185',
  info: '#38bdf8',
  diffAdd: '#4ade80',
  diffDel: '#fb7185',
  diffAddBg: '#1a3a2a',
  diffDelBg: '#3a1a2a',
  border: '#3b3b5c',
  borderFocus: '#a855f7',
  modeBadge: { plan: '#38bdf8', build: '#34d399', auto: '#fbbf24', yolo: '#fb7185' },
  syntax: {
    keyword: '#c084fc',
    string: '#4ade80',
    number: '#fbbf24',
    comment: '#565676',
    function: '#38bdf8',
    type: '#fbbf24',
  },
  background: '#0f0f1a',
  backgroundPanel: '#1a1a2e',
  backgroundElement: '#252540',
  borderSubtle: '#2a2a45',
};

export const darkTheme: Theme = {
  brand: '#a855f7',
  user: '#22d3ee',
  text: '#e2e8f0',
  dim: '#787c99',
  muted: '#565676',
  success: '#34d399',
  warning: '#fbbf24',
  error: '#fb7185',
  info: '#38bdf8',
  diffAdd: '#4ade80',
  diffDel: '#fb7185',
  diffAddBg: '#1a3a2a',
  diffDelBg: '#3a1a2a',
  border: '#3b3b5c',
  borderFocus: '#a855f7',
  modeBadge: { plan: '#38bdf8', build: '#34d399', auto: '#fbbf24', yolo: '#fb7185' },
  syntax: {
    keyword: '#c084fc',
    string: '#4ade80',
    number: '#fbbf24',
    comment: '#565676',
    function: '#38bdf8',
    type: '#fbbf24',
  },
  background: '#0f0f1a',
  backgroundPanel: '#1a1a2e',
  backgroundElement: '#252540',
  borderSubtle: '#2a2a45',
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
  background: '#ffffff',
  backgroundPanel: '#f5f5f5',
  backgroundElement: '#ebebeb',
  borderSubtle: '#dddddd',
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
  background: '#282828',
  backgroundPanel: '#32302f',
  backgroundElement: '#3c3836',
  borderSubtle: '#504945',
};

export const tokyonightTheme: Theme = {
  brand: '#7dcfff',
  user: '#82aaff',
  text: '#c0caf5',
  dim: '#565f89',
  muted: '#3b4261',
  success: '#9ece6a',
  warning: '#e0af68',
  error: '#f7768e',
  info: '#7dcfff',
  diffAdd: '#9ece6a',
  diffDel: '#f7768e',
  diffAddBg: '#1d2b1d',
  diffDelBg: '#2b1d1d',
  border: '#3b4261',
  borderFocus: '#7dcfff',
  modeBadge: { plan: '#82aaff', build: '#9ece6a', auto: '#e0af68', yolo: '#f7768e' },
  syntax: {
    keyword: '#bb9af7',
    string: '#9ece6a',
    number: '#ff9e64',
    comment: '#565f89',
    function: '#7dcfff',
    type: '#e0af68',
  },
  background: '#1a1b2e',
  backgroundPanel: '#1f203a',
  backgroundElement: '#242545',
  borderSubtle: '#2f3a56',
  syntaxVariable: '#bb9af7',
  syntaxOperator: '#89ddff',
  syntaxPunctuation: '#565f89',
};

export const catppuccinTheme: Theme = {
  brand: '#f5c2e7',
  user: '#89b4fa',
  text: '#cdd6f4',
  dim: '#6c7086',
  muted: '#45475a',
  success: '#a6e3a1',
  warning: '#f9e2af',
  error: '#f38ba8',
  info: '#89b4fa',
  diffAdd: '#a6e3a1',
  diffDel: '#f38ba8',
  diffAddBg: '#1e2a1e',
  diffDelBg: '#2a1e1e',
  border: '#45475a',
  borderFocus: '#f5c2e7',
  modeBadge: { plan: '#89b4fa', build: '#a6e3a1', auto: '#f9e2af', yolo: '#f38ba8' },
  syntax: {
    keyword: '#cba6f7',
    string: '#a6e3a1',
    number: '#fab387',
    comment: '#6c7086',
    function: '#89b4fa',
    type: '#f9e2af',
  },
  background: '#1e1e2e',
  backgroundPanel: '#242438',
  backgroundElement: '#2a2a42',
  borderSubtle: '#45475a',
  syntaxVariable: '#cba6f7',
  syntaxOperator: '#89dceb',
  syntaxPunctuation: '#6c7086',
};

export const nordTheme: Theme = {
  brand: '#88c0d0',
  user: '#81a1c1',
  text: '#eceff4',
  dim: '#7b88a1',
  muted: '#4c566a',
  success: '#a3be8c',
  warning: '#ebcb8b',
  error: '#bf616a',
  info: '#88c0d0',
  diffAdd: '#a3be8c',
  diffDel: '#bf616a',
  diffAddBg: '#2d3d2d',
  diffDelBg: '#3d2d2d',
  border: '#4c566a',
  borderFocus: '#88c0d0',
  modeBadge: { plan: '#81a1c1', build: '#a3be8c', auto: '#ebcb8b', yolo: '#bf616a' },
  syntax: {
    keyword: '#81a1c1',
    string: '#a3be8c',
    number: '#b48ead',
    comment: '#616e88',
    function: '#88c0d0',
    type: '#ebcb8b',
  },
  background: '#2e3440',
  backgroundPanel: '#353b4a',
  backgroundElement: '#3b4252',
  borderSubtle: '#4c566a',
  syntaxVariable: '#81a1c1',
  syntaxOperator: '#88c0d0',
  syntaxPunctuation: '#616e88',
};

export const everforestTheme: Theme = {
  brand: '#d3c6aa',
  user: '#7fbbb3',
  text: '#d3c6aa',
  dim: '#9da9a0',
  muted: '#5a6a5a',
  success: '#a7c080',
  warning: '#e5c76b',
  error: '#e67e80',
  info: '#7fbbb3',
  diffAdd: '#a7c080',
  diffDel: '#e67e80',
  diffAddBg: '#2d3d2d',
  diffDelBg: '#3d2d2d',
  border: '#5a6a5a',
  borderFocus: '#d3c6aa',
  modeBadge: { plan: '#7fbbb3', build: '#a7c080', auto: '#e5c76b', yolo: '#e67e80' },
  syntax: {
    keyword: '#e67e80',
    string: '#a7c080',
    number: '#e5c76b',
    comment: '#859289',
    function: '#7fbbb3',
    type: '#d3c6aa',
  },
  background: '#2b3339',
  backgroundPanel: '#303b41',
  backgroundElement: '#36424a',
  borderSubtle: '#5a6a5a',
  syntaxVariable: '#e67e80',
  syntaxOperator: '#7fbbb3',
  syntaxPunctuation: '#859289',
};

export const kanagawaTheme: Theme = {
  brand: '#e6c384',
  user: '#7fb4ca',
  text: '#dcd7ba',
  dim: '#54546d',
  muted: '#363646',
  success: '#98bb6c',
  warning: '#e6c384',
  error: '#e46876',
  info: '#7fb4ca',
  diffAdd: '#98bb6c',
  diffDel: '#e46876',
  diffAddBg: '#2d3d2d',
  diffDelBg: '#3d2d2d',
  border: '#363646',
  borderFocus: '#e6c384',
  modeBadge: { plan: '#7fb4ca', build: '#98bb6c', auto: '#e6c384', yolo: '#e46876' },
  syntax: {
    keyword: '#957fb8',
    string: '#98bb6c',
    number: '#e6c384',
    comment: '#54546d',
    function: '#7fb4ca',
    type: '#e6c384',
  },
  background: '#1f1f2e',
  backgroundPanel: '#262637',
  backgroundElement: '#2c2c40',
  borderSubtle: '#363646',
  syntaxVariable: '#957fb8',
  syntaxOperator: '#8ec6c5',
  syntaxPunctuation: '#54546d',
};

export const ayuTheme: Theme = {
  brand: '#e6b450',
  user: '#73d0ff',
  text: '#b3b1ad',
  dim: '#585a60',
  muted: '#3a3c40',
  success: '#aad94c',
  warning: '#e6b450',
  error: '#f07178',
  info: '#73d0ff',
  diffAdd: '#aad94c',
  diffDel: '#f07178',
  diffAddBg: '#2d3d2d',
  diffDelBg: '#3d2d2d',
  border: '#3a3c40',
  borderFocus: '#e6b450',
  modeBadge: { plan: '#73d0ff', build: '#aad94c', auto: '#e6b450', yolo: '#f07178' },
  syntax: {
    keyword: '#ff8f40',
    string: '#aad94c',
    number: '#e6b450',
    comment: '#585a60',
    function: '#73d0ff',
    type: '#ff8f40',
  },
  background: '#0b0e14',
  backgroundPanel: '#11131a',
  backgroundElement: '#171a22',
  borderSubtle: '#3a3c40',
  syntaxVariable: '#ff8f40',
  syntaxOperator: '#73d0ff',
  syntaxPunctuation: '#585a60',
};

export const oneDarkTheme: Theme = {
  brand: '#e5c07b',
  user: '#61afef',
  text: '#abb2bf',
  dim: '#5c6370',
  muted: '#3e4451',
  success: '#98c379',
  warning: '#e5c07b',
  error: '#e06c75',
  info: '#61afef',
  diffAdd: '#98c379',
  diffDel: '#e06c75',
  diffAddBg: '#2d3d2d',
  diffDelBg: '#3d2d2d',
  border: '#3e4451',
  borderFocus: '#e5c07b',
  modeBadge: { plan: '#61afef', build: '#98c379', auto: '#e5c07b', yolo: '#e06c75' },
  syntax: {
    keyword: '#c678dd',
    string: '#98c379',
    number: '#d19a66',
    comment: '#5c6370',
    function: '#61afef',
    type: '#e5c07b',
  },
  background: '#282c34',
  backgroundPanel: '#2c323c',
  backgroundElement: '#313740',
  borderSubtle: '#3e4451',
  syntaxVariable: '#e06c75',
  syntaxOperator: '#56b6c2',
  syntaxPunctuation: '#5c6370',
};

export const matrixTheme: Theme = {
  brand: '#00ff00',
  user: '#00cc00',
  text: '#00ff00',
  dim: '#006600',
  muted: '#003300',
  success: '#00ff00',
  warning: '#ffff00',
  error: '#ff0000',
  info: '#00ffff',
  diffAdd: '#00ff00',
  diffDel: '#ff0000',
  diffAddBg: '#003300',
  diffDelBg: '#330000',
  border: '#006600',
  borderFocus: '#00ff00',
  modeBadge: { plan: '#00ffff', build: '#00ff00', auto: '#ffff00', yolo: '#ff0000' },
  syntax: {
    keyword: '#00ff00',
    string: '#00cc00',
    number: '#ffff00',
    comment: '#006600',
    function: '#00ff00',
    type: '#00ff00',
  },
  background: '#000000',
  backgroundPanel: '#0a0a0a',
  backgroundElement: '#111111',
  borderSubtle: '#003300',
  syntaxVariable: '#00ff00',
  syntaxOperator: '#00ffff',
  syntaxPunctuation: '#006600',
};

export const systemTheme: Theme = {
  brand: 'none',
  user: 'none',
  text: 'none',
  dim: 'none',
  muted: 'none',
  success: 'none',
  warning: 'none',
  error: 'none',
  info: 'none',
  diffAdd: 'none',
  diffDel: 'none',
  diffAddBg: 'none',
  diffDelBg: 'none',
  border: 'none',
  borderFocus: 'none',
  modeBadge: { plan: 'none', build: 'none', auto: 'none', yolo: 'none' },
  syntax: {
    keyword: 'none',
    string: 'none',
    number: 'none',
    comment: 'none',
    function: 'none',
    type: 'none',
  },
  background: 'none',
  backgroundPanel: 'none',
  backgroundElement: 'none',
  borderSubtle: 'none',
  markdownText: 'none',
  markdownHeading: 'none',
  markdownLink: 'none',
  markdownLinkText: 'none',
  markdownCode: 'none',
  markdownBlockQuote: 'none',
  markdownEmph: 'none',
  markdownStrong: 'none',
  markdownHorizontalRule: 'none',
  markdownListItem: 'none',
  markdownListEnumeration: 'none',
  markdownImage: 'none',
  markdownImageText: 'none',
  markdownCodeBlock: 'none',
  syntaxVariable: 'none',
  syntaxOperator: 'none',
  syntaxPunctuation: 'none',
};

export const themes: Record<string, Theme> = {
  sentinel: sentinelTheme,
  dark: darkTheme,
  light: lightTheme,
  gruvbox: gruvboxTheme,
  tokyonight: tokyonightTheme,
  catppuccin: catppuccinTheme,
  nord: nordTheme,
  everforest: everforestTheme,
  kanagawa: kanagawaTheme,
  ayu: ayuTheme,
  'one-dark': oneDarkTheme,
  matrix: matrixTheme,
  system: systemTheme,
};
