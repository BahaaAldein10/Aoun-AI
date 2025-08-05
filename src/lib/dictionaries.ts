export const dictionaries = {
  en: () => import("@/dictionaries/en.json").then((m) => m.default),
  ar: () => import("@/dictionaries/ar.json").then((m) => m.default),
};

export type SupportedLang = keyof typeof dictionaries;

export const getDictionary = async (lang: SupportedLang) => {
  return await dictionaries[lang]();
};

export async function getLangAndDict(params: Promise<{ lang: SupportedLang }>) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  return { lang, dict };
}
