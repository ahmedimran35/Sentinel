import React from 'react';
import type { Theme } from './theme.js';
import { darkTheme } from './theme.js';

export const ThemeContext = React.createContext<Theme>(darkTheme);
export const useTheme = () => React.useContext(ThemeContext);
