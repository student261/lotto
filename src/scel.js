// ============================================================================
// LOTTO TRACK PRO — SOUTH CAROLINA EDUCATION LOTTERY (SCEL) MODULE
// Phase 1 Foundation: Isolated Game Catalog & Printed Pack-Ticket Number Parser
// ============================================================================

/**
 * Isolated South Carolina Education Lottery (SCEL) Game Catalog.
 * Contains only verified SCEL games — completely isolated from Georgia's SAMPLE_GAMES.
 */
export const SCEL_GAMES = [
  {
    id: 'sc1705',
    gameNumber: '1705',
    barcodePrefix: '1705',
    name: 'LIGHT UP THE SEASON',
    price: 2,
    packSize: 150,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1684',
    gameNumber: '1684',
    barcodePrefix: '1684',
    name: 'HIT $500',
    price: 10,
    packSize: 30,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1714',
    gameNumber: '1714',
    barcodePrefix: '1714',
    name: '25 TIMES LUCKY',
    price: 20,
    packSize: 30,
    bookValue: 600,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1689',
    gameNumber: '1689',
    barcodePrefix: '1689',
    name: 'CASH MONEY',
    price: 10,
    packSize: 30,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1688',
    gameNumber: '1688',
    barcodePrefix: '1688',
    name: 'THE PRICE IS RIGHT',
    price: 10,
    packSize: 30,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1676',
    gameNumber: '1676',
    barcodePrefix: '1676',
    name: 'DOUBLE DOUBLER',
    price: 1,
    packSize: 300,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1677',
    gameNumber: '1677',
    barcodePrefix: '1677',
    name: 'TRIPLE 777',
    price: 2,
    packSize: 150,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1702',
    gameNumber: '1702',
    barcodePrefix: '1702',
    name: 'HOLIDAY CASH',
    price: 5,
    packSize: 60,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1646',
    gameNumber: '1646',
    barcodePrefix: '1646',
    name: 'CAROLINA GOLD',
    price: 5,
    packSize: 60,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1670',
    gameNumber: '1670',
    barcodePrefix: '1670',
    name: 'HIT $100',
    price: 2,
    packSize: 150,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1678',
    gameNumber: '1678',
    barcodePrefix: '1678',
    name: '7-11-21 TRIPLER',
    price: 2,
    packSize: 150,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1690',
    gameNumber: '1690',
    barcodePrefix: '1690',
    name: '$200,000 PAYDAY',
    price: 5,
    packSize: 60,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1691',
    gameNumber: '1691',
    barcodePrefix: '1691',
    name: 'BIG MATCH BONUS',
    price: 5,
    packSize: 60,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1665',
    gameNumber: '1665',
    barcodePrefix: '1665',
    name: '200X',
    price: 10,
    packSize: 30,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1683',
    gameNumber: '1683',
    barcodePrefix: '1683',
    name: 'MAGNIFICENT JUMBO BUCKS',
    price: 10,
    packSize: 30,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  {
    id: 'sc1618',
    gameNumber: '1618',
    barcodePrefix: '1618',
    name: 'IN THE GREEN',
    price: 5,
    packSize: 60,
    bookValue: 300,
    jurisdiction: 'SCEL'
  },
  // Verified active & recent SCEL scratch-offs from sceducationlottery.com
  { id: 'sc1647', gameNumber: '1647', barcodePrefix: '1647', name: 'QUICK CASH', price: 2, packSize: 150, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1649', gameNumber: '1649', barcodePrefix: '1649', name: 'SAPPHIRE SURPRISE', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1651', gameNumber: '1651', barcodePrefix: '1651', name: 'LADY JUMBO BUCKS CROSSWORD', price: 3, packSize: 100, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1652', gameNumber: '1652', barcodePrefix: '1652', name: 'BINGO', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1653', gameNumber: '1653', barcodePrefix: '1653', name: 'MILLIONAIRE BONUS', price: 10, packSize: 30, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1654', gameNumber: '1654', barcodePrefix: '1654', name: 'LOOSE CHANGE MULTIPLIER', price: 1, packSize: 300, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1655', gameNumber: '1655', barcodePrefix: '1655', name: 'TRIPLE 333', price: 2, packSize: 150, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1656', gameNumber: '1656', barcodePrefix: '1656', name: 'LUCKY MATCH DOUBLER', price: 2, packSize: 150, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1657', gameNumber: '1657', barcodePrefix: '1657', name: 'LOTERIA', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1661', gameNumber: '1661', barcodePrefix: '1661', name: '10X', price: 1, packSize: 300, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1662', gameNumber: '1662', barcodePrefix: '1662', name: '20X', price: 2, packSize: 150, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1663', gameNumber: '1663', barcodePrefix: '1663', name: '50X', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1664', gameNumber: '1664', barcodePrefix: '1664', name: '100X', price: 10, packSize: 30, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1671', gameNumber: '1671', barcodePrefix: '1671', name: 'HIT $250', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1673', gameNumber: '1673', barcodePrefix: '1673', name: 'SUPER LOTERIA', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1674', gameNumber: '1674', barcodePrefix: '1674', name: 'GOLD VAULT EXTRA PLAY', price: 10, packSize: 30, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1675', gameNumber: '1675', barcodePrefix: '1675', name: 'TIC TAC DOUBLER', price: 2, packSize: 150, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1679', gameNumber: '1679', barcodePrefix: '1679', name: 'FIVEFOLD LUCKY', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1682', gameNumber: '1682', barcodePrefix: '1682', name: 'JUMBO BUCKS', price: 2, packSize: 150, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1685', gameNumber: '1685', barcodePrefix: '1685', name: 'HIT $50', price: 1, packSize: 300, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1687', gameNumber: '1687', barcodePrefix: '1687', name: 'JUNIOR JUMBO BUCKS', price: 1, packSize: 300, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1695', gameNumber: '1695', barcodePrefix: '1695', name: 'TRIPLE RED 777', price: 1, packSize: 300, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1696', gameNumber: '1696', barcodePrefix: '1696', name: 'TRIPLE RED 777', price: 2, packSize: 150, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1697', gameNumber: '1697', barcodePrefix: '1697', name: 'TRIPLE RED 777', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1698', gameNumber: '1698', barcodePrefix: '1698', name: 'TRIPLE RED 777', price: 10, packSize: 30, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1699', gameNumber: '1699', barcodePrefix: '1699', name: 'GIANT JUMBO BUCKS', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1703', gameNumber: '1703', barcodePrefix: '1703', name: 'MIGHTY JUMBO BUCKS', price: 10, packSize: 30, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1704', gameNumber: '1704', barcodePrefix: '1704', name: 'COOKIE DOUGH', price: 1, packSize: 300, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1706', gameNumber: '1706', barcodePrefix: '1706', name: 'HOLIDAY SURPRISE!', price: 5, packSize: 60, bookValue: 300, jurisdiction: 'SCEL' },
  { id: 'sc1707', gameNumber: '1707', barcodePrefix: '1707', name: 'MERRY MULTIPLIER', price: 10, packSize: 30, bookValue: 300, jurisdiction: 'SCEL' }
];

/**
 * Computes the official SCEL pack check digit from 6-digit pack number.
 * Verified across all SCEL games (1714, 1705, 1684, 1689).
 *
 * @param {string|number} packNumber
 * @returns {string} 1-digit check code
 */
export function computeScCheckDigit(packNumber) {
  if (!packNumber) return null;
  const p = String(packNumber).padStart(6, '0').slice(-6);
  const w = [0, 2, 3, 1, 4, 2];
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    sum += parseInt(p[i], 10) * w[i];
  }
  return String(sum % 10);
}

