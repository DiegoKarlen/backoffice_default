export type ApiHttpError = Error & { status?: number; sessionHandled?: boolean };

export type CreateApiClientOptions = {
  /** URL base de la API, o función que la resuelve en cada request (p. ej. `localStorage`). */
  baseUrl: string | (() => string);
  getToken?: () => string | null;
  /** Called when the server returns 401 and a bearer token was sent. */
  onUnauthorized?: (hadAuth: boolean) => void;
};
