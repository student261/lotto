// People & Roles Data Model & Catalog for Settings Screen
// Matches LottoTrack Reference UI Specification

export const REFERENCE_SETTINGS_PEOPLE = [
  {
    id: 'clk_master',
    name: 'master',
    role: 'Owner',
    roleDesc: 'Owner · can change settings and clear data',
    pin: '1234'
  },
  {
    id: 'clk_priya',
    name: 'Priya',
    role: 'Clerk',
    roleDesc: 'Clerk · can sell, receive packs and end the day',
    pin: '0000'
  },
  {
    id: 'clk_carlos',
    name: 'Carlos',
    role: 'Clerk',
    roleDesc: 'Clerk · can sell, receive packs and end the day',
    pin: '0000'
  }
];

export const REFERENCE_SETTINGS_ROLES_PEOPLE = [
  {
    id: 'clk_master',
    initial: 'M',
    name: 'master',
    role: 'Owner / Admin',
    roleBadgeClass: 'badge-role-admin',
    canDo: 'Everything: rules, people, corrections, backups, all reports',
    stores: 'All stores',
    status: 'Active',
    statusClass: 'badge-status-active',
    pin: '1234'
  },
  {
    id: 'clk_carlos',
    initial: 'C',
    name: 'Carlos',
    role: 'Shift Manager',
    roleBadgeClass: 'badge-role-manager',
    canDo: 'Activate, move boxes, close and start shifts, update inventory, approve overrides and corrections',
    stores: 'Amigo Food Mart',
    status: 'Active',
    statusClass: 'badge-status-active',
    pin: '0000'
  },
  {
    id: 'clk_priya',
    initial: 'P',
    name: 'Priya',
    role: 'Cashier',
    roleBadgeClass: 'badge-role-cashier',
    canDo: 'Scan and sell, activate packs, close her own shift, see her own totals',
    stores: 'Amigo Food Mart',
    status: 'Active',
    statusClass: 'badge-status-active',
    pin: '0000'
  },
  {
    id: 'clk_dana',
    initial: 'D',
    name: 'Dana',
    role: 'Auditor',
    roleBadgeClass: 'badge-role-auditor',
    canDo: 'Read-only: reports, history and audit trail, export where allowed',
    stores: 'All stores',
    status: 'Active',
    statusClass: 'badge-status-active',
    pin: '0000'
  },
  {
    id: 'clk_luis',
    initial: 'L',
    name: 'Luis',
    role: 'Cashier',
    roleBadgeClass: 'badge-role-cashier',
    canDo: '—',
    stores: 'Amigo Food Mart',
    status: 'Inactive',
    statusClass: 'badge-status-inactive',
    pin: '0000'
  }
];

export function getSettingsPeopleList(state) {
  if (state && Array.isArray(state.clerks) && state.clerks.length > 0) {
    return state.clerks;
  }
  return JSON.parse(JSON.stringify(REFERENCE_SETTINGS_PEOPLE));
}

export function getSettingsRolesPeopleList(state) {
  if (state && Array.isArray(state.rolesPeople) && state.rolesPeople.length > 0) {
    return state.rolesPeople;
  }
  return JSON.parse(JSON.stringify(REFERENCE_SETTINGS_ROLES_PEOPLE));
}