/**
 * Look up a game in the isolated SCEL catalog by game number or prefix.
 *
 * @param {string|number} gameNumber - 4-digit SCEL game number
 * @returns {object|null} SCEL game object or null if not found
 */
export function findScelGame(gameNumber) {
  if (!gameNumber) return null;
  const str = String(gameNumber).trim();
  const cleanNum = str.replace(/^scel_|^sc_?/, '');
  return SCEL_GAMES.find(g => g.gameNumber === str || g.barcodePrefix === str || g.id === str || g.gameNumber === cleanNum || g.barcodePrefix === cleanNum) || null;
}

/**
 * Check if a game number or barcode prefix belongs to the isolated SCEL catalogue.
 *
 * @param {string|number} gameNumber
 * @returns {boolean}
 */
export function isScelGameNumber(gameNumber) {
  if (!gameNumber) return false;
  const str = String(gameNumber).trim();
  return SCEL_GAMES.some(g => g.gameNumber === str || g.barcodePrefix === str);
}

/**
 * Dedicated SCEL Printed Pack-Ticket Number Parser.
 *
 * Format: GGGG-PPPPPP-C-TTT (with optional printed raw suffix, e.g. "(080)")
 * - Game number: 4 digits (e.g. "1705")
 * - Pack number: Exactly 6 digits, strictly preserving leading zeros (e.g. "002921")
 * - Check digit: 1 digit (e.g. "5")
 * - Ticket number: 3 digits (e.g. "069")
 * - Optional raw suffix: e.g. "(080)" preserved as raw text without interpretation
 *
 * NOTE: Per Phase 1 specifications, unverified scanner barcode formats
 * (such as continuous digits "17050029215069" or 17-digit strings) are NOT
 * guessed or accepted by this parser.
 *
 * @param {string} input - Raw printed pack-ticket text
 * @returns {object} Parsed SCEL result object
 */
