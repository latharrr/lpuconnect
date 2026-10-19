import { createContext, useContext } from 'react';

export const I18n = createContext({ lang: 'en', t: (k) => k, setLang: () => {} });
export const useI18n = () => useContext(I18n);
export const useT = () => useContext(I18n).t;
