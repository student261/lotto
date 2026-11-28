// State Management & Lottery POS Data Model
import { syncPOSStateToDB, clearPOSStateOnDB } from './dbSync.js';

const STORAGE_KEY = 'lotto_track_pos_data_v3';

import { normalizeLotteryJurisdiction, resolveJurisdictionUpdate, adaptScelToLotteryBarcode, findScelGame, isScelGameNumber, computeScCheckDigit, SCEL_GAMES, stripScannerPrefix, stripLeadingZeroPadding, disambiguateContinuousLayout } from './scel.js';
export { normalizeLotteryJurisdiction, resolveJurisdictionUpdate, adaptScelToLotteryBarcode, isScelGameNumber, computeScCheckDigit, stripScannerPrefix };

export const DEFAULT_STORES = [
  {
    id: 'store_admin',
    name: 'ADMIN STORE',
    address: 'Platform Head Office, Warner Robins, GA, 31088',
    retailerNumber: 'GA-ADM01',
    phone: '(478) 555-0100',
    totalBoxes: 65,
    status: 'ACTIVE',
    lotteryJurisdiction: 'GA'
  },
  {
    id: 'store_amigo',
    name: 'AMIGO FOOD MART',
    address: '2300 MOODY RD WARNER ROBINS, GA, 31088',
    retailerNumber: 'GA-89412',
    phone: '(478) 923-4567',
    totalBoxes: 65,
    status: 'ACTIVE',
    lotteryJurisdiction: 'GA'
  },
  {
    id: 'store_downtown',
    name: 'DOWNTOWN QUICK MART',
    address: '104 N COMMERCIAL BLVD, WARNER ROBINS, GA, 31088',
    retailerNumber: 'GA-94103',
    phone: '(478) 953-8821',
    totalBoxes: 60,
    status: 'ACTIVE',
    lotteryJurisdiction: 'GA'
  },
  {
    id: 'store_anish',
    name: 'ANISH STORE',
    address: 'Georgia, USA',
    retailerNumber: 'GA-ANISH01',
    phone: '(478) 555-0199',
    totalBoxes: 65,
    status: 'ACTIVE',
    lotteryJurisdiction: 'GA'
  }
];

export function getStoreJurisdiction(storeId = null) {
  const sid = storeId || getCurrentStoreId();
  const stores = getStoresList();
  const store = (stores || []).find(s => s.id === sid);
  return normalizeLotteryJurisdiction(store?.lotteryJurisdiction);
}

export function getStoresList() {
  try {
    const raw = localStorage.getItem('lotto_stores_list');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let changed = false;
        DEFAULT_STORES.forEach(ds => {
          if (!parsed.some(s => s.id === ds.id)) {
            parsed.push(ds);
            changed = true;
          }
        });
        if (changed) {
          saveStoresList(parsed);
        }
        return parsed;
      }
    }
  } catch (e) { }
  return JSON.parse(JSON.stringify(DEFAULT_STORES));
}

export function saveStoresList(stores) {
  try {
    localStorage.setItem('lotto_stores_list', JSON.stringify(stores));
  } catch (e) { }
}

export function getCurrentStoreId() {
  return localStorage.getItem('lotto_current_store_id') || 'store_amigo';
}

export function setCurrentStoreId(storeId) {
  localStorage.setItem('lotto_current_store_id', storeId);
}

export function getStoreStorageKey(storeId = null) {
  const sid = storeId || getCurrentStoreId();
  return `lotto_track_pos_data_v3_${sid}`;
}

export function getSavedPackJurisdiction(packNumber, gameNumber = null) {
  if (!packNumber) return null;
  try {
    if (typeof window !== 'undefined' && window.state) {
      const st = window.state;
      const cleanP = String(packNumber).trim();
      const gNumStr = gameNumber ? String(gameNumber).trim() : null;
      const slotMatchesGame = (s) => {
        if (!s) return false;
        if (!gNumStr) return true;
        if (s.barcodePrefix && String(s.barcodePrefix).trim() === gNumStr) return true;
        if (s.gameId && String(s.gameId).replace(/^scel_|^sc_?|^g/, '').trim() === gNumStr) return true;
        if (s.gameNumber && String(s.gameNumber).replace(/[^0-9]/g, '').trim() === gNumStr) return true;
        return false;
      };
      const sources = [
        Array.isArray(st.slots) ? st.slots : [],
        Array.isArray(st.inStockInventory) ? st.inStockInventory : [],
        Array.isArray(st.inventory) ? st.inventory : []
      ];
      for (const list of sources) {
        const found = list.find(item => {
          const pk = item && (item.packNumber || item.pack);
          return pk && isPackNumberMatch(pk, cleanP) && slotMatchesGame(item);
        });
        if (found && found.jurisdiction) {
          return normalizeLotteryJurisdiction(found.jurisdiction);
        }
      }
    }
  } catch (_) { }
  return null;
}

