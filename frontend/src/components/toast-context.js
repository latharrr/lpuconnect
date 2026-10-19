import { createContext, useContext } from 'react';

export const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
