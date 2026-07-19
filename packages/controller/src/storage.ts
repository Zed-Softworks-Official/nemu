const BASE_URL_KEY = "nemu.controller.baseUrl";
const CONTROLLER_ID_KEY = "nemu.controller.id";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function getRememberedBaseUrl(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(BASE_URL_KEY);
}

export function setRememberedBaseUrl(baseUrl: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(BASE_URL_KEY, baseUrl.replace(/\/$/, ""));
}

export function clearRememberedBaseUrl(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(BASE_URL_KEY);
}

export function getRememberedControllerId(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(CONTROLLER_ID_KEY);
}

export function setRememberedControllerId(controllerId: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(CONTROLLER_ID_KEY, controllerId);
}

export function clearRememberedControllerId(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(CONTROLLER_ID_KEY);
}

const TOKEN_KEY = "nemu.controller.clientToken";

export function getClientToken(): string | null {
  if (!canUseStorage()) return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setClientToken(token: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearClientToken(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(TOKEN_KEY);
}
