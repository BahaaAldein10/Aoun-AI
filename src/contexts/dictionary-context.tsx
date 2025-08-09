"use client";

import { dictionaries, SupportedLang } from "@/lib/dictionaries";
import React, { createContext, useContext, useEffect, useState } from "react";

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["en"]>>;

const DictionaryContext = createContext<Dictionary | null>(null);

export const DictionaryProvider = ({
  children,
  lang,
}: {
  children: React.ReactNode;
  lang: SupportedLang;
}) => {
  const [dict, setDict] = useState<Dictionary | null>(null);

  useEffect(() => {
    dictionaries[lang]().then(setDict);
  }, [lang]);

  if (!dict) return null; // loading state (or splash)

  return (
    <DictionaryContext.Provider value={dict}>
      {children}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = () => {
  const context = useContext(DictionaryContext);
  if (!context)
    throw new Error("useDictionary must be used within DictionaryProvider");
  return context;
};