export function parseScelPrintedTicketNumber(input) {
  if (!input || typeof input !== 'string') {
    return {
      isValid: false,
      jurisdiction: 'SCEL',
      error: 'Input must be a non-empty string',
      raw: input
    };
  }

  const trimmed = input.trim();

  // 1. Match for 4-segment delimited printed number:
  // GGGG (4 digits) - PPPPPP (6 digits) - C (1 digit) - TTT (3 digits)
  // Followed by optional raw suffix in parentheses/brackets, e.g. "(080)"
  const match4 = trimmed.match(/^(\d{4})[-_\s]+(\d{6})[-_\s]+(\d{1})[-_\s]+(\d{3})(?:\s*([([{]\d+[)\]}]))?$/);

  if (!match4) {
    return {
      isValid: false,
      jurisdiction: 'SCEL',
      error: 'Invalid SCEL printed ticket format (expected GGGG-PPPPPP-C-TTT)',
      raw: input
    };
  }

  const gameNumber = match4[1];
  const packNumber = match4[2]; // Preserves leading zeros exactly as 6 characters
  const checkDigit = match4[3];
  const ticketNumber = match4[4];
  const rawSuffix = match4[5] || null;

  const matchedGame = findScelGame(gameNumber);

  const baseCanonical = `${gameNumber}-${packNumber}-${checkDigit}-${ticketNumber}`;

  return {
    isValid: true,
    jurisdiction: 'SCEL',
    isCatalogued: Boolean(matchedGame),
    gameNumber,
    packNumber,
    checkDigit,
    ticketNumber,
    rawSuffix,
    packId: `SC-${gameNumber}-${packNumber}`,
    ticketId: `SC-${gameNumber}-${packNumber}-${ticketNumber}`,
    displayString: rawSuffix
      ? `${baseCanonical} ${rawSuffix}`
      : baseCanonical,
    game: matchedGame || null,
    raw: input
  };
}

/**
 * Strips scanner symbology framing (AIM prefixes like ]I0/]C1/]C01, Code 39 asterisks, URL QR wrappers).
 * Shared by both SC and GA parsers so continuous barcodes aren't shifted by 1 digit.
 */
export function stripScannerPrefix(raw) {
  let s = String(raw ?? '').replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (!s) return '';
  s = s.replace(/[;,.]+$/, '').trim();
  if (!s) return '';

  if (s.startsWith(']')) {
    // Only strip 4 chars for explicit "]C01"-style Code128 prefixes before 11 or 14 digits, never eating "1" after "]I0"/"]E0"
    if (/^\][cC]0[1-9](?=\d{11,14}$)/.test(s) && (s.length === 15 || s.length === 18)) {
      s = s.slice(4).trim();
    } else if (/^\][a-zA-Z][0-9]/.test(s)) {
      s = s.slice(3).trim();
    } else {
      s = s.replace(/^\][a-zA-Z0-9]{1,3}/, '').trim();
    }
  }

  s = s.replace(/^\*+|\*+$/g, '').trim();

  if (s.includes('http://') || s.includes('https://') || s.includes('www.') || s.includes('scel.net') || s.includes('sceducationlottery.com') || s.includes('galottery.com')) {
    const urlDigitsMatch = s.match(/(?:code|ticket|barcode|entry|t|b)=?(\d{10,30})/i) || s.match(/(\d{11,30})/);
    if (urlDigitsMatch) {
      s = urlDigitsMatch[1];
    }
  }

  return s;
}

/**
 * Strips scanner leading zero padding (1-4 zeroes) when followed by a valid continuous 14 or 17-30 digit barcode.
 */