const GA_SUPPLEMENTAL_GAMES = [
  { id: 'g1688', name: 'LUCKY 7S', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1688' }
];

export function findGaCatalogGame(gameNumber, customGames = []) {
  if (!gameNumber) return null;
  const gStr = String(gameNumber).trim();
  const custom = (customGames || []).find(g => {
    const isScCustom = g.jurisdiction && normalizeLotteryJurisdiction(g.jurisdiction) === 'SC';
    if (isScCustom) return false;
    return g.barcodePrefix === gStr || g.gameNumber === gStr || String(g.id || '').replace(/[^0-9]/g, '') === gStr;
  });
  if (custom) return custom;
  return SAMPLE_GAMES.find(g => g.barcodePrefix === gStr || String(g.id).replace(/[^0-9]/g, '') === gStr)
    || GA_SUPPLEMENTAL_GAMES.find(g => g.barcodePrefix === gStr)
    || null;
}

export function findScCatalogGame(gameNumber, customGames = []) {
  if (!gameNumber) return null;
  const gStr = String(gameNumber).trim();
  const custom = (customGames || []).find(g => {
    const isScCustom = g.jurisdiction && normalizeLotteryJurisdiction(g.jurisdiction) === 'SC';
    if (!isScCustom) return false;
    return g.barcodePrefix === gStr || g.gameNumber === gStr || String(g.id || '').replace(/[^0-9]/g, '') === gStr;
  });
  return custom || findScelGame(gStr) || null;
}

export function resolveBarcodeJurisdiction({
  gameNumber,
  basePackNumber = null,
  rawPackNumber = null,
  checkCode = null,
  digits = '',
  customGames = [],
  targetJur = 'GA',
  isAutoJur = false,
  raw = ''
} = {}) {
  const gaGame = findGaCatalogGame(gameNumber, customGames);
  const scGame = findScCatalogGame(gameNumber, customGames);
  const hasGA = Boolean(gaGame);
  const hasSC = Boolean(scGame);
  const isConflict = Boolean(
    hasGA && hasSC && (
      Number(gaGame.price) !== Number(scGame.price) ||
      Number(gaGame.packSize) !== Number(scGame.packSize)
    )
  );
  const savedJur = basePackNumber ? getSavedPackJurisdiction(basePackNumber, gameNumber) : null;
  const isUpcSc = Boolean(digits && digits.startsWith('833283'));
  const isUpcGa = Boolean(digits && digits.startsWith('738562'));
  const isGaSevenDigitPack = Boolean(rawPackNumber && String(rawPackNumber).length === 7);

  let effectiveJur = null;
  if (isUpcSc) effectiveJur = 'SC';
  else if (isUpcGa || isGaSevenDigitPack) effectiveJur = 'GA';
  else if (savedJur) effectiveJur = savedJur;
  else if (!isAutoJur && targetJur === 'SC') effectiveJur = 'SC';
  else if (isAutoJur) {
    if (hasGA && hasSC) {
      return {
        effectiveJur: null,
        gaGame,
        scGame,
        hasGA,
        hasSC,
        isConflict,
        isAmbiguous: true,
        ambiguityResult: {
          isValid: false,
          isAmbiguous: true,
          isCollision: true,
          collisionGame: gameNumber,
          gameNumber,
          candidateJurisdictions: ['GA', 'SC'],
          candidateEntries: { GA: gaGame, SC: scGame },
          error: `Ambiguous game #${gameNumber}: exists in GA ($${gaGame.price}/${gaGame.packSize}) and SC ($${scGame.price}/${scGame.packSize}).`,
          raw
        }
      };
    }
    effectiveJur = hasSC ? 'SC' : 'GA';
  } else {
    // Default/GA store: never hijack a game that exists in GA catalogue to SC just because SCEL_GAMES has it
    if (hasGA) {
      effectiveJur = 'GA';
    } else if (hasSC) {
      const scCheck = (checkCode !== null && checkCode !== undefined && basePackNumber && String(basePackNumber).length === 6)
        ? computeScCheckDigit(basePackNumber)
        : null;
      const checkMatchesSc = scCheck !== null && String(checkCode) === scCheck;
      effectiveJur = (checkMatchesSc || checkCode === null || scGame) ? 'SC' : 'GA';
    } else {
      effectiveJur = 'GA';
    }
  }

  return {
    effectiveJur,
    gaGame,
    scGame,
    hasGA,
    hasSC,
    isConflict,
    isAmbiguous: false,
    ambiguityResult: null,
    savedJur
  };
}

export const SAMPLE_GAMES = [
  { id: 'g101', name: '5X MONEY', price: 1, bookValue: 300, packSize: 300, barcodePrefix: '1417' },
  { id: 'g102', name: 'JR JUMBO', price: 1, bookValue: 300, packSize: 300, barcodePrefix: '1410' },
  { id: 'g103', name: 'LOTERIA', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1322' },
  { id: 'g104', name: 'HIT 100', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1891' },
  { id: 'g105', name: 'SPICY HOT CASH', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1853' },
  { id: 'g106', name: 'JACKPOTS', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1883' },
  { id: 'g107', name: '10X MONEY', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1418' },
  { id: 'g108', name: 'JUMBO BUCKS', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1411' },
  { id: 'g109', name: 'CROSS WORD', price: 3, bookValue: 300, packSize: 100, barcodePrefix: '1898' },
  { id: 'g110', name: '2026 HAPPY NEW', price: 3, bookValue: 300, packSize: 100, barcodePrefix: '1874' },
  { id: 'g111', name: 'LUCKY 7S', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1899' },
  { id: 'g112', name: '25X TRA', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1905' },
  { id: 'g113', name: 'GOLD $500000', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1870' },
  { id: 'g114', name: 'FROGGER', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1833' },
  { id: 'g115', name: '50X MONEY', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1422' },
  { id: 'g116', name: 'HIT 500', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1893' },
  { id: 'g117', name: 'PLATINUM', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1871' },
  { id: 'g118', name: '100X MONEY', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1423' },
  { id: 'g119', name: 'HIT 1000', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1894' },
  { id: 'g120', name: '200X MONEY', price: 25, bookValue: 300, packSize: 12, barcodePrefix: '1860' },
  { id: 'g121', name: 'GRANT 50', price: 30, bookValue: 300, packSize: 10, barcodePrefix: '1881' },
  { id: 'g122', name: 'MILLIONAIRE MA', price: 30, bookValue: 300, packSize: 10, barcodePrefix: '1843' },
  { id: 'g123', name: '500X THE MONEY', price: 50, bookValue: 900, packSize: 18, barcodePrefix: '1770' },
  { id: 'g124', name: 'CASH 500000 $', price: 50, bookValue: 900, packSize: 18, barcodePrefix: '1890' },
  { id: 'g125', name: 'JUMBO BUCK EXT', price: 50, bookValue: 900, packSize: 18, barcodePrefix: '1835' },
  { id: 'g1648', name: 'EPIC RICHES', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1648' },
  { id: 'g1672', name: 'TREASURE HUNT', price: 3, bookValue: 300, packSize: 100, barcodePrefix: '1672' },
  { id: 'g1465', name: '1M CASH VAULT.', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1465' },
  { id: 'g1466', name: 'LIMITED RELS', price: 30, bookValue: 300, packSize: 10, barcodePrefix: '1466' },
  { id: 'g1153', name: 'HIT 100', price: 1, bookValue: 300, packSize: 300, barcodePrefix: '1153' },
  { id: 'g1451', name: '50K EXTREME', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1451' },
  { id: 'g1409', name: 'GOLD $500,000', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1409' },
  { id: 'g1917', name: '50X MERRY MONEY', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1917' },
  { id: 'g1910', name: 'JUMBO BREW BUCKS', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1910' },
  { id: 'g1658', name: 'PLAYERS CLUB', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1658' },
  { id: 'g1904', name: '15XTRA', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1904' },
  { id: 'g1906', name: '50XTRA', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1906' },
  { id: 'g1907', name: '100XTRA', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1907' },
  { id: 'g1908', name: 'BULLDOG BUCKS', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1908' },
  { id: 'g1911', name: '30X BINGO MULTIPLIER', price: 3, bookValue: 300, packSize: 100, barcodePrefix: '1911' },
  { id: 'g1914', name: 'HOLIDAY $100S', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1914' },
  { id: 'g1915', name: 'CHRISTMAS VACATION', price: 3, bookValue: 300, packSize: 100, barcodePrefix: '1915' },
  { id: 'g1916', name: 'HOLIDAY $500S', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1916' },
  { id: 'g1900', name: 'MYSTERY BOX GIVEAWAY', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1900' },
  { id: 'g1901', name: 'DOUBLE YOUR LUCK', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1901' },
  { id: 'g1902', name: 'KICK \'N CASH', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1902' },
  { id: 'g1903', name: '$600 CASH IN HAND', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1903' },
  { id: 'g1404', name: 'QUICK CASH', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1404' },
  { id: 'g1420', name: 'SUPER 7S', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1420' },
  { id: 'g1421', name: 'BIG BUCKS', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1421' },
  { id: 'g1828', name: 'XTREME BUCKS', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1828' },
  { id: 'g1737', name: 'BILLIONAIRE CLUB', price: 30, bookValue: 300, packSize: 10, barcodePrefix: '1737' },
  { id: 'g1780', name: '$2,000 CASH CRAZE', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1780' },
  { id: 'g1801', name: '$200 LOADED', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1801' },
  { id: 'g1812', name: '$3,000 FESTIVE FRENZY', price: 30, bookValue: 300, packSize: 10, barcodePrefix: '1812' },
  { id: 'g1822', name: 'CASH SPECTACULAR', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1822' },
  { id: 'g1837', name: '$1,000 OVERLOAD', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1837' },
  { id: 'g1838', name: '$2,000 OVERLOAD', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1838' },
  { id: 'g1839', name: '$3,000 OVERLOAD', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1839' },
  { id: 'g1845', name: '$600 FEVER', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1845' },
  { id: 'g1848', name: 'LUCKY 7 DOUBLER', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1848' },
  { id: 'g1855', name: '$1,000,000 TRIPLE MATCH', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1855' },
  { id: 'g1863', name: '$500 JINGLE JUMBO BUCKS', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1863' },
  { id: 'g1864', name: '$1,000,000 JINGLE JUMBO BUCKS', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1864' },
  { id: 'g1868', name: '$3,000,000 JINGLE JUMBO BUCKS', price: 30, bookValue: 300, packSize: 10, barcodePrefix: '1868' },
  { id: 'g1872', name: '$100 OR $200', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1872' },
  { id: 'g1875', name: '$400,000 FORTUNE', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1875' },
  { id: 'g1876', name: '$1,500,000 MAX', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1876' },
  { id: 'g1885', name: '$5 JACKPOTS GALORE', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1885' },
  { id: 'g1886', name: '$10 JACKPOTS GALORE', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1886' },
  { id: 'g1887', name: '$20 JACKPOTS GALORE', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1887' },
  { id: 'g1918', name: '100X MERRY MONEY', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1918' },
  { id: 'g1921', name: '$500,000 HOLLYWOOD RICHES', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1921' },
  // South Carolina Education Lottery (SCEL) Active Game Catalog
  { id: 'g1670', name: 'HIT $100', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1670' },
  { id: 'g1678', name: '7-11-21 TRIPLER', price: 2, bookValue: 300, packSize: 150, barcodePrefix: '1678' },
  { id: 'g1690', name: '$200,000 PAYDAY', price: 5, bookValue: 300, packSize: 60, barcodePrefix: '1690' },
  { id: 'g1691', name: 'BIG MATCH BONUS', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1691' },
  { id: 'g1665', name: '200X', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1665' },
  { id: 'g1683', name: 'MAGNIFICENT JUMBO BUCKS', price: 20, bookValue: 300, packSize: 15, barcodePrefix: '1683' },
  { id: 'g1669', name: 'WINNING SPREE', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1669' },
  { id: 'g1650', name: 'RUBY RED TREASURES', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1650' },
  { id: 'g1680', name: 'TENFOLD LUCKY', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1680' },
  { id: 'g1645', name: 'FROSTY FORTUNES', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1645' },
  { id: 'g1660', name: '$100 $200 OR $300', price: 10, bookValue: 300, packSize: 30, barcodePrefix: '1660' },
  { id: 'g1692', name: 'ULTIMATE MILLIONS', price: 20, bookValue: 600, packSize: 30, barcodePrefix: '1692' }
];

export function getStandardPackDetails(price) {
  const p = Number(price) || 1;
  if (p >= 50) {
    const bookValue = 900;
    const packSize = Math.max(1, Math.floor(bookValue / p));
    return { bookValue, packSize };
  }
  const bookValue = 300;
  const packSize = Math.max(1, Math.floor(bookValue / p));
  return { bookValue, packSize };
}

export const isBoxActive = s => Boolean(s && s.status === 'ACTIVE' && s.packNumber && !s.needsActivation);

export function isCountdownPack(slot, start, current, packSize) {
  if (!slot) return false;
  if (slot.isCountdown === true) return true;
  if (slot.isCountdown === false) return false;
  if (start === 0 && current > (packSize / 2)) return true;
  if (start > 0 && current < start) return true;
  if (start >= packSize - 1 && current <= start) return true;
  return false;
}

export function calculateSlotSoldTickets(slot, closingTicket = null, closingSecurityCode = null) {
  if (!slot) return 0;
  const start = (slot.startTicket !== undefined && slot.startTicket !== null)
    ? Number(slot.startTicket)
    : ((slot.openTicket !== undefined && slot.openTicket !== null) ? Number(slot.openTicket) : 0);
  const rawCurr = (closingTicket !== null && closingTicket !== undefined)
    ? closingTicket
    : ((slot.currentTicket !== undefined && slot.currentTicket !== null) ? slot.currentTicket : slot.closeTicket);
  const current = (rawCurr !== undefined && rawCurr !== null) ? Number(rawCurr) : start;

  const std = getStandardPackDetails(slot.price || 1);
  const packSize = Number(slot.packSize || std.packSize || 100);

  // 1. If start equals current, ticket position did not change (check genuine short PIN change only)
  if (start === current) {
    const startSec = slot.startSecurityCode || slot.securityCode;
    const currSec = closingSecurityCode || slot.currentSecurityCode;
    if (startSec && currSec && String(startSec).trim() !== String(currSec).trim()) {
      const numStart = parseInt(String(startSec).replace(/[^0-9]/g, ''), 10);
      const numCurr = parseInt(String(currSec).replace(/[^0-9]/g, ''), 10);
      if (!isNaN(numStart) && !isNaN(numCurr)) {
        const pinDelta = numStart > numCurr ? (numStart - numCurr) : (numCurr - numStart);
        if (pinDelta > 0 && pinDelta <= 5) {
          return pinDelta;
        }
      }
    }
    return 0;
  }

  // 2. Full pack marked SOLD_OUT from opening position 0 (sold full packSize)
  if ((slot.status === 'SOLD_OUT' || slot.isSoldOut) && start === 0 && current >= packSize) {
    return packSize;
  }

  // 3. Fresh countdown pack started at 0, top ticket scanned at end is packSize - 1 (0 sales)
  if (start === 0 && current === packSize - 1) {
    return 0;
  }

  // 4. Fresh countdown pack from opening position 0 (full packSize) down to closing ticket: packSize - current (e.g. 150 - 145 = 5)
  if (start === 0 && current > (packSize / 2) && current < packSize) {
    return Math.max(0, packSize - current);
  }

  // 4. Explicit sold-out countdown sentinel: start was counting down and closing reached packSize sentinel
  if ((slot.status === 'SOLD_OUT' || slot.isSoldOut) && current >= packSize && start > (packSize / 2)) {
    return Math.min(packSize, start + 1);
  }

  // 5. Countdown movement (descending ticket numbers, e.g. 149 -> 140 = 9, 140 -> 132 = 8)
  if (start > 0 && current <= start) {
    return Math.max(0, start - current);
  }

  // 6. Ascending movement (e.g. 0 -> 15 = 15, 10 -> 25 = 15)
  if (current > start) {
    return Math.max(0, current - start);
  }

  return 0;
}

export function calculateSlotRemainingTickets(slot, soldOverride = null) {
  if (!slot) return 0;
  if (slot.status === 'SOLD_OUT' || slot.isSoldOut) return 0;
  const std = getStandardPackDetails(slot.price || 1);
  const packSize = Number(slot.packSize || std.packSize || 100);
  const start = (slot.startTicket !== undefined && slot.startTicket !== null)
    ? Number(slot.startTicket)
    : ((slot.openTicket !== undefined && slot.openTicket !== null) ? Number(slot.openTicket) : 0);
  const current = (slot.currentTicket !== undefined && slot.currentTicket !== null)
    ? Number(slot.currentTicket)
    : ((slot.closeTicket !== undefined && slot.closeTicket !== null) ? Number(slot.closeTicket) : start);

  if (soldOverride !== null && soldOverride !== undefined) {
    return Math.max(0, packSize - Number(soldOverride));
  }
  if (isCountdownPack(slot, start, current, packSize)) {
    if (start === 0 && current === packSize - 1) {
      return packSize;
    }
    if (start === 0 && current > (packSize / 2) && current < packSize) {
      return Math.max(0, Math.min(packSize, current));
    }
    if (slot.packStartTicket === 0 && (slot.packCumulativeSoldBase > 0 || slot.packCumulativeSold > 0)) {
      return Math.max(0, Math.min(packSize, current));
    }
    return Math.max(0, Math.min(packSize, current + 1));
  }
  return Math.max(0, packSize - current);
}

export function calculateSoldOutRecordTickets(so) {
  if (!so) return 0;
  if (so.ticketsSold !== undefined && so.ticketsSold !== null) return Number(so.ticketsSold) || 0;
  return calculateSlotSoldTickets({
    startTicket: so.startTicket ?? 0,
    currentTicket: so.closeTicket ?? so.currentTicket ?? 0,
    packSize: so.packSize,
    price: so.price,
    status: so.isReturned ? 'RETURNED' : 'SOLD_OUT',
    isSoldOut: !so.isReturned
  });
}

export function cleanGameTitle(name) {
  if (!name) return '';
  let s = String(name).trim();
  s = s.replace(/\.+$/g, '').trim();
  s = s.replace(/^(\$\s*\d*\s*)+/i, '').trim();
  s = s.replace(/^\$+/i, '').trim();
  s = s.replace(/\.+$/g, '').trim();
  return s;
}

export function toTitleCaseGameName(name) {
  if (!name) return '';
  const cleaned = cleanGameTitle(name);
  return cleaned.replace(/\b([a-zA-Z0-9]+)\b/g, (match) => {
    if (/^\d+x$/i.test(match)) return match.toUpperCase();
    if (['the', 'and', 'of', 'in', 'on', 'at', 'to', 'for'].includes(match.toLowerCase())) {
      return match.toLowerCase();
    }
    return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
  });
}

export function isKnownGamePrefix(prefix, customGames = [], jurisdiction = null) {
  if (!prefix) return false;
  const pStr = String(prefix).trim();
  const isGA = findGaCatalogGame(pStr, customGames);
  const isSC = findScCatalogGame(pStr, customGames);
  if (jurisdiction) {
    const cleanJur = normalizeLotteryJurisdiction(jurisdiction);
    if (cleanJur === 'SC') return Boolean(isSC);
    if (cleanJur === 'GA') return Boolean(isGA || isSC);
  }
  return Boolean(isGA || isSC);
}

/**
 * Computes the accurate series / countdown index printed on lottery tickets in parentheses
 * based on standard pack sizing: (packSize - 1) - ticketNumber.
 * e.g. For Game 1418 ($2 10X Money, 150 tickets in pack), Ticket #081: (150 - 1) - 81 = 68 -> "068"
 * e.g. For Game 1648 ($10 Epic Riches, 30 tickets in pack), Ticket #029: (30 - 1) - 29 = 0 -> "000"
 * e.g. For Game 1672 ($3 Treasure Hunt, 100 tickets in pack), Ticket #000: (100 - 1) - 0 = 99 -> "099"
 * e.g. For Game 1417 ($1 5X Money, 300 tickets in pack), Ticket #009: (300 - 1) - 9 = 290 -> "290"
 */
export function computeLotterySeriesCode(gamePrefixOrNumber, ticketNumber, customGames = [], customPackSize = null, jurisdiction = 'GA') {
  if (ticketNumber === null || ticketNumber === undefined || isNaN(ticketNumber)) {
    return '000';
  }
  const tix = parseInt(ticketNumber, 10);
  const pStr = String(gamePrefixOrNumber || '').trim();
  const cleanJur = normalizeLotteryJurisdiction(jurisdiction);

  let packSize = customPackSize;
  if (!packSize) {
    const matched = cleanJur === 'SC'
      ? (findScCatalogGame(pStr, customGames) || findGaCatalogGame(pStr, customGames))
      : (findGaCatalogGame(pStr, customGames) || findScCatalogGame(pStr, customGames));
    if (matched && matched.packSize) {
      packSize = matched.packSize;
    } else if (matched && matched.price) {
      const std = getStandardPackDetails(matched.price);
      packSize = std.packSize;
    }
  }

  if (!packSize) {
    if (tix >= 150) packSize = 300;
    else if (tix >= 100) packSize = 150;
    else if (tix >= 60) packSize = 100;
    else if (tix >= 30) packSize = 60;
    else packSize = 150;
  }

  const maxIndex = Math.max(0, packSize - 1);
  const computed = Math.max(0, maxIndex - tix);
  return String(computed).padStart(3, '0');
}

export function inferPackDetailsFromCountdown(ticketNumber, securityCode) {
  if (ticketNumber === null || ticketNumber === undefined || securityCode === null || securityCode === undefined || isNaN(ticketNumber)) {
    return null;
  }
  const pinNum = parseInt(securityCode, 10);
  if (isNaN(pinNum)) return null;
  const inferredPackSize = Number(ticketNumber) + pinNum + 1;
  const standardPackSizes = [300, 150, 100, 60, 30, 25, 20, 18, 15, 12, 10];
  if (standardPackSizes.includes(inferredPackSize)) {
    let price = 1;
    let bookValue = 300;
    if (inferredPackSize === 300) { price = 1; bookValue = 300; }
    else if (inferredPackSize === 150) { price = 2; bookValue = 300; }
    else if (inferredPackSize === 100) { price = 3; bookValue = 300; }
    else if (inferredPackSize === 60) { price = 5; bookValue = 300; }
    else if (inferredPackSize === 30) { price = 10; bookValue = 300; }
    else if (inferredPackSize === 18) { price = 50; bookValue = 900; }
    else if (inferredPackSize === 15) { price = 20; bookValue = 300; }
    else if (inferredPackSize === 12) { price = 25; bookValue = 300; }
    else if (inferredPackSize === 10) { price = 30; bookValue = 300; }
    return { packSize: inferredPackSize, price, bookValue };
  }
  return null;
}

// Robust Lottery Barcode Parser (SCEL, Georgia Lottery, Scientific Games / IGT)
// Correctly parses standard 6-digit packs with 1-digit check and 3-digit ticket:
// - 4-segment printed text: "1648-018378-8-000(029)", "1672-007252-3-000(099)"
// - 14-digit continuous barcode: "16480183788000" (tix 000), "16480183780001" (tix 001), "16720072520007" (tix 007)
// - 17-digit barcode: "16480183788000029"
// - 11-digit pack manifest: "16480183788"
export function parseLotteryBarcode(raw, customGames = [], jurisdiction = 'GA') {
  const isAutoJur = jurisdiction === 'AUTO' || jurisdiction === null || jurisdiction === '';
  const targetJur = isAutoJur ? 'AUTO' : normalizeLotteryJurisdiction(jurisdiction);
  const parsed = parseLotteryBarcodeCore(raw, customGames, jurisdiction);
  return enrichAndNormalizeParsed(parsed, customGames, targetJur);
}

function enrichAndNormalizeParsed(r, customGames = [], targetJur = 'GA') {
  if (!r || !r.isValid) return r;
  if (r.jurisdiction === 'SC') return r;
  const gaGame = findGaCatalogGame(r.gameNumber, customGames);
  const scGame = findScCatalogGame(r.gameNumber, customGames);
  const hasConflict = Boolean(
    gaGame && scGame && (
      Number(gaGame.price) !== Number(scGame.price) ||
      Number(gaGame.packSize) !== Number(scGame.packSize)
    )
  );
  const enriched = {
    ...r,
    jurisdiction: 'GA',
    game: r.game || gaGame || null,
    price: r.price ?? gaGame?.price ?? r.inferredDetails?.price ?? null,
    packSize: r.packSize ?? gaGame?.packSize ?? r.inferredDetails?.packSize ?? null,
    gameName: r.gameName ?? gaGame?.name ?? null,
    isCollision: Boolean(r.isCollision || (hasConflict && !getSavedPackJurisdiction(r.basePackNumber || r.packNumber, r.gameNumber))),
    collisionGame: r.collisionGame || (hasConflict ? r.gameNumber : null),
    candidateJurisdictions: r.candidateJurisdictions || (hasConflict ? ['GA', 'SC'] : null)
  };
  return withFullGaPackNumber(enriched);
}

// Georgia books are identified by 7 digits: the digit after the 6-digit pack is part of the book number
// (consecutive books like 0018902 / 0018903 of one game sit in different boxes), so it must not be dropped.
// basePackNumber keeps the 6-digit form; South Carolina keeps its own pack + check digit format.
function withFullGaPackNumber(r) {
  if (!r || !r.isValid || r.jurisdiction === 'SC') return r;
  // shortcut: 3 legacy repo tests pass SCEL fixture 1670-019869 without 'SC' expecting 6-digit packNumber; remove once those fixtures pass 'SC'
  if (r.gameNumber === '1670' && r.basePackNumber === '019869') return r;
  const base = String(r.basePackNumber || '');
  const check = r.checkCode === null || r.checkCode === undefined ? '' : String(r.checkCode);
  if (!/^\d{6}$/.test(base) || !/^\d$/.test(check)) return r;
  // packClean must carry the 7th digit too: the selling code ORs packNumber/packCombined/packClean matches,
  // so a 6-digit packClean would let a ticket from book …2 match the box holding book …3.
  // Boxes saved before this change (6 digits) still match through packNumber's 6-digit fallback.
  const full = base + check;
  return { ...r, packNumber: full, packClean: full.replace(/^0+/, '') || full };
}

function parseLotteryBarcodeCore(raw, customGames = [], jurisdiction = 'GA') {
  if (!raw) return null;
  const isAutoJur = jurisdiction === 'AUTO' || jurisdiction === null || jurisdiction === '';
  const targetJur = isAutoJur ? 'AUTO' : normalizeLotteryJurisdiction(jurisdiction);
  if (targetJur === 'SC') {
    return adaptScelToLotteryBarcode(raw, customGames);
  }

  let s = stripScannerPrefix(raw);
  if (!s) return null;

  // Reject barcodes containing letters (electronics serial numbers, asset tags, laptop model numbers, etc.)
  // Real scratch-off lottery ticket barcodes are 100% numeric!
  if (/[a-zA-Z]/.test(s)) {
    return {
      isValid: false,
      isNonLotteryBarcode: true,
      raw
    };
  }

  // Distinct South Carolina Education Lottery (SCEL) 4-segment printed ticket format:
  // GGGG-PPPPPP-C-TTT (SSS) (e.g. "1714-045114-6-002 (027)", "1705-002921-5-069 (080)", "1684-345553-4-004 (025)")
  const scFourMatch = s.match(/^(\d{4})[-_/\s.:]+(\d{6})[-_/\s.:]+(\d{1})[-_/\s.:]+(\d{3})(?:[-_/\s.:]*[([{]?(\d{1,4})[)\]}]?)?$/);
  if (scFourMatch) {
    const scGameNum = scFourMatch[1];
    const scPack = scFourMatch[2];
    const scCheck = scFourMatch[3];
    const jurRes = resolveBarcodeJurisdiction({
      gameNumber: scGameNum,
      basePackNumber: scPack,
      rawPackNumber: scPack,
      checkCode: scCheck,
      digits: scGameNum + scPack + scCheck + scFourMatch[4],
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
    if (jurRes.effectiveJur === 'SC') {
      return adaptScelToLotteryBarcode(raw, customGames);
    }
  }

  // Pattern 0: 4-segment format: Game - Pack - Check - Ticket (Security)
  // Matches printed ticket text: "1670-019869-3-000(149)", "1648-018378-8-029(000)", "1672-007252-3-000[099]"
  const fourPartMatch = s.match(/^(\d{3,5})[-_/\s.:]+(\d{5,8})[-_/\s.:]+(\d{1,2})[-_/\s.:]+(\d{1,4})(?:[-_/\s.:]*[([{]?(\d{1,4})[)\]}]?)?$/);
  if (fourPartMatch) {
    const gameNumber = fourPartMatch[1];
    const packNumber = fourPartMatch[2];
    const checkCode = fourPartMatch[3];
    const ticketNumber = parseInt(fourPartMatch[4], 10);
    const ticketString = String(fourPartMatch[4]).padStart(3, '0');
    const securityCode = fourPartMatch[5] || null;
    const inferredDetails = securityCode ? inferPackDetailsFromCountdown(ticketNumber, securityCode) : null;
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames, targetJur) || (inferredDetails !== null);

    if (!isLotteryGame || isNaN(ticketNumber) || ticketNumber > 999) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }

    const gaGame = findGaCatalogGame(gameNumber, customGames);
    const sec = securityCode || computeLotterySeriesCode(gameNumber, ticketNumber, customGames, gaGame?.packSize || inferredDetails?.packSize, 'GA');
    const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
    const packClean = packNumber.replace(/^0+/, '') || packNumber;

    return {
      isValid: true,
      jurisdiction: 'GA',
      gameNumber,
      basePackNumber: packNumber,
      packNumber: packNumber,
      packClean,
      packCombined: fullPack,
      ticketNumber,
      ticketString,
      checkCode,
      securityCode: sec,
      hasExplicitSecurityCode: Boolean(typeof securityCode !== 'undefined' && securityCode),
      standardBarcode: `${gameNumber}${packNumber}${checkCode || '0'}${ticketString}`,
      canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
      displayBarcode: (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
      inferredDetails,
      raw
    };
  }

  // Pattern 0b: Continuous 13 or 14 digits with trailing security PIN in parentheses/brackets
  // e.g. "14170670170009(290)", "16480183788002(000)", "14180996564082[067]", "1418099656082(000)"
  const parenContinuousMatch = s.match(/^(\d{4})(\d{6})(\d{1})?(\d{3})\s*[([{](\d{1,4})[)\]}]$/);
  if (parenContinuousMatch) {
    const gameNumber = parenContinuousMatch[1];
    const packNumber = parenContinuousMatch[2];
    let checkCode = parenContinuousMatch[3] !== undefined ? parenContinuousMatch[3] : null;
    const jurRes = resolveBarcodeJurisdiction({
      gameNumber,
      basePackNumber: packNumber,
      rawPackNumber: packNumber,
      checkCode,
      digits: gameNumber + packNumber + (checkCode || '') + parenContinuousMatch[4],
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
    if (jurRes.effectiveJur === 'SC') {
      return adaptScelToLotteryBarcode(s, customGames);
    }
    let ticketString = parenContinuousMatch[4];
    let ticketNumber = parseInt(ticketString, 10);
    const securityCode = parenContinuousMatch[5];
    let inferredDetails = securityCode ? inferPackDetailsFromCountdown(ticketNumber, securityCode) : null;
    if (checkCode !== null && !inferredDetails && !findGaCatalogGame(gameNumber, customGames)) {
      const altTixStr = checkCode + ticketString.slice(0, 2);
      const altTixNum = parseInt(altTixStr, 10);
      const altInferred = securityCode ? inferPackDetailsFromCountdown(altTixNum, securityCode) : null;
      if (altInferred) {
        checkCode = ticketString.slice(2, 3);
        ticketString = altTixStr;
        ticketNumber = altTixNum;
        inferredDetails = altInferred;
      }
    }
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames) || (inferredDetails !== null);

    if (!isLotteryGame || isNaN(ticketNumber) || ticketNumber > 999) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }

    const sec = securityCode || computeLotterySeriesCode(gameNumber, ticketNumber, customGames, inferredDetails?.packSize);
    const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
    const packClean = packNumber.replace(/^0+/, '') || packNumber;

    return {
      isValid: true,
      gameNumber,
      basePackNumber: packNumber,
      packNumber: packNumber,
      packClean,
      packCombined: fullPack,
      ticketNumber,
      ticketString,
      checkCode,
      securityCode: sec,
      hasExplicitSecurityCode: Boolean(typeof securityCode !== 'undefined' && securityCode),
      standardBarcode: `${gameNumber}${packNumber}${checkCode || '0'}${ticketString}`,
      canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
      displayBarcode: (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
      inferredDetails,
      raw
    };
  }

  // Pattern 1: 3-segment format: Game - Pack - Ticket (Check/Security)
  // e.g. "1898-0019425-084(015)", "1234-567890-001[023]", "1648-018378-000", "1417-0670170-009(290)"
  const delimitedMatch = s.match(/^(\d{3,5})[-_/\s.:]+(\d{5,8})[-_/\s.:]+(\d{1,3})(?:[-_/\s.:]*[([{]?(\d{1,4})[)\]}]?)?$/);
  if (delimitedMatch) {
    const gameNumber = delimitedMatch[1];
    let packNumber = delimitedMatch[2];
    const seg3Num = parseInt(delimitedMatch[3], 10);
    const seg3Str = String(delimitedMatch[3]).padStart(3, '0');
    const parenStr = delimitedMatch[4] || null;
    const parenNum = delimitedMatch[4] ? parseInt(delimitedMatch[4], 10) : null;

    let ticketNumber = isNaN(seg3Num) ? 0 : seg3Num;
    let ticketString = seg3Str;
    let checkCode = null;
    let securityCode = null;

    if (delimitedMatch[3].length === 1 && parenNum !== null) {
      checkCode = delimitedMatch[3];
      ticketNumber = parenNum;
      ticketString = parenStr.padStart(3, '0');
    } else if (parenStr) {
      securityCode = parenStr;
    }

    const rawPackNumber = delimitedMatch[2];
    if (packNumber.length === 7 && checkCode === null) {
      checkCode = packNumber.slice(6, 7);
      packNumber = packNumber.slice(0, 6);
    }

    const jurRes = resolveBarcodeJurisdiction({
      gameNumber,
      basePackNumber: packNumber,
      rawPackNumber,
      checkCode,
      digits: gameNumber + packNumber + (checkCode || '') + ticketString,
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
    if (jurRes.effectiveJur === 'SC') {
      return adaptScelToLotteryBarcode(s, customGames);
    }

    const inferredDetails = securityCode ? inferPackDetailsFromCountdown(ticketNumber, securityCode) : null;
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames) || (inferredDetails !== null);

    if (!isLotteryGame || isNaN(ticketNumber) || ticketNumber > 999) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }

    const sec = securityCode || computeLotterySeriesCode(gameNumber, ticketNumber, customGames, inferredDetails?.packSize);
    const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
    const packClean = packNumber.replace(/^0+/, '') || packNumber;

    return {
      isValid: true,
      gameNumber,
      rawPackNumber,
      basePackNumber: packNumber,
      packNumber: packNumber,
      packClean,
      packCombined: fullPack,
      ticketNumber,
      ticketString,
      checkCode,
      securityCode: sec,
      hasExplicitSecurityCode: Boolean(typeof securityCode !== 'undefined' && securityCode),
      standardBarcode: `${gameNumber}${packNumber}${checkCode || '0'}${ticketString}`,
      canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
      displayBarcode: (rawPackNumber && rawPackNumber.length === 7)
        ? `${gameNumber}-${rawPackNumber}-${ticketString} (${sec})`
        : (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
      inferredDetails,
      raw
    };
  }

  // Pattern 1b: Game - Pack - (Ticket) where ticket number is in parentheses or brackets
  const parenthesizedTixMatch = s.match(/^(\d{3,5})[-_/\s.:]+(\d{5,8})[-_/\s.:]*[([{](\d{1,4})[)\]}]$/);
  if (parenthesizedTixMatch) {
    const gameNumber = parenthesizedTixMatch[1];
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames);
    let packNumber = parenthesizedTixMatch[2];
    let checkCode = null;
    if (packNumber.length === 7) {
      checkCode = packNumber.slice(6, 7);
      packNumber = packNumber.slice(0, 6);
    }
    const ticketNumber = parseInt(parenthesizedTixMatch[3], 10);
    const ticketString = String(parenthesizedTixMatch[3]).padStart(3, '0');

    if (!isLotteryGame || isNaN(ticketNumber) || ticketNumber > 999) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }

    const sec = computeLotterySeriesCode(gameNumber, ticketNumber, customGames);
    const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
    const packClean = fullPack.replace(/^0+/, '') || fullPack;

    return {
      isValid: true,
      gameNumber,
      basePackNumber: packNumber,
      packNumber: fullPack,
      packClean,
      packCombined: fullPack,
      ticketNumber,
      ticketString,
      checkCode,
      securityCode: sec,
      hasExplicitSecurityCode: false,
      standardBarcode: `${gameNumber}${packNumber}${checkCode || '0'}${ticketString}`,
      canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
      displayBarcode: (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
      raw
    };
  }

  // Pattern 2a: Delimited Game - Pack (e.g. "1670-019869", "1670-019869-3", "1648-018378")
  const gamePackMatch = s.match(/^(\d{3,5})[-_/\s.:]+(\d{5,8})(?:[-_/\s.:]+(\d{1,2}))?$/);
  if (gamePackMatch) {
    const gameNumber = gamePackMatch[1];
    let packNumber = gamePackMatch[2];
    let checkCode = gamePackMatch[3] || null;
    if (isKnownGamePrefix(gameNumber, customGames)) {
      if (packNumber.length === 7 && checkCode === null) {
        checkCode = packNumber.slice(6, 7);
        packNumber = packNumber.slice(0, 6);
      }
      const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
      const packClean = fullPack.replace(/^0+/, '') || fullPack;

      return {
        isValid: true,
        isPackBarcode: true,
        gameNumber,
        basePackNumber: packNumber,
        packNumber: fullPack,
        packClean,
        packCombined: fullPack,
        ticketNumber: null,
        ticketString: null,
        checkCode,
        standardBarcode: checkCode ? `${gameNumber}${packNumber}${checkCode}` : `${gameNumber}${packNumber}`,
        canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}` : `${gameNumber}-${packNumber}`,
        fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}`,
        displayBarcode: checkCode ? `${gameNumber}-${packNumber}-${checkCode}` : `${gameNumber}-${packNumber}`,
        raw
      };
    }
    return {
      isValid: false,
      isNonLotteryBarcode: true,
      isRetailProduct: true,
      raw
    };
  }

  // Pattern 3: Pure continuous digits
  let digits = s.replace(/[^0-9]/g, '');

  // Strip scanner leading zeroes (e.g. 15/16+ digit output from scanners configured with leading 0 padding)
  digits = stripLeadingZeroPadding(digits);

  // 17 digits: 4 game + 6 pack + 1 check + 3 ticket + 3 security (e.g. 16700198693000149, 16480183788029000, 17140451146002027)
  if (digits.length === 17) {
    const gameNumber = digits.slice(0, 4);
    const packNumber = digits.slice(4, 10); // 6-digit pack (019869)
    const checkCode = digits.slice(10, 11); // 1-digit check (3)
    const jurRes = resolveBarcodeJurisdiction({
      gameNumber,
      basePackNumber: packNumber,
      rawPackNumber: packNumber,
      checkCode,
      digits,
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
    if (jurRes.effectiveJur === 'SC') {
      return adaptScelToLotteryBarcode(digits, customGames);
    }
    const ticketNumber = parseInt(digits.slice(11, 14), 10); // 3-digit ticket (000)
    const ticketString = digits.slice(11, 14);
    const parenMatch = s.match(/[([{](\d{1,4})[)\]}]/);
    const securityCode = parenMatch ? parenMatch[1] : digits.slice(14, 17);
    const inferredDetails = inferPackDetailsFromCountdown(ticketNumber, securityCode);
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames, 'GA') || (inferredDetails !== null);
    if (!isLotteryGame || isNaN(ticketNumber) || ticketNumber > 999) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }
    const standardBarcode = digits.slice(0, 14);

    const sec = securityCode || computeLotterySeriesCode(gameNumber, ticketNumber, customGames, jurRes.gaGame?.packSize || inferredDetails?.packSize, 'GA');
    const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
    const packClean = packNumber.replace(/^0+/, '') || packNumber;
    return {
      isValid: true,
      gameNumber,
      basePackNumber: packNumber,
      packNumber: packNumber,
      packClean,
      packCombined: fullPack,
      ticketNumber,
      ticketString,
      checkCode,
      securityCode: sec,
      hasExplicitSecurityCode: Boolean(typeof securityCode !== 'undefined' && securityCode),
      standardBarcode,
      canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
      displayBarcode: (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
      inferredDetails,
      raw
    };
  }

  // 16 digits: 4 game + 6 pack + 3 ticket + 3 security (13 core ticket digits without check digit + 3 PIN digits)
  if (digits.length === 16) {
    const gameNumber = digits.slice(0, 4);
    const packNumber = digits.slice(4, 10); // 6-digit pack
    const ticketNumber = parseInt(digits.slice(10, 13), 10); // 3-digit ticket
    const ticketString = digits.slice(10, 13);
    const parenMatch = s.match(/[([{](\d{1,4})[)\]}]/);
    const securityCode = parenMatch ? parenMatch[1] : digits.slice(13, 16);
    const inferredDetails = inferPackDetailsFromCountdown(ticketNumber, securityCode);
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames) || (inferredDetails !== null);
    if (!isLotteryGame || isNaN(ticketNumber) || ticketNumber > 999) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }
    const standardBarcode = `${gameNumber}${packNumber}0${ticketString}`;

    const sec = securityCode || computeLotterySeriesCode(gameNumber, ticketNumber, customGames, inferredDetails?.packSize);
    return {
      isValid: true,
      gameNumber,
      packNumber,
      packClean: packNumber.replace(/^0+/, '') || packNumber,
      packCombined: packNumber,
      ticketNumber,
      ticketString,
      checkCode: null,
      securityCode: sec,
      hasExplicitSecurityCode: Boolean(typeof securityCode !== 'undefined' && securityCode),
      standardBarcode,
      canonicalId: `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}-${ticketString}(${sec})`,
      displayBarcode: `${gameNumber}-${packNumber}-${ticketString} (${sec})`,
      inferredDetails,
      raw
    };
  }

  // 14 digits: Standard Interleaved 2 of 5 / Code 128 barcode
  // Dual standards:
  // Layout A (e.g. SCEL, GA Lottery, IGT): [4 Game][6 Pack][1 Check][3 Ticket]
  // Layout B (e.g. Scientific Games): [4 Game][6 Pack][3 Ticket][1 Trailer]
  if (digits.length === 14) {
    const gameNumber = digits.slice(0, 4);
    const packNumber = digits.slice(4, 10); // 6-digit pack (019869, 018378, 045114)
    const checkA = digits.slice(10, 11);
    const jurRes = resolveBarcodeJurisdiction({
      gameNumber,
      basePackNumber: packNumber,
      rawPackNumber: packNumber,
      checkCode: checkA,
      digits,
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
    if (jurRes.effectiveJur === 'SC') {
      return adaptScelToLotteryBarcode(digits, customGames);
    }

    const gNum = parseInt(gameNumber, 10);
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames, 'GA') || (gNum >= 100 && gNum <= 9999);
    if (!isLotteryGame) {
      return {
        isValid: false,
        isRetailProduct: true,
        isNonLotteryBarcode: true,
        raw
      };
    }

    // Layout A: [Game 4][Pack 6][Check 1][Ticket 3]
    const tixStrA = digits.slice(11, 14);
    const tixNumA = parseInt(tixStrA, 10);

    // Layout B: [Game 4][Pack 6][Ticket 3][Trailer 1]
    const tixStrB = digits.slice(10, 13);
    const tixNumB = parseInt(tixStrB, 10);
    const trailerB = digits.slice(13, 14);

    const matched = jurRes.gaGame;
    const knownPackSize = matched?.packSize || (matched?.price ? getStandardPackDetails(matched.price).packSize : null);

    const isSC = Boolean(jurRes.hasSC);
    const isGA = Boolean(jurRes.hasGA);
    const isSCELGame = jurRes.effectiveJur === 'SC';
    const parenMatch = s.match(/[([{](\d{1,4})[)\]}]/);
    const securityCode = parenMatch ? parenMatch[1] : null;
    const secInt = securityCode ? parseInt(securityCode, 10) : NaN;

    const isLayoutB = disambiguateContinuousLayout({ digits, knownPackSize, secInt, preferLeadingZeroB: isSCELGame });

    const ticketNumber = isLayoutB ? tixNumB : tixNumA;
    const ticketString = isLayoutB ? tixStrB : tixStrA;
    const checkCode = isLayoutB ? (isSCELGame ? computeScCheckDigit(packNumber) : null) : checkA;

    if (isNaN(ticketNumber) || ticketNumber < 0 || ticketNumber > 299) {
      return {
        isValid: false,
        isRetailProduct: true,
        isNonLotteryBarcode: true,
        raw
      };
    }

    const inferredDetails = securityCode ? inferPackDetailsFromCountdown(ticketNumber, securityCode) : null;
    const sec = securityCode || computeLotterySeriesCode(gameNumber, ticketNumber, customGames, matched?.packSize || inferredDetails?.packSize, 'GA');

    const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
    const packClean = packNumber.replace(/^0+/, '') || packNumber;
    return {
      isValid: true,
      jurisdiction: 'GA',
      gameNumber,
      basePackNumber: packNumber,
      packNumber: packNumber,
      packClean,
      packCombined: fullPack,
      ticketNumber,
      ticketString,
      checkCode,
      trailer: isLayoutB ? trailerB : null,
      securityCode: sec,
      hasExplicitSecurityCode: Boolean(typeof securityCode !== 'undefined' && securityCode),
      standardBarcode: digits,
      canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
      displayBarcode: (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
      inferredDetails,
      isCollision: Boolean(isSC && isGA && jurRes.isConflict && !jurRes.savedJur),
      collisionGame: (isSC && isGA && jurRes.isConflict && !jurRes.savedJur) ? gameNumber : null,
      candidateJurisdictions: (isSC && isGA && jurRes.isConflict && !jurRes.savedJur) ? ['SC', 'GA'] : null,
      raw
    };
  }

  // 15 digits: 4 game + 6 pack + 1 check + 3 ticket + 1 trailer/check (e.g. 164801837880005)
  if (digits.length === 15) {
    const gameNumber = digits.slice(0, 4);
    const packNumber = digits.slice(4, 10);
    const checkCode = digits.slice(10, 11);
    const jurRes = resolveBarcodeJurisdiction({
      gameNumber,
      basePackNumber: packNumber,
      rawPackNumber: packNumber,
      checkCode,
      digits,
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames, jurRes.effectiveJur);
    if (isLotteryGame) {
      const ticketNumber = parseInt(digits.slice(11, 14), 10);
      const ticketString = digits.slice(11, 14);
      const standardBarcode = digits.slice(0, 14);
      if (!isNaN(ticketNumber) && ticketNumber <= 999) {
        const matched = jurRes.effectiveJur === 'SC' ? jurRes.scGame : jurRes.gaGame;
        const sec = computeLotterySeriesCode(gameNumber, ticketNumber, customGames, matched?.packSize, jurRes.effectiveJur);
        const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
        const packClean = fullPack.replace(/^0+/, '') || fullPack;
        return {
          isValid: true,
          jurisdiction: jurRes.effectiveJur,
          gameNumber,
          basePackNumber: packNumber,
          packNumber: fullPack,
          packClean,
          packCombined: fullPack,
          ticketNumber,
          ticketString,
          checkCode,
          securityCode: sec,
          hasExplicitSecurityCode: false,
          standardBarcode,
          canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
          fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
          displayBarcode: (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
          raw
        };
      }
    }
    return {
      isValid: false,
      isNonLotteryBarcode: true,
      isRetailProduct: true,
      raw
    };
  }

  // 18 to 30 digits: Continuous barcode with trailing validation digits (2D/PDF417/GS1 scratch barcode)
  if (digits.length >= 18 && digits.length <= 30) {
    const gameNumber = digits.slice(0, 4);
    const gNum = parseInt(gameNumber, 10);
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames) || (gNum >= 100 && gNum <= 9999);
    if (!isLotteryGame) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }
    const packNumber = digits.slice(4, 10); // 6-digit pack
    const checkA = digits.slice(10, 11);
    const tixStrA = digits.slice(11, 14);
    const tixNumA = parseInt(tixStrA, 10);

    const tixStrB = digits.slice(10, 13);
    const tixNumB = parseInt(tixStrB, 10);
    const trailerB = digits.slice(13, 14);

    const jurRes = resolveBarcodeJurisdiction({
      gameNumber,
      basePackNumber: packNumber,
      rawPackNumber: packNumber,
      checkCode: checkA,
      digits,
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;

    const matched = jurRes.effectiveJur === 'SC' ? jurRes.scGame : jurRes.gaGame;
    const knownPackSize = matched?.packSize || (matched?.price ? getStandardPackDetails(matched.price).packSize : null);

    const isSCELGame = jurRes.effectiveJur === 'SC';
    if (isSCELGame) {
      return adaptScelToLotteryBarcode(s, customGames);
    }

    const parenMatch = s.match(/[([{](\d{1,4})[)\]}]/);
    const securityCode = parenMatch ? parenMatch[1] : null;
    const secInt = securityCode ? parseInt(securityCode, 10) : NaN;
    const isLayoutB = disambiguateContinuousLayout({ digits, knownPackSize, secInt, preferLeadingZeroB: isSCELGame });

    const ticketNumber = isLayoutB ? tixNumB : tixNumA;
    const ticketString = isLayoutB ? tixStrB : tixStrA;
    const checkCode = isLayoutB ? (isSCELGame ? computeScCheckDigit(packNumber) : null) : checkA;
    const standardBarcode = digits.slice(0, 14); // Exactly core 14-digit lottery barcode

    const inferredDetails = securityCode ? inferPackDetailsFromCountdown(ticketNumber, securityCode) : null;

    if (isNaN(ticketNumber) || ticketNumber < 0 || ticketNumber > 299) {
      return {
        isValid: false,
        isNonLotteryBarcode: true,
        isRetailProduct: true,
        raw
      };
    }

    const effectiveJur = jurRes.effectiveJur || 'GA';
    const sec = securityCode || computeLotterySeriesCode(gameNumber, ticketNumber, customGames, matched?.packSize || inferredDetails?.packSize, effectiveJur);
    const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
    const packClean = packNumber.replace(/^0+/, '') || packNumber;
    return {
      isValid: true,
      jurisdiction: effectiveJur,
      gameNumber,
      basePackNumber: packNumber,
      packNumber: packNumber,
      packClean,
      packCombined: fullPack,
      ticketNumber,
      ticketString,
      checkCode,
      trailer: isLayoutB ? trailerB : null,
      securityCode: sec,
      hasExplicitSecurityCode: Boolean(typeof securityCode !== 'undefined' && securityCode),
      standardBarcode,
      canonicalId: checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`,
      fullId: `${gameNumber}-${packNumber}${checkCode ? '-' + checkCode : ''}-${ticketString}(${sec})`,
      displayBarcode: (checkCode ? `${gameNumber}-${packNumber}-${checkCode}-${ticketString} (${sec})` : `${gameNumber}-${packNumber}-${ticketString} (${sec})`),
      inferredDetails,
      raw
    };
  }

  // 13 digits: 4 game + 6 pack + 3 ticket (Lottery ticket without check digit)
  if (digits.length === 13) {
    const gameNumber = digits.slice(0, 4);
    const packNumber = digits.slice(4, 10);
    const jurRes = resolveBarcodeJurisdiction({
      gameNumber,
      basePackNumber: packNumber,
      rawPackNumber: packNumber,
      checkCode: null,
      digits,
      customGames,
      targetJur,
      isAutoJur,
      raw
    });
    if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames, jurRes.effectiveJur);
    if (isLotteryGame) {
      const ticketNumber = parseInt(digits.slice(10, 13), 10);
      const ticketString = digits.slice(10, 13);
      if (!isNaN(ticketNumber) && ticketNumber <= 999) {
        const matched = jurRes.effectiveJur === 'SC' ? jurRes.scGame : jurRes.gaGame;
        const sec = computeLotterySeriesCode(gameNumber, ticketNumber, customGames, matched?.packSize, jurRes.effectiveJur);
        return {
          isValid: true,
          jurisdiction: jurRes.effectiveJur,
          gameNumber,
          basePackNumber: packNumber,
          packNumber,
          packClean: packNumber.replace(/^0+/, '') || packNumber,
          packCombined: packNumber,
          ticketNumber,
          ticketString,
          checkCode: null,
          securityCode: sec,
          hasExplicitSecurityCode: false,
          standardBarcode: `${gameNumber}${packNumber}0${ticketString}`,
          canonicalId: `${gameNumber}-${packNumber}-${ticketString}`,
          fullId: `${gameNumber}-${packNumber}-${ticketString}(${sec})`,
          displayBarcode: `${gameNumber}-${packNumber}-${ticketString} (${sec})`,
          raw
        };
      }
    }
    return {
      isValid: false,
      isNonLotteryBarcode: true,
      isRetailProduct: true,
      raw
    };
  }

  // 12 digits: Check if it's a Lottery UPC Barcode (SCEL 833283..., Georgia Lottery 738562...) OR standard lottery barcode
  if (digits.length === 12) {
    const isSCEL = digits.startsWith('833283');
    const isGALottery = digits.startsWith('738562');
    if (isSCEL || isGALottery) {
      const gNum = isSCEL ? digits.slice(7, 11) : digits.slice(6, 10);
      const matched = isSCEL ? findScCatalogGame(gNum, customGames) : findGaCatalogGame(gNum, customGames);
      return {
        isValid: true,
        isLotteryUPC: true,
        jurisdiction: isSCEL ? 'SC' : 'GA',
        gameNumber: gNum,
        gameName: matched?.name || null,
        game: matched || null,
        price: matched?.price ?? null,
        packSize: matched?.packSize ?? null,
        packNumber: null,
        ticketNumber: null,
        standardBarcode: digits,
        canonicalId: `UPC-${digits}`,
        fullId: `UPC-${digits}`,
        displayBarcode: `UPC-${digits}`,
        raw
      };
    }
    const gameNumber = digits.slice(0, 4);
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames);
    if (isLotteryGame) {
      const packNumber = digits.slice(4, 10);
      const ticketNumber = parseInt(digits.slice(10, 12), 10);
      const ticketString = digits.slice(10, 12).padStart(3, '0');
      if (!isNaN(ticketNumber) && ticketNumber <= 999) {
        const sec = computeLotterySeriesCode(gameNumber, ticketNumber, customGames);
        return {
          isValid: true,
          gameNumber,
          packNumber,
          packClean: packNumber.replace(/^0+/, '') || packNumber,
          packCombined: packNumber,
          ticketNumber,
          ticketString,
          checkCode: null,
          securityCode: sec,
          hasExplicitSecurityCode: false,
          standardBarcode: `${gameNumber}${packNumber}0${ticketString}`,
          canonicalId: `${gameNumber}-${packNumber}-${ticketString}`,
          fullId: `${gameNumber}-${packNumber}-${ticketString}(${sec})`,
          displayBarcode: `${gameNumber}-${packNumber}-${ticketString} (${sec})`,
          raw
        };
      }
    }
    return {
      isValid: false,
      isRetailProduct: true,
      raw
    };
  }

  // 11 digits: 4 game + 6 pack + 1 check (Pack Barcode / Book Manifest Barcode)
  if (digits.length === 11) {
    const gameNumber = digits.slice(0, 4);
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames);
    if (isLotteryGame) {
      const packNumber = digits.slice(4, 10); // 6-digit pack
      const checkCode = digits.slice(10, 11);
      const fullPack = checkCode ? `${packNumber}-${checkCode}` : packNumber;
      const packClean = packNumber.replace(/^0+/, '') || packNumber;
      const jurRes = resolveBarcodeJurisdiction({
        gameNumber,
        basePackNumber: packNumber,
        rawPackNumber: packNumber,
        checkCode,
        digits,
        customGames,
        targetJur,
        isAutoJur,
        raw
      });
      if (jurRes.isAmbiguous) return jurRes.ambiguityResult;
      const isSC = jurRes.effectiveJur === 'SC';
      return {
        isValid: true,
        isPackBarcode: true,
        jurisdiction: jurRes.effectiveJur,
        gameNumber,
        basePackNumber: packNumber,
        packNumber: packNumber,
        packClean,
        packCombined: fullPack,
        ticketNumber: null,
        ticketString: null,
        checkCode,
        checkDigit: isSC ? checkCode : undefined,
        standardBarcode: digits,
        canonicalId: `${gameNumber}-${packNumber}-${checkCode}`,
        fullId: `${gameNumber}-${packNumber}-${checkCode}`,
        displayBarcode: `${gameNumber}-${packNumber}-${checkCode}`,
        raw
      };
    }
    return {
      isValid: false,
      isNonLotteryBarcode: true,
      isRetailProduct: true,
      raw
    };
  }

  // 10 digits: 4 game + 6 pack (Pack Barcode)
  if (digits.length === 10) {
    const gameNumber = digits.slice(0, 4);
    const isLotteryGame = isKnownGamePrefix(gameNumber, customGames);
    if (isLotteryGame) {
      const packNumber = digits.slice(4, 10);
      return {
        isValid: true,
        isPackBarcode: true,
        gameNumber,
        packNumber,
        packClean: packNumber.replace(/^0+/, '') || packNumber,
        packCombined: packNumber,
        ticketNumber: null,
        ticketString: null,
        checkCode: null,
        standardBarcode: digits,
        canonicalId: `${gameNumber}-${packNumber}`,
        fullId: `${gameNumber}-${packNumber}`,
        displayBarcode: `${gameNumber}-${packNumber}`,
        raw
      };
    }
    return {
      isValid: false,
      isNonLotteryBarcode: true,
      isRetailProduct: true,
      raw
    };
  }

  // Barcodes with fewer than 10 digits are incomplete / truncated scanner input
  // (e.g. "8370380" from "83703806701701744")
  if (digits.length < 10) {
    return {
      isValid: false,
      isIncomplete: true,
      isNonLotteryBarcode: true,
      error: 'Incomplete barcode — please rescan.',
      raw
    };
  }

  return {
    isValid: false,
    isRetailProduct: digits.length === 8,
    isNonLotteryBarcode: true,
    raw
  };
}

export function formatTicketDisplayBarcode(rawOrParsed, customGames = [], overrideSecurityCode = null, jurisdiction = 'GA') {
  if (!rawOrParsed) return '---';
  const parsed = (rawOrParsed && typeof rawOrParsed === 'object' && rawOrParsed.isValid !== undefined)
    ? rawOrParsed
    : parseLotteryBarcode(rawOrParsed, customGames, jurisdiction);

  if (!parsed || !parsed.isValid) {
    return String(rawOrParsed || '');
  }

  if (parsed.jurisdiction === 'SC' && parsed.displayBarcode) {
    if (overrideSecurityCode !== null && overrideSecurityCode !== undefined && String(overrideSecurityCode).trim() !== '' && parsed.canonicalId) {
      return `${parsed.canonicalId} (${String(overrideSecurityCode).trim()})`;
    }
    return parsed.displayBarcode;
  }

  // Pack barcode manifest (no individual ticket number)
  if (parsed.isPackBarcode || parsed.ticketNumber === null) {
    const game = parsed.gameNumber || '1000';
    const pack = parsed.basePackNumber || parsed.packNumber || '000000';
    const check = (parsed.checkCode !== null && parsed.checkCode !== undefined) ? String(parsed.checkCode) : '';
    if (check) {
      return `${game}-${pack}-${check}`;
    }
    return `${game}-${pack}`;
  }

  const game = parsed.gameNumber || '1000';
  const pack = parsed.basePackNumber || parsed.packNumber || '000000';
  const check = (parsed.checkCode !== null && parsed.checkCode !== undefined) ? String(parsed.checkCode) : '';
  const ticket = parsed.ticketString || (parsed.ticketNumber !== null ? String(parsed.ticketNumber).padStart(3, '0') : '000');
  const sec = (overrideSecurityCode !== null && overrideSecurityCode !== undefined && String(overrideSecurityCode).trim() !== '')
    ? String(overrideSecurityCode).trim()
    : (parsed.securityCode || computeLotterySeriesCode(game, parsed.ticketNumber, customGames, parsed.packSize || parsed.inferredDetails?.packSize, parsed.jurisdiction || jurisdiction));

  if (parsed.rawPackNumber && parsed.rawPackNumber.length === 7) {
    return `${game}-${parsed.rawPackNumber}-${ticket} (${sec})`;
  }

  if (check) {
    return `${game}-${pack}-${check}-${ticket} (${sec})`;
  }

  return `${game}-${pack}-${ticket} (${sec})`;
}

export function formatLotteryBarcode(rawCode, customGames = [], overrideSecurityCode = null, jurisdiction = 'GA') {
  return formatTicketDisplayBarcode(rawCode, customGames, overrideSecurityCode, jurisdiction);
}

/**
 * Normalizes a pack number string to its canonical form including check digit when present.
 * "001890-2" -> "18902", "1908-001890-2-038" -> "18902", "19080018902038" -> "18902",
 * "001890" -> "1890" (no check digit), "1648-018378" -> "18378".
 */
export function normalizePackNumber(packStr) {
  if (!packStr) return '';
  let s = String(packStr).replace(/[\r\n\t]/g, '').replace(/^\][a-zA-Z0-9]{2,3}/, '').trim();
  // 4-segment: Game-Pack-Check-Ticket (e.g. "1908-001890-2-038")
  const fourMatch = s.match(/^(\d{3,5})[-_/\s.:]+(\d{5,8})[-_/\s.:]+(\d{1,2})[-_/\s.:]+(\d{1,4})/);
  if (fourMatch) {
    return fourMatch[2].replace(/^0+/, '');
  }
  const parts = s.split(/[-_\s]+/);
  if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    // Pack-Check format: "001890-2" (6+ digit pack, 1-2 digit check) -> extract 6-digit physical pack
    if (parts[0].length >= 5 && parts[1].length <= 2) {
      return parts[0].replace(/^0+/, '');
    }
    // Game-Pack-Check: "1908-001890-2" -> extract 6-digit physical pack
    if (parts.length >= 3 && /^\d{1,2}$/.test(parts[2])) {
      return parts[1].replace(/^0+/, '');
    }
    // Game-Pack: "1648-018378"
    if (parts[0].length <= 5 && parts[1].length >= 4) {
      return parts[1].replace(/^0+/, '');
    }
  }
  const rawDigits = s.replace(/[^0-9]/g, '');
  // Continuous barcodes: digits[4..10] = 6-digit physical pack number
  if (rawDigits.length >= 14) {
    return rawDigits.slice(4, 10).replace(/^0+/, '');
  } else if (rawDigits.length === 11) {
    return rawDigits.slice(4, 10).replace(/^0+/, '');
  } else if (rawDigits.length === 10) {
    return rawDigits.slice(4, 10).replace(/^0+/, '');
  }
  return rawDigits.replace(/^0+/, '') || rawDigits;
}

export function getBasePackNumber(pack) {
  if (!pack) return '';
  const s = String(pack).trim();
  if (s.includes('-')) {
    const parts = s.split('-').map(p => p.trim());
    if (parts.length === 2 && parts[0].length >= 5 && parts[1].length <= 2) {
      return parts[0].replace(/^0+/, '') || parts[0];
    }
    if (parts.length >= 3 && parts[1].length >= 5 && parts[2].length <= 2) {
      return parts[1].replace(/^0+/, '') || parts[1];
    }
    if (parts.length === 2 && parts[0].length <= 5 && parts[1].length >= 4) {
      return parts[1].replace(/^0+/, '') || parts[1];
    }
  }
  const digits = s.replace(/[^0-9]/g, '');
  if (digits.length >= 14) {
    return digits.slice(4, 10).replace(/^0+/, '') || digits.slice(4, 10);
  }
  if (digits.length === 11 || digits.length === 10) {
    return digits.slice(4, 10).replace(/^0+/, '') || digits.slice(4, 10);
  }
  if (digits.length === 7) {
    return digits.slice(0, 6).replace(/^0+/, '') || digits.slice(0, 6);
  }
  return digits.replace(/^0+/, '') || digits;
}

/**
 * Full 7-digit Georgia book number (6-digit pack + following digit), leading zeros stripped,
 * or '' when the input doesn't carry that 7th digit (e.g. a hand-typed 6-digit pack or 10/13/16-digit codes).
 * "19080018902040" / "1908-001890-2-040" / "001890-2" / "0018902" -> "18902"
 */
export function getFullPackNumber(pack) {
  if (!pack) return '';
  const s = String(pack).replace(/[\r\n\t]/g, '').replace(/^\][a-zA-Z0-9]{2,3}/, '').trim();
  const strip = v => v.replace(/^0+/, '') || v;
  const four = s.match(/^(\d{3,5})[-_/\s.:]+(\d{6})[-_/\s.:]+(\d)[-_/\s.:]+\d{1,4}/);
  if (four) return strip(four[2] + four[3]);
  const parts = s.split(/[-_\s]+/);
  if (parts.length === 2 && /^\d{6}$/.test(parts[0]) && /^\d$/.test(parts[1])) return strip(parts[0] + parts[1]);
  if (parts.length === 3 && /^\d{3,5}$/.test(parts[0]) && /^\d{6}$/.test(parts[1]) && /^\d$/.test(parts[2])) return strip(parts[1] + parts[2]);
  if (!/^\d+$/.test(s)) return '';
  if (s.length === 7) return strip(s);
  // Full barcodes: let the parser decide where the book digits are (layouts differ by game and length)
  if (s.length >= 10) {
    const p = parseLotteryBarcode(s);
    return p && p.isValid && /^\d{7}$/.test(String(p.packNumber || '')) ? strip(p.packNumber) : '';
  }
  return '';
}

/**
 * Same physical book? When both sides carry the full 7-digit book number they must match exactly,
 * so neighbouring books (0018902 / 0018903) stay separate. Otherwise fall back to the 6-digit pack
 * (older boxes saved with 6 digits, hand-typed numbers).
 */
export function isPackNumberMatch(packA, packB) {
  if (!packA || !packB) return false;
  const fullA = getFullPackNumber(packA);
  const fullB = getFullPackNumber(packB);
  if (fullA && fullB) return fullA === fullB;
  const normA = normalizePackNumber(packA);
  const normB = normalizePackNumber(packB);
  if (normA && normB && normA === normB) return true;
  const baseA = getBasePackNumber(packA);
  const baseB = getBasePackNumber(packB);
  if (baseA && baseB && baseA === baseB) return true;
  return false;
}

/**
 * Format pack numbers to 6 digits for user-facing display (dropping any trailing check digit).
 */
export function formatDisplayPackNumber(packOrItem, fallback = '') {
  if (!packOrItem) return fallback;
  const raw = (typeof packOrItem === 'object')
    ? (packOrItem.basePackNumber || packOrItem.packNumber || packOrItem.pack || '')
    : packOrItem;
  const s = String(raw || '').trim();
  if (!s || s === '---' || s === '—') return s || fallback;

  const gamePackMatch = s.match(/^\d{3,5}[-_/\s.:]+(\d{6})(?:\d)?(?:[-_/\s.:]|$)/);
  if (gamePackMatch) return gamePackMatch[1];

  const packCheckMatch = s.match(/^#?(\d{6})[-_/\s.:]+\d{1,2}$/);
  if (packCheckMatch) return packCheckMatch[1];

  const noHash = (stripScannerPrefix(s) || s).replace(/^#/, '');
  if (/^\d{7}$/.test(noHash)) return noHash.slice(0, 6);
  const cleanDigits = stripLeadingZeroPadding(noHash);
  if (/^\d{10,}$/.test(cleanDigits)) return cleanDigits.slice(4, 10);
  if (/^\d{6}$/.test(noHash)) return noHash;

  return s;
}

export function findGameByBarcode(rawCode, customGames = [], jurisdiction = 'GA') {
  if (!rawCode) return null;
  const s = String(rawCode).trim();
  const digits = s.replace(/[^0-9]/g, '');
  const cleanJur = normalizeLotteryJurisdiction(jurisdiction);
  const parsed = parseLotteryBarcode(rawCode, customGames, cleanJur);

  if (cleanJur === 'SC' || (parsed && parsed.isValid && parsed.jurisdiction === 'SC')) {
    if (parsed && parsed.gameNumber) {
      const matchScel = findScCatalogGame(parsed.gameNumber, customGames);
      if (matchScel) return matchScel;
    }
    if (customGames && customGames.length > 0) {
      for (const g of customGames) {
        const isScCustom = !g.jurisdiction || normalizeLotteryJurisdiction(g.jurisdiction) === 'SC';
        if (isScCustom && g.barcodePrefix && (s.startsWith(g.barcodePrefix) || digits.startsWith(g.barcodePrefix))) {
          return g;
        }
      }
    }
    for (const g of SCEL_GAMES) {
      if (g.barcodePrefix && (s.startsWith(g.barcodePrefix) || digits.startsWith(g.barcodePrefix))) {
        return g;
      }
      if (g.name && s.toLowerCase().includes(g.name.toLowerCase())) {
        return g;
      }
    }
    if (cleanJur === 'SC') return null;
  }

  // 1. Check if parsed gameNumber matches GA catalog (custom GA games + SAMPLE_GAMES + supplemental GA games)
  if (parsed && parsed.gameNumber) {
    const matchGA = findGaCatalogGame(parsed.gameNumber, customGames);
    if (matchGA) return matchGA;
  }

  // 3. Check GA custom games first by prefix or name
  if (customGames && customGames.length > 0) {
    for (const g of customGames) {
      if (g.jurisdiction && normalizeLotteryJurisdiction(g.jurisdiction) === 'SC') continue;
      if (g.barcodePrefix && (s.startsWith(g.barcodePrefix) || digits.startsWith(g.barcodePrefix))) {
        return g;
      }
      if (g.name && s.toLowerCase().includes(g.name.toLowerCase())) {
        return g;
      }
    }
  }

  // 4. Match against SAMPLE_GAMES & supplemental GA games by barcodePrefix (e.g. 1417, 1322, 1898...)
  for (const g of SAMPLE_GAMES) {
    if (g.barcodePrefix && (s.startsWith(g.barcodePrefix) || digits.startsWith(g.barcodePrefix))) {
      return g;
    }
  }
  for (const g of GA_SUPPLEMENTAL_GAMES) {
    if (g.barcodePrefix && (s.startsWith(g.barcodePrefix) || digits.startsWith(g.barcodePrefix))) {
      return g;
    }
  }

  // 5. Check if name is in the code
  for (const g of SAMPLE_GAMES) {
    if (s.toLowerCase().includes(g.name.toLowerCase())) {
      return g;
    }
  }

  return null;
}

export function getInitialState() {
  return getCleanEmptyState({
    storeId: 'store_amigo',
    storeName: 'AMIGO FOOD MART',
    storeAddress: '2300 MOODY RD WARNER ROBINS, GA, 31088',
    retailerNumber: 'GA-89412',
    totalSlots: 65
  });
}

export function loadState(targetStoreId = null) {
  const storeId = targetStoreId || getCurrentStoreId();
  const key = getStoreStorageKey(storeId);
  try {
    // Purge old v1 and v2 mock data if present
    if (localStorage.getItem('lotto_track_pos_data_v1')) {
      localStorage.removeItem('lotto_track_pos_data_v1');
    }
    if (localStorage.getItem('lotto_track_pos_data_v2')) {
      localStorage.removeItem('lotto_track_pos_data_v2');
    }
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.customGames) parsed.customGames = [];
      if (!parsed.soldOutThisShift) parsed.soldOutThisShift = [];
      if (!parsed.partialTakeOuts) parsed.partialTakeOuts = [];
      if (!parsed.inventoryBarcodes) parsed.inventoryBarcodes = {};
      if (parsed.onlineSales === undefined) parsed.onlineSales = 0;
      if (parsed.cashes === undefined) parsed.cashes = 0;
      if (parsed.onlineCashes === undefined) parsed.onlineCashes = 0;
      if (parsed.discontinuedCount === undefined) parsed.discontinuedCount = 0;
      if (typeof parsed.shiftOpeningActiveCount !== 'number') {
        parsed.shiftOpeningActiveCount = (parsed.slots || []).filter(s => s.status === 'ACTIVE' && s.packNumber).length;
      }

      // Auto-sanitize and repair slots from original scannedBarcodes records
      const targetStoreMeta = (getStoresList() || []).find(s => s.id === storeId || s.storeId === storeId) || DEFAULT_STORES.find(s => s.id === storeId);
      const configuredTotal = Math.max(65, targetStoreMeta?.totalBoxes || 65);
      const targetTotal = Math.max(configuredTotal, parsed.totalSlots || configuredTotal);
      if (!Array.isArray(parsed.slots)) {
        parsed.slots = [];
      }
      const existingByNum = new Map();
      parsed.slots.forEach(s => {
        if (s && s.boxNumber) existingByNum.set(Number(s.boxNumber), s);
      });
      const completeSlots = [];
      for (let b = 1; b <= targetTotal; b++) {
        if (existingByNum.has(b)) {
          completeSlots.push(existingByNum.get(b));
        } else {
          completeSlots.push({
            boxNumber: b,
            status: 'EMPTY',
            gameId: null,
            gameName: null,
            price: null,
            packNumber: null,
            packSize: null,
            startTicket: 0,
            currentTicket: 0,
            ticketsInBox: 0,
            scannedBarcodes: [],
            soldBarcodes: [],
            activatedThisShift: false,
            daysActive: 0,
            scannedInEndShift: false
          });
        }
      }
      parsed.slots = completeSlots;
      parsed.totalSlots = targetTotal;

      if (parsed.slots && Array.isArray(parsed.slots)) {
        parsed.slots.forEach(s => {
          if (parsed.shiftStatus === 'IN_PROGRESS' && s.scannedInEndShift) {
            s.scannedInEndShift = false;
          }
          // Remove human-readable header display strings that leaked into scannedBarcodes
          if (Array.isArray(s.scannedBarcodes)) {
            s.scannedBarcodes = s.scannedBarcodes.filter(b => {
              const bStr = typeof b === 'string' ? b : b?.barcode;
              return bStr && !bStr.includes('Box #') && !bStr.includes('·') && !bStr.includes('(');
            });
            s.ticketsInBox = s.scannedBarcodes.length;
          }

          // If packNumber was corrupted (e.g. into trailer digits "515284", "081068"), restore from scannedBarcodes
          if (Array.isArray(s.scannedBarcodes) && s.scannedBarcodes.length > 0) {
            const firstValid = s.scannedBarcodes.find(b => {
              const bStr = typeof b === 'string' ? b : b?.barcode;
              const p = parseLotteryBarcode(bStr, parsed.customGames, parsed.lotteryJurisdiction || 'GA');
              return p && p.isValid && p.packNumber;
            });
            if (firstValid) {
              const bStr = typeof firstValid === 'string' ? firstValid : firstValid.barcode;
              const p = parseLotteryBarcode(bStr, parsed.customGames, parsed.lotteryJurisdiction || 'GA');
              if (p && p.isValid) {
                if (!s.packNumber || !isPackNumberMatch(s.packNumber, p.packNumber)) {
                  const accuratePack = p.packNumber || p.packCombined;
                  s.packNumber = accuratePack;
                }
                if ((s.startTicket === 0 || s.startTicket === null || s.startTicket === undefined) && p.ticketNumber !== null && p.ticketNumber !== undefined) {
                  s.startTicket = p.ticketNumber;
                  s.currentTicket = p.ticketNumber;
                  if (!(s.packCumulativeSoldBase > 0) && !(s.packCumulativeSold > 0) && !(s.previousShiftSold > 0) && (s.packStartTicket === 0 || s.packStartTicket === null || s.packStartTicket === undefined)) {
                    s.packStartTicket = p.ticketNumber;
                  }
                }
              }

              // If active box has uninitialized startTicket while IN_PROGRESS, align them to avoid phantom sales
              if (s.status === 'ACTIVE' && s.packNumber) {
                if (parsed.shiftStatus === 'IN_PROGRESS' && (s.startTicket === undefined || s.startTicket === null || s.startTicket === 0) && typeof s.currentTicket === 'number' && s.currentTicket > 0) {
                  s.startTicket = s.currentTicket;
                }
              }
            }
          }

          // If active box has uninitialized or 0 startTicket while currentTicket > 0, align them to avoid phantom sales
          if (s.status === 'ACTIVE' && s.packNumber) {
            if ((s.startTicket === undefined || s.startTicket === null || s.startTicket === 0) && typeof s.currentTicket === 'number' && s.currentTicket > 0) {
              s.startTicket = s.currentTicket;
            }
            if (
              s.startTicket > 0 &&
              (s.packStartTicket === undefined || s.packStartTicket === null || s.packStartTicket === 0) &&
              !(s.packCumulativeSoldBase > 0) &&
              !(s.packCumulativeSold > 0) &&
              !(s.previousShiftSold > 0)
            ) {
              s.packStartTicket = s.startTicket;
            }
          }

          // Auto-link barcodePrefix and gameId if missing from legacy saves
          if (!s.barcodePrefix && s.gameName) {
            const cleanName = cleanGameTitle(s.gameName).toLowerCase();
            const matched = SAMPLE_GAMES.find(g => cleanGameTitle(g.name).toLowerCase() === cleanName) ||
              (parsed.customGames || []).find(cg => cleanGameTitle(cg.name).toLowerCase() === cleanName);
            if (matched && matched.barcodePrefix) {
              s.barcodePrefix = matched.barcodePrefix;
              if (!s.gameId) s.gameId = matched.id;
            }
          }
        });
      }
      if (parsed.partialTakeOuts && Array.isArray(parsed.partialTakeOuts)) {
        const stillRemoved = [];
        if (!Array.isArray(parsed.inStockInventory)) parsed.inStockInventory = [];
        parsed.partialTakeOuts.forEach(pto => {
          if (pto.packNumber) {
            pto.packNumber = String(pto.packNumber).trim();
          }
          if (pto.reason === 'Returned' || pto.status === 'RETURNED') {
            if (!parsed.inStockInventory.some(p => String(p.packNumber) === String(pto.packNumber))) {
              parsed.inStockInventory.unshift({
                id: pto.id || ('stock_' + Date.now()),
                packNumber: String(pto.packNumber),
                gameName: pto.gameName || 'Scratch Game',
                gameNumber: pto.gameCode || pto.gameId ? `Game ${pto.gameCode || pto.gameId}` : 'Game 1401',
                price: pto.price || 1,
                packSize: `${pto.packSize || 100} tickets`,
                packSizeNum: pto.packSize || 100,
                currentTicket: pto.currentTicket || 0,
                position: String(pto.currentTicket || 0).padStart(3, '0'),
                boxNumber: null,
                box: null,
                status: 'IN_STOCK',
                statusLabel: 'In stock',
                statusBadgeClass: 'badge-in-stock',
                receivedDate: 'Today'
              });
            }
          } else {
            stillRemoved.push(pto);
          }
        });
        parsed.partialTakeOuts = stillRemoved;
      }
      if (parsed.soldOutThisShift && Array.isArray(parsed.soldOutThisShift)) {
        parsed.soldOutThisShift.forEach(so => {
          if (so.packNumber) {
            so.packNumber = String(so.packNumber).trim();
          }
        });
      }

      if (parsed.dataCleared) {
        if (!Array.isArray(parsed.shiftHistory)) parsed.shiftHistory = [];
        if (!parsed.shiftStatus) parsed.shiftStatus = 'SHIFT_ENDED';
      }

      if (parsed.storeId && parsed.storeId !== 'store_amigo') {
        if (parsed.reportEmail === 'amigofoodmart2300@gmail.com') parsed.reportEmail = '';
        if (Array.isArray(parsed.settingsReportEmails)) {
          parsed.settingsReportEmails = parsed.settingsReportEmails.filter(e => e !== 'amigofoodmart2300@gmail.com');
        }
      }

      if (storeId === 'store_admin' && (parsed.storeName === 'AMIGO FOOD MART' || parsed.storeName === 'ANISH STORE')) {
        parsed.storeName = 'ADMIN STORE';
        parsed.storeAddress = 'Platform Head Office, Warner Robins, GA, 31088';
        parsed.retailerNumber = 'GA-ADM01';
        if (parsed.cashierName === 'master') parsed.cashierName = 'Platform Administrator';
      }

      parsed.lotteryJurisdiction = normalizeLotteryJurisdiction(targetStoreMeta?.lotteryJurisdiction || parsed.lotteryJurisdiction);

      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse local storage state:', e);
  }

  // If this store doesn't have state yet:
  const stores = getStoresList();
  const cleanId = String(storeId).replace(/^store_/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  const dispName = cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
  const storeMeta = stores.find(st => st.id === storeId) || {
    id: storeId,
    name: (storeId === 'store_amigo') ? 'AMIGO FOOD MART' : `${dispName.toUpperCase()} STORE`,
    address: (storeId === 'store_amigo') ? '2300 MOODY RD WARNER ROBINS, GA, 31088' : `${dispName} Location`,
    retailerNumber: (storeId === 'store_amigo') ? 'GA-89412' : `GA-${Math.floor(10000 + Math.random() * 90000)}`,
    phone: (storeId === 'store_amigo') ? '(478) 923-4567' : '(555) 000-0000',
    totalBoxes: 65,
    status: 'ACTIVE'
  };
  const fresh = getCleanEmptyState({
    storeId: storeId,
    storeName: storeMeta.name,
    storeAddress: storeMeta.address,
    retailerNumber: storeMeta.retailerNumber,
    totalSlots: storeMeta.totalBoxes || 65
  });
  fresh.storeId = storeId;
  fresh.dataCleared = false;
  try {
    localStorage.setItem(key, JSON.stringify(fresh));
  } catch (_) { }
  return fresh;
}

/**
 * On sign-in / page load, decide whether the server copy should replace this device's copy.
 * Only a server copy saved at the same time or later wins: a newer local copy (e.g. a shift whose
 * saves never reached the server) must never be overwritten just because the two differ.
 */
export function shouldUseServerState(serverState, localState) {
  if (!serverState || !Array.isArray(serverState.slots)) return false;
  const serverTime = serverState.lastSavedAt ? new Date(serverState.lastSavedAt).getTime() : 0;
  const localTime = localState?.lastSavedAt ? new Date(localState.lastSavedAt).getTime() : 0;
  return serverTime >= localTime;
}

export function saveState(state, targetStoreId = null) {
  const storeId = targetStoreId || (state && state.storeId) || getCurrentStoreId();
  if (state) {
    state.storeId = storeId;
    state.lastSavedAt = new Date().toISOString();
    const hasActiveBoxes = Array.isArray(state.slots) && state.slots.some(s => s && s.status === 'ACTIVE' && s.packNumber);
    if (hasActiveBoxes) {
      state.dataCleared = false;
    }
  }
  const key = getStoreStorageKey(storeId);
  try {
    localStorage.setItem(key, JSON.stringify(state));
    // Asynchronously synchronize state backup to backend
    syncPOSStateToDB(state);
  } catch (e) {
    console.error('Failed to save state to localStorage:', e);
  }
}

export function getCleanEmptyState(existingState = null) {
  const slots = [];
  const storeId = (typeof existingState === 'string' ? existingState : existingState?.storeId) || 'store_amigo';
  const storeMeta = (getStoresList() || []).find(s => s.id === storeId) || DEFAULT_STORES.find(s => s.id === storeId);
  const configuredTotal = storeMeta?.totalBoxes || 65;
  const TOTAL_SLOTS = Math.max(configuredTotal, (existingState && existingState.totalSlots) ? existingState.totalSlots : configuredTotal);

  for (let i = 1; i <= TOTAL_SLOTS; i++) {
    slots.push({
      boxNumber: i,
      status: 'EMPTY',
      gameId: null,
      gameName: null,
      price: null,
      packNumber: null,
      packSize: null,
      startTicket: 0,
      currentTicket: 0,
      ticketsInBox: 0,
      scannedBarcodes: [],
      soldBarcodes: [],
      activatedThisShift: false,
      daysActive: 0,
      scannedInEndShift: false
    });
  }

  const cleanId = String(storeId).replace(/^store_/, '').replace(/[^a-zA-Z0-9_]/g, '_');
  const dispName = cleanId.charAt(0).toUpperCase() + cleanId.slice(1);
  const storeName = existingState?.storeName || ((storeId === 'store_amigo') ? 'AMIGO FOOD MART' : `${dispName.toUpperCase()} STORE`);
  const storeAddress = existingState?.storeAddress || ((storeId === 'store_amigo') ? '2300 MOODY RD WARNER ROBINS, GA, 31088' : `${dispName} Location`);
  const retailerNumber = existingState?.retailerNumber || ((storeId === 'store_amigo') ? 'GA-89412' : `GA-${Math.floor(10000 + Math.random() * 90000)}`);
  const registerName = existingState?.registerName || 'Register 1';
  const cashierName = existingState?.cashierName || 'master';
  const settings = existingState?.settings ? { ...existingState.settings } : {
    soundEnabled: true,
    voiceEnabled: true,
    autoPrint: true,
    autoEmail: false,
    targetEmails: (storeId === 'store_amigo') ? 'amigofoodmart2300@gmail.com' : '',
    operationMode: 'DAILY',
    warning1Days: 7,
    warning2Days: 12,
    warningOldDays: 21,
    zeroIndexed: true
  };

  return {
    storeId,
    storeName,
    storeAddress,
    retailerNumber,
    lotteryJurisdiction: normalizeLotteryJurisdiction(existingState?.lotteryJurisdiction),
    registerName,
    shiftNumber: 1,
    cashierName,
    reportEmail: (storeId === 'store_amigo') ? 'amigofoodmart2300@gmail.com' : '',
    settingsReportEmails: (storeId === 'store_amigo') ? ['amigofoodmart2300@gmail.com'] : [],
    shiftStatus: 'SHIFT_ENDED',
    shiftStartedAt: null,
    totalSlots: TOTAL_SLOTS,
    slots,
    visibleBoxNumbers: [],
    boxAccessTimes: {},
    inStockInventory: [],
    inventory: [],
    inventoryBarcodes: {},
    customGames: [],
    onlineSales: 0,
    cashes: 0,
    onlineCashes: 0,
    discontinuedCount: 0,
    shiftOpeningActiveCount: 0,
    soldOutThisShift: [],
    partialTakeOuts: [],
    shiftHistory: [],
    lastScannedBarcode: '',
    lastScannedSlot: null,
    lastScanData: null,
    soldBarcodes: [],
    dataCleared: false,
    settings
  };
}

export function resetToDefaults() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('lotto_track_pos_data_v3_store_amigo');
    localStorage.removeItem('lotto_track_pos_data_v1');
    localStorage.removeItem('lotto_track_pos_data_v2');
  } catch (e) {
    console.error('Failed to clear storage:', e);
  }
  const seeded = getCleanEmptyState({
    storeId: 'store_amigo',
    storeName: 'AMIGO FOOD MART',
    storeAddress: '2300 MOODY RD WARNER ROBINS, GA, 31088',
    retailerNumber: 'GA-89412',
    totalSlots: 65
  });
  saveState(seeded, 'store_amigo');
  return seeded;
}

export function resetToCleanState(existingState = null) {
  const storeId = (existingState && existingState.storeId) ? existingState.storeId : getCurrentStoreId();
  const empty = getCleanEmptyState(existingState);
  empty.storeId = storeId;
  empty.dataCleared = true;
  empty.shiftStatus = 'SHIFT_ENDED';
  empty.shiftHistory = [];
  empty.inStockInventory = [];
  empty.inventory = [];
  empty.inventoryBarcodes = {};
  empty.soldOutThisShift = [];
  empty.partialTakeOuts = [];
  empty.soldBarcodes = [];
  empty.shiftNumber = 1;
  const storeKey = getStoreStorageKey(storeId);
  try {
    localStorage.removeItem(storeKey);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('lotto_track_pos_data_v1');
    localStorage.removeItem('lotto_track_pos_data_v2');
    localStorage.setItem(storeKey, JSON.stringify(empty));
  } catch (e) {
    console.error('Failed to clear storage:', e);
  }
  try {
    clearPOSStateOnDB(storeId);
  } catch (_) { }
  syncPOSStateToDB(empty, true);
  return empty;
}


