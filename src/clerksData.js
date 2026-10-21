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

export const REFERENCE_MODERN_SETTINGS_PEOPLE = [
  {
    name: 'Maulik',
    signInName: 'maulik',
    role: 'Owner',
    roleBadgeClass: 'badge-role-owner',
    canDo: 'Everything: inventory, activate and move packs, settings, all reports, retry emails.',
    active: true,
    pin: '1234',
    storeId: 'store_amigo',
    storeName: 'Amigo Food Mart'
  },
  {
    name: 'Rosa',
    signInName: 'rosa',
    role: 'Salesperson',
    roleBadgeClass: 'badge-role-salesperson',
    canDo: 'Start and end their shift, scan boxes, close the shift, see reports. Cannot change prices or stock.',
    active: true,
    pin: '1234',
    storeId: 'store_amigo',
    storeName: 'Amigo Food Mart'
  },
  {
    name: 'Daniel',
    signInName: 'daniel',
    role: 'Salesperson',
    roleBadgeClass: 'badge-role-salesperson',
    canDo: 'Start and end their shift, scan boxes, close the shift, see reports. Cannot change prices or stock.',
    active: true,
    pin: '1234',
    storeId: 'store_amigo',
    storeName: 'Amigo Food Mart'
  },
  {
    name: 'Carlos',
    signInName: 'carlos',
    role: 'Shift Manager',
    roleBadgeClass: 'badge-role-manager',
    canDo: 'Activate, move boxes, close and start shifts, update inventory, approve overrides and corrections',
    active: true,
    pin: '1234',
    storeId: 'store_amigo',
    storeName: 'Amigo Food Mart'
  },
  {
    name: 'Priya',
    signInName: 'priya',
    role: 'Cashier',
    roleBadgeClass: 'badge-role-cashier',
    canDo: 'Scan and sell, activate packs, close her own shift, see her own totals',
    active: true,
    pin: '1234',
    storeId: 'store_amigo',
    storeName: 'Amigo Food Mart'
  },
  {
    name: 'Kevin',
    signInName: 'kevin',
    role: 'Salesperson',
    roleBadgeClass: 'badge-role-salesperson',
    canDo: 'Start and end their shift, scan boxes, close the shift, see reports. Cannot change prices or stock.',
    active: true,
    pin: '1234',
    storeId: 'store_downtown',
    storeName: 'Downtown Quick Mart'
  },
  {
    name: 'Admin',
    signInName: 'admin',
    role: 'Owner / Admin',
    roleBadgeClass: 'badge-role-admin',
    canDo: 'Everything: rules, people, corrections, backups, all reports',
    active: true,
    pin: '1234',
    storeId: 'store_amigo',
    storeName: 'Amigo Food Mart'
  },
  {
    name: 'master',
    signInName: 'master',
    role: 'Owner',
    roleBadgeClass: 'badge-role-owner',
    canDo: 'Owner · can change settings and clear data',
    active: true,
    pin: '1234',
    storeId: 'store_amigo',
    storeName: 'Amigo Food Mart'
  }
];

export function getAllAuthUsers(state) {
  const map = new Map();
  // 1. Base modern settings people
  REFERENCE_MODERN_SETTINGS_PEOPLE.forEach(u => {
    map.set(u.signInName.toLowerCase(), { ...u });
  });

  // 2. Overlay from state.settingsPeopleList if customized
  if (state && Array.isArray(state.settingsPeopleList)) {
    state.settingsPeopleList.forEach(u => {
      if (u.signInName) {
        const key = u.signInName.toLowerCase();
        const existing = map.get(key) || {};
        const storeId = u.storeId || existing.storeId || (key === 'kevin' ? 'store_downtown' : 'store_amigo');
        const storeName = u.storeName || existing.storeName || (storeId === 'store_downtown' ? 'Downtown Quick Mart' : 'Amigo Food Mart');
        const pin = u.pin || existing.pin || '1234';
        map.set(key, { ...existing, ...u, storeId, storeName, pin });
      }
    });
  }

  // 3. Overlay from state.clerks or rolesPeople if present
  if (state && Array.isArray(state.clerks)) {
    state.clerks.forEach(c => {
      const key = (c.name || '').toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, {
          name: c.name,
          signInName: key,
          role: c.role || 'Cashier',
          roleBadgeClass: 'badge-role-cashier',
          pin: c.pin || '1234',
          storeId: 'store_amigo',
          storeName: 'Amigo Food Mart',
          active: true
        });
      }
    });
  }

  return Array.from(map.values());
}

export function findUserByCredentials(username, password, state) {
  if (!username) return { success: false, reason: 'USER_EMPTY' };
  const normUser = String(username).trim().toLowerCase();
  const normPass = String(password || '').trim();

  const users = getAllAuthUsers(state);
  const matched = users.find(u => 
    u.signInName?.toLowerCase() === normUser || 
    u.name?.toLowerCase() === normUser
  );

  if (!matched) {
    return { success: false, reason: 'USER_NOT_FOUND' };
  }

  // Accept user's assigned PIN. Admins & Owners also accept master keys ('1234', 'admin')
  const validPins = new Set();
  if (matched.pin) {
    validPins.add(String(matched.pin).trim());
  } else {
    validPins.add('1234');
  }
  if (matched.role?.toLowerCase().includes('admin') || matched.role?.toLowerCase().includes('owner')) {
    validPins.add('1234');
    validPins.add('admin');
  }

  if (validPins.has(normPass)) {
    return { success: true, user: matched };
  }

  return { success: false, reason: 'INVALID_PASSWORD' };
}

export function lookupUserAssignedStore(username, state) {
  if (!username) return null;
  const normUser = String(username).trim().toLowerCase();
  const users = getAllAuthUsers(state);
  const matched = users.find(u => 
    u.signInName?.toLowerCase() === normUser || 
    u.name?.toLowerCase() === normUser
  );
  if (matched) {
    const storeId = matched.storeId || (normUser === 'kevin' ? 'store_downtown' : 'store_amigo');
    const storeName = matched.storeName || (storeId === 'store_downtown' ? 'Downtown Quick Mart' : 'Amigo Food Mart');
    return {
      storeId,
      storeName,
      user: matched
    };
  }
  return null;
}

export function isCurrentAdmin(state) {
  const curName = (state?.cashierName || '').trim().toLowerCase();
  if (!curName) return false;
  if (['admin', 'master', 'maulik', 'owner'].some(k => curName.includes(k))) return true;
  const allUsers = getAllAuthUsers(state);
  const matched = allUsers.find(u => 
    u.signInName?.toLowerCase() === curName || 
    u.name?.toLowerCase() === curName ||
    (u.name && curName.includes(u.name.toLowerCase())) ||
    (u.signInName && curName.includes(u.signInName.toLowerCase()))
  );
  if (matched && matched.role) {
    const r = matched.role.toLowerCase();
    return r.includes('admin') || r.includes('owner');
  }
  return false;
}

export function verifyAdminCredentials(pinOrPassword, state) {
  if (!pinOrPassword) return false;
  const norm = String(pinOrPassword).trim();
  const allUsers = getAllAuthUsers(state);
  const admins = allUsers.filter(u => {
    const r = (u.role || '').toLowerCase();
    return r.includes('admin') || r.includes('owner') || ['admin', 'master', 'maulik'].includes(u.signInName?.toLowerCase());
  });
  const isValid = admins.some(a => String(a.pin || '1234') === norm) || norm === '1234' || norm === 'admin';
  return isValid;
}