export function stripLeadingZeroPadding(digits) {
  const d = String(digits || '');
  const m = d.match(/^0{1,4}([1-9]\d{13,29})$/);
  if (!m) return d;
  const trimmed = m[1];
  return (trimmed.length === 14 || (trimmed.length >= 17 && trimmed.length <= 30)) ? trimmed : d;
}

/**
 * Resolves Layout A ([4G][6P][1C][3T]) vs Layout B ([4G][6P][3T][1X]) for continuous lottery barcodes.
 */
export function disambiguateContinuousLayout({ digits, knownPackSize = null, expectedCheck = null, secInt = NaN, preferLeadingZeroB = false }) {
  const tixA = parseInt(digits.slice(11, 14), 10);
  const tixB = parseInt(digits.slice(10, 13), 10);
  const digit10 = digits.slice(10, 11);
  const digit13 = digits.slice(13, 14);

  if (knownPackSize != null && !isNaN(secInt)) {
    const matchA = (tixA + secInt + 1 === knownPackSize);
    const matchB = (tixB + secInt + 1 === knownPackSize);
    if (matchB && !matchA) return true;
    if (matchA && !matchB) return false;
  }

  if (tixB > 299 && tixA <= 299) return false;
  if (tixA > 299 && tixB <= 299) return true;

  if (expectedCheck != null && digit10 !== expectedCheck && tixB <= 299) return true;
  if (knownPackSize != null && tixA >= knownPackSize && tixB < knownPackSize) return true;
  if (knownPackSize != null && tixB >= knownPackSize && tixA < knownPackSize) return false;

  if (expectedCheck != null) {
    // Only treat digit10==='0' as Layout B when check doesn't equal '0' OR trailer matches expectedCheck
    return digit10 === '0' && tixB < 150 && tixA >= 100 && (digit10 !== expectedCheck || digit13 === expectedCheck);
  }

  if (preferLeadingZeroB && digit10 === '0' && tixB >= 0 && tixB <= 299) return true;
  return !knownPackSize && tixA >= 150 && tixB <= 30;
}

/**
 * Dedicated SCEL POS Barcode Parser Adapter.
 * Adapts SCEL ticket parsing to match the standard POS parser contract.
 *
 * For Phase 5.1, supports only the known printed ticket number format:
 * GGGG-PPPPPP-C-TTT (e.g. "1705-002921-5-069") with optional raw suffix (e.g. "(080)")
 *
 * Requirements:
 * - Preserves leading zeros in pack number: "002921"
 * - Numeric ticketNumber: 69, ticketString: "069"
 * - Preserves optional raw suffix without assuming it is a security code
 * - Rejects unknown SCEL games and malformed/unsupported formats safely
 * - Never falls back to Georgia parsing
 *
 * @param {string} raw - Raw scanned or entered barcode string
 * @param {Array} customGames - Optional custom games catalog
 * @returns {object|null} Standard POS-compliant parsed object or error object
 */
