import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_LATEX_PACKAGES } from '../utils/latex';

const LatexConfigContext = createContext<string[]>(DEFAULT_LATEX_PACKAGES);

export function LatexConfigProvider({
  packages,
  children,
}: {
  packages: string[];
  children: ReactNode;
}) {
  return (
    <LatexConfigContext.Provider value={packages.length ? packages : DEFAULT_LATEX_PACKAGES}>
      {children}
    </LatexConfigContext.Provider>
  );
}

export function useLatexPackages(): string[] {
  return useContext(LatexConfigContext);
}
