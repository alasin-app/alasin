// SPDX-License-Identifier: MIT
// All user-visible text goes through t(). English is the default and the
// reference; every other language must have exactly the same keys (checked by
// the type below and by a test).

import { useEffect, useState } from "preact/hooks";

const en = {
  "app.loading": "Loading…",
  "login.title": "Sign in",
  "login.subtitle": "Write and publish to your Hugo site from any device.",
  "login.button": "Sign in with GitHub",
  "login.footnote": "Only people this site's owner has allowed can sign in.",
  "login.error.state": "The sign-in link expired or was already used. Please try again.",
  "login.error.denied": "Sign-in was cancelled on GitHub.",
  "login.error.not_allowed": "This GitHub account isn't allowed to use this app. Ask the site's owner to add you.",
  "login.error.github": "GitHub didn't respond as expected. Please try again in a moment.",
  "login.error.rate_limited": "Too many sign-in attempts. Wait a minute and try again.",
  "nav.home": "Home",
  "nav.pages": "Pages",
  "nav.posts": "Posts",
  "nav.drafts": "Drafts",
  "nav.categories": "Categories",
  "nav.media": "Media",
  "nav.more": "More",
  "home.newPost": "New post",
  "home.newPage": "New page",
  "empty.title": "Nothing here yet",
  "empty.body": "Posts and pages from the site will be listed here.",
  "account.title": "Account",
  "account.done": "Done",
  "account.signedInAs": "Signed in with GitHub as @{login}",
  "account.environment": "Environment",
  "account.version": "Version",
  "account.site": "Site",
  "account.viewSite": "View site",
  "account.settings": "Settings",
  "account.language": "Language",
  "account.logout": "Log out",
  "account.loggingOut": "Logging out…",
  "account.logoutConfirm": "Log out of {app}?",
  "account.logoutConfirmBody": "Local data stored by the app on this device is removed.",
  "common.cancel": "Cancel",
  "error.network": "Can't reach the server. Check your connection and try again.",
  "error.generic": "Something went wrong. Please try again.",
  "error.retry": "Try again",
  "language.en": "English",
  "language.fi": "Suomi",
} as const;

export type MessageKey = keyof typeof en;
type Messages = Record<MessageKey, string>;

const fi: Messages = {
  "app.loading": "Ladataan…",
  "login.title": "Kirjaudu",
  "login.subtitle": "Kirjoita ja julkaise Hugo-sivustollesi millä tahansa laitteella.",
  "login.button": "Kirjaudu GitHubilla",
  "login.footnote": "Vain sivuston omistajan sallimat henkilöt voivat kirjautua.",
  "login.error.state": "Kirjautumislinkki vanheni tai sitä käytettiin jo. Yritä uudelleen.",
  "login.error.denied": "Kirjautuminen peruttiin GitHubissa.",
  "login.error.not_allowed": "Tällä GitHub-tilillä ei ole pääsyä sovellukseen. Pyydä sivuston omistajaa lisäämään sinut.",
  "login.error.github": "GitHub ei vastannut odotetusti. Yritä hetken kuluttua uudelleen.",
  "login.error.rate_limited": "Liian monta kirjautumisyritystä. Odota minuutti ja yritä uudelleen.",
  "nav.home": "Koti",
  "nav.pages": "Sivut",
  "nav.posts": "Artikkelit",
  "nav.drafts": "Luonnokset",
  "nav.categories": "Kategoriat",
  "nav.media": "Media",
  "nav.more": "Lisää",
  "home.newPost": "Uusi artikkeli",
  "home.newPage": "Uusi sivu",
  "empty.title": "Täällä ei ole vielä mitään",
  "empty.body": "Sivuston artikkelit ja sivut näkyvät tässä.",
  "account.title": "Tili",
  "account.done": "Valmis",
  "account.signedInAs": "Kirjautunut GitHubilla käyttäjänä @{login}",
  "account.environment": "Ympäristö",
  "account.version": "Versio",
  "account.site": "Sivusto",
  "account.viewSite": "Näytä sivusto",
  "account.settings": "Asetukset",
  "account.language": "Kieli",
  "account.logout": "Kirjaudu ulos",
  "account.loggingOut": "Kirjaudutaan ulos…",
  "account.logoutConfirm": "Kirjaudutaanko ulos sovelluksesta {app}?",
  "account.logoutConfirmBody": "Sovelluksen tähän laitteeseen tallentamat tiedot poistetaan.",
  "common.cancel": "Peruuta",
  "error.network": "Palvelimeen ei saada yhteyttä. Tarkista verkkoyhteys ja yritä uudelleen.",
  "error.generic": "Jokin meni vikaan. Yritä uudelleen.",
  "error.retry": "Yritä uudelleen",
  "language.en": "English",
  "language.fi": "Suomi",
};

export const messages = { en, fi } satisfies Record<string, Messages>;
export type Language = keyof typeof messages;
export const LANGUAGES = Object.keys(messages) as Language[];

const STORAGE_KEY = "alasin.language";
const listeners = new Set<() => void>();
let current: Language = "en";

function stored(): Language | undefined {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v in messages ? (v as Language) : undefined;
  } catch {
    return undefined;
  }
}

export function initLanguage(fallback: string | undefined): void {
  current = stored() ?? (fallback && fallback in messages ? (fallback as Language) : "en");
  document.documentElement.lang = current;
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
  listeners.forEach((l) => l());
}

export function t(key: MessageKey, params: Record<string, string> = {}): string {
  const text: string = messages[current][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? `{${k}}`);
}

/** Re-renders the calling component when the language changes. */
export function useLanguage(): Language {
  const [lang, setLang] = useState(current);
  useEffect(() => {
    const l = () => setLang(current);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return lang;
}
