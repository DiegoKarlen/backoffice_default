/** Backoffice functionality codes (must match seed + `Functionality.code` in DB). */
export const BO = {
  USERS_MANAGE: "bo.users.manage",
  ROLES_MANAGE: "bo.roles.manage",
  FUNCTIONALITIES_MANAGE: "bo.functionalities.manage",
  BINGO_MANAGE: "bo.bingo.manage",
  ROOM_MANAGE: "bo.room.manage",
  PLAYERS_MANAGE: "bo.players.manage",
  WALLET_MANUAL_CREDIT: "bo.wallet.manual-credit",
  PAYMENTS_MANAGE: "bo.payments.manage",
} as const;

export type BoFunctionalityCode = (typeof BO)[keyof typeof BO];