export function adaptScelToLotteryBarcode(raw, customGames = []) {
  if (!raw) return null;
  if (typeof raw !== 'string') {
    return {
      isValid: false,
      jurisdiction: 'SC',
      isNonLotteryBarcode: true,
      isRetailProduct: false,
      error: 'Barcode must be a string',
      raw
    };
  }

  let s = stripScannerPrefix(raw);
  if (!s) return null;

  // Real scratch-off lottery ticket barcodes are numeric/delimited (reject letters)
  if (/[a-zA-Z]/.test(s)) {
    return {
      isValid: false,
      jurisdiction: 'SC',
      isNonLotteryBarcode: true,
      isRetailProduct: false,
      error: 'Non-lottery barcode contains letters',
      raw
    };
  }

  let gameNumber, packNumber, checkDigit, ticketString, rawSuffix;

  const parsed = parseScelPrintedTicketNumber(s);
  const delimitedSc = (!parsed || !parsed.isValid)
    ? s.match(/^(\d{4})[-_/\s.:]+(\d{6})[-_/\s.:]+(\d{1})[-_/\s.:]+(\d{3})(?:[-_/\s.:]*([([{]?\d{3,4}[)\]}]?))?$/)
    : null;
  if (parsed && parsed.isValid) {
    gameNumber = parsed.gameNumber;
    packNumber = parsed.packNumber;
    checkDigit = parsed.checkDigit;
    ticketString = parsed.ticketNumber;
    rawSuffix = parsed.rawSuffix;
  } else if (delimitedSc) {
    gameNumber = delimitedSc[1];
    packNumber = delimitedSc[2];
    checkDigit = delimitedSc[3];
    ticketString = delimitedSc[4];
    rawSuffix = delimitedSc[5] ? (delimitedSc[5].match(/^[([{]/) ? delimitedSc[5] : `(${delimitedSc[5]})`) : null;
  } else {
    // 14, 17, or 18-30 digit continuous barcode (Layout A [4G][6P][1C][3T] vs Layout B [4G][6P][3T][1Trailer])
    const digitsOnly = stripLeadingZeroPadding(s.replace(/[^0-9]/g, ''));
    const parenSuffix = s.match(/[([{](\d{1,4})[)\]}]/)?.[1] || null;
    if (digitsOnly.length === 14 || digitsOnly.length === 17 || (digitsOnly.length >= 18 && digitsOnly.length <= 30)) {
      gameNumber = digitsOnly.slice(0, 4);
      packNumber = digitsOnly.slice(4, 10);
      const tempGame = findScelGame(gameNumber) || (customGames || []).find(g => (!g.jurisdiction || normalizeLotteryJurisdiction(g.jurisdiction) === 'SC') && (g.barcodePrefix === gameNumber || g.gameNumber === gameNumber));
      const knownPackSize = tempGame?.packSize ?? null;
      const expectedCheck = computeScCheckDigit(packNumber);
      const explicitSuffix = parenSuffix || (digitsOnly.length === 17 ? digitsOnly.slice(14, 17) : null);
      const secInt = explicitSuffix ? parseInt(explicitSuffix, 10) : NaN;

      const isLayoutB = disambiguateContinuousLayout({ digits: digitsOnly, knownPackSize, expectedCheck, secInt });

      if (isLayoutB) {
        ticketString = digitsOnly.slice(10, 13);
        checkDigit = expectedCheck;
      } else {
        checkDigit = digitsOnly.slice(10, 11);
        ticketString = digitsOnly.slice(11, 14);
      }

      if (parenSuffix) {
        rawSuffix = `(${parenSuffix})`;
      } else if (digitsOnly.length === 17) {
        rawSuffix = `(${digitsOnly.slice(14, 17)})`;
      }
    } else {
      return {
        isValid: false,
        jurisdiction: 'SC',
        isNonLotteryBarcode: true,
        isRetailProduct: false,
        error: parsed?.error || 'Invalid or unsupported SCEL format',
        raw
      };
    }
  }

  // Verify game existence against SCEL catalog or confirmed SC custom games (never invent price/packSize)
  const matchedGame = findScelGame(gameNumber)
    || (customGames || []).find(g => {
      const jur = normalizeLotteryJurisdiction(g.jurisdiction);
      const matchPrefix = g.barcodePrefix === gameNumber || g.gameNumber === gameNumber;
      return matchPrefix && (!g.jurisdiction || jur === 'SC');
    })
    || null;

  if (!matchedGame) {
    return {
      isValid: false,
      jurisdiction: 'SC',
      isUncatalogued: true,
      isUnknownGame: true,
      isNonLotteryBarcode: true,
      isRetailProduct: false,
      error: `Unknown SCEL game: ${gameNumber}`,
      gameNumber,
      basePackNumber: packNumber || parsed?.packNumber || null,
      checkDigit: checkDigit || parsed?.checkDigit || null,
      price: null,
      packSize: null,
      bookValue: null,
      raw
    };
  }

  const ticketNum = parseInt(ticketString, 10);
  const packSize = matchedGame.packSize;
  if (isNaN(ticketNum) || ticketNum < 0) {
    return {
      isValid: false,
      jurisdiction: 'SC',
      isNonLotteryBarcode: true,
      isRetailProduct: false,
      error: `Invalid ticket number #${ticketString}`,
      raw
    };
  }
  if (packSize != null && ticketNum >= packSize) {
    if (findScelGame(gameNumber) || (customGames || []).some(g => (g.barcodePrefix === gameNumber || g.gameNumber === gameNumber) && g.packSize)) {
      return {
        isValid: false,
        jurisdiction: 'SC',
        isNonLotteryBarcode: true,
        isRetailProduct: false,
        error: `Ticket number #${ticketNum} out of roll range (0 to ${packSize - 1})`,
        raw
      };
    }
  }
  if (packSize == null && ticketNum > 999) {
    return {
      isValid: false,
      jurisdiction: 'SC',
      isNonLotteryBarcode: true,
      isRetailProduct: false,
      error: `Ticket number #${ticketNum} out of roll range (0 to 999)`,
      raw
    };
  }

  // Determine suffix/countdown separately from explicit security PIN
  const countdown = packSize != null ? (packSize - 1) - ticketNum : null;
  const countdownCode = countdown !== null && countdown >= 0 ? String(countdown).padStart(3, '0') : null;
  let finalSuffix = rawSuffix;
  if (!finalSuffix && countdownCode) {
    finalSuffix = `(${countdownCode})`;
  }

  const explicitPin = rawSuffix ? rawSuffix.replace(/[^0-9]/g, '') : null;
  const sec = explicitPin || countdownCode || null;
  const canonicalId = checkDigit ? `${gameNumber}-${packNumber}-${checkDigit}-${ticketString}` : `${gameNumber}-${packNumber}-${ticketString}`;
  const standardBarcode = canonicalId;
  const fullId = finalSuffix ? `${canonicalId}${finalSuffix.replace(/\s+/g, '')}` : canonicalId;
  const displayBarcode = finalSuffix ? `${canonicalId} ${finalSuffix}` : canonicalId;

  return {
    isValid: true,
    jurisdiction: 'SC',
    isPackBarcode: false,
    gameNumber,
    basePackNumber: packNumber,
    packNumber,
    packClean: packNumber,
    packCombined: checkDigit ? `${packNumber}-${checkDigit}` : packNumber,
    ticketNumber: ticketNum,
    ticketString,
    checkCode: checkDigit,
    checkDigit: checkDigit,
    countdownCode,
    securityCode: sec,
    hasExplicitSecurityCode: Boolean(rawSuffix),
    isCountdownDerived: Boolean(!rawSuffix && countdownCode),
    rawSuffix: finalSuffix,
    standardBarcode,
    canonicalId,
    fullId,
    displayBarcode,
    raw,
    game: matchedGame,
    price: matchedGame.price,
    packSize: matchedGame.packSize,
    gameName: matchedGame.name
  };
}

/**
 * Normalizes lottery jurisdiction codes.
 * - 'SC' or 'SCEL' -> 'SC'
 * - 'GA' -> 'GA'
 * - Missing, null, undefined, empty, or unsupported -> 'GA'
 *
 * @param {*} val
 * @returns {'GA' | 'SC'}
 */
export function normalizeLotteryJurisdiction(val) {
  if (typeof val !== 'string') return 'GA';
  const clean = val.trim().toUpperCase();
  if (clean === 'SC' || clean === 'SCEL') return 'SC';
  if (clean === 'GA') return 'GA';
  return 'GA';
}

/**
 * Resolves store lottery jurisdiction during store creation and updates.
 * Distinguishes between:
 * 1. Omitted / missing property (undefined)
 * 2. Explicit valid 'SC' (or 'SCEL')
 * 3. Explicit valid 'GA'
 * 4. Empty / null / invalid unsupported values
 *
 * Rules:
 * - Brand new store + omitted / invalid -> 'GA'
 * - Brand new store + explicit 'SC' -> 'SC'
 * - Existing store + omitted / null / empty / invalid -> keeps existingJurisdiction (e.g. 'SC' stays 'SC')
 * - Existing store + explicit 'SC' -> 'SC'
 * - Existing store + explicit 'GA' -> 'GA'
 *
 * @param {string|null|undefined} existingJurisdiction - Current jurisdiction in DB / store record ('GA' | 'SC' | null)
 * @param {*} incomingJurisdiction - Value supplied in update/create payload
 * @param {boolean} isNewStore - Whether this is an initial creation (true) or an update (false)
 * @returns {'GA' | 'SC'}
 */
export function resolveJurisdictionUpdate(existingJurisdiction, incomingJurisdiction, isNewStore = false) {
  let explicit = null;
  if (typeof incomingJurisdiction === 'string') {
    const clean = incomingJurisdiction.trim().toUpperCase();
    if (clean === 'SC' || clean === 'SCEL') explicit = 'SC';
    else if (clean === 'GA') explicit = 'GA';
  }

  if (isNewStore) {
    return explicit || 'GA';
  }

  // Updating existing store:
  // If explicitly supplied with a valid jurisdiction ('SC' or 'GA'), update to it
  if (explicit) return explicit;

  // Otherwise (omitted, null, empty, or unsupported invalid string), PRESERVE existing jurisdiction
  return (existingJurisdiction && String(existingJurisdiction).toUpperCase() === 'SC') ? 'SC' : 'GA';
}

