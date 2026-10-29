import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Number parsing utilities to ensure zero NaNs in database
const parseNum = (val, defaultVal = 0) => {
  if (val === null || val === undefined || val === '' || val === '-') return defaultVal;
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? defaultVal : n;
};

const parseIntSafe = (val, defaultVal = 0) => {
  if (val === null || val === undefined || val === '' || val === '-') return defaultVal;
  const n = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? defaultVal : n;
};

// Database configuration - Supports Railway MYSQL_URL/DATABASE_URL & individual DB_* / MYSQL* variables
function getDatabaseConfig() {
  const config = {
    host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
    user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
    port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
    database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'lotto_pos',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
  };

  const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const parsed = new URL(dbUrl);
      config.host = parsed.hostname;
      config.port = parseInt(parsed.port || '3306', 10);
      config.user = decodeURIComponent(parsed.username || 'root');
      config.password = decodeURIComponent(parsed.password || '');
      const pathDb = (parsed.pathname || '').replace(/^\//, '');
      if (pathDb) config.database = pathDb;
    } catch (e) {
      console.warn('Could not parse connection URL, falling back to individual parameters:', e.message);
    }
  }

  return config;
}

const dbConfig = getDatabaseConfig();

let pool = null;
let isDbConnected = false;
let dbLastError = null;

// Initialize Database, Tables & Clean Views (Safe for local and cloud environments)
async function initDatabase() {
  try {
    // 1. In local non-production development only, attempt database creation if on localhost
    const isLocal = dbConfig.host === 'localhost' || dbConfig.host === '127.0.0.1';
    if (isLocal && process.env.NODE_ENV !== 'production') {
      try {
        const adminConn = await mysql.createConnection({
          host: dbConfig.host,
          user: dbConfig.user,
          password: dbConfig.password,
          port: dbConfig.port
        });
        await adminConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        await adminConn.end();
      } catch (_) {}
    }

    // 2. Connect pool directly to target database
    pool = mysql.createPool(dbConfig);

    // 3. Execute safe schema.sql (uses CREATE TABLE IF NOT EXISTS)
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schemaSql);
      console.log('✅ [MySQL] Enterprise database schema and human-readable views verified.');
    }

    isDbConnected = true;
    dbLastError = null;
    console.log(`✅ [MySQL] Connected to database "${dbConfig.database}" at ${dbConfig.host}:${dbConfig.port}`);

    // 4. Run automatic data migration & purge empty boxes
    await migrateCleanData(pool);

    // 5. Hydrate central state from persistent MySQL tables
    await syncAdminStateFromDatabase(pool);
  } catch (err) {
    isDbConnected = false;
    dbLastError = err.message;
    console.warn(`⚠️ [MySQL] Connection error at ${dbConfig.host}:${dbConfig.port}: ${err.message}`);
  }
}

// Hydrates in-memory cache with database-backed stores, catalog, and admins so state survives container restarts
async function syncAdminStateFromDatabase(db) {
  try {
    const st = getAdminState();

    // Sync admin users
    try {
      const [adminRows] = await db.query('SELECT * FROM admin_users');
      if (adminRows.length > 0) {
        adminRows.forEach(row => {
          const existing = st.admins.find(a => (a.username || '').toLowerCase() === (row.username || '').toLowerCase());
          if (existing) {
            existing.password_hash = row.password_hash;
            existing.full_name = row.full_name || existing.full_name;
            existing.email = row.email || existing.email;
            existing.is_active = row.is_active;
          } else {
            st.admins.push({
              id: row.id,
              username: row.username,
              password_hash: row.password_hash,
              full_name: row.full_name,
              email: row.email,
              role: row.role || 'SUPER_ADMIN',
              is_active: row.is_active
            });
          }
        });
      }
    } catch (_) {}

    // Sync stores
    try {
      const [storeRows] = await db.query('SELECT * FROM stores');
      if (storeRows.length > 0) {
        storeRows.forEach(row => {
          const idx = st.stores.findIndex(s => s.storeId === row.store_id);
          const storeObj = {
            storeId: row.store_id,
            storeName: row.store_name,
            ownerUsername: row.owner_username,
            retailerNumber: row.retailer_number,
            address: row.address,
            phone: row.phone,
            totalBoxes: row.total_boxes || 65,
            authorizationStatus: row.authorization_status,
            operationalStatus: row.operational_status
          };
          if (idx >= 0) {
            st.stores[idx] = { ...st.stores[idx], ...storeObj };
          } else {
            st.stores.push(storeObj);
          }
        });
      }
    } catch (_) {}

    // Sync catalog
    try {
      const [catRows] = await db.query('SELECT * FROM lottery_ticket_catalog');
      if (catRows.length > 0) {
        catRows.forEach(row => {
          const idx = st.catalog.findIndex(g => g.gameId === row.game_id);
          const gameObj = {
            gameId: row.game_id,
            gameCode: row.game_code || row.game_id,
            gameName: row.game_name,
            price: Number(row.price),
            packSize: Number(row.pack_size),
            packValue: Number(row.pack_value),
            isActive: Boolean(row.is_active)
          };
          if (idx >= 0) {
            st.catalog[idx] = { ...st.catalog[idx], ...gameObj };
          } else {
            st.catalog.push(gameObj);
          }
        });
      }
    } catch (_) {}

    saveAdminState(st);
  } catch (err) {
    console.warn('Notice syncing database state on boot:', err.message);
  }
}

// Automatic Data Migration Helper - Purges empty boxes and ensures Date field is populated
async function migrateCleanData(db) {
  try {
    // 1. Ensure columns exist before cleanup
    try {
      await db.query(`ALTER TABLE day_box_sales ADD COLUMN IF NOT EXISTS \`date\` VARCHAR(20) NOT NULL DEFAULT ''`);
      await db.query(`ALTER TABLE shift_box_sales ADD COLUMN IF NOT EXISTS \`date\` VARCHAR(30) NOT NULL DEFAULT ''`);
      await db.query(`ALTER TABLE active_dispensers ADD COLUMN IF NOT EXISTS \`date\` DATE NOT NULL DEFAULT (CURRENT_DATE)`);
      await db.query(`ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS \`store_id\` VARCHAR(60) NOT NULL DEFAULT 'store_amigo'`);
      await db.query(`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS \`store_id\` VARCHAR(60) NOT NULL DEFAULT 'store_amigo'`);
      await db.query(`ALTER TABLE shift_reports ADD COLUMN IF NOT EXISTS \`store_id\` VARCHAR(60) NOT NULL DEFAULT 'store_amigo'`);
      await db.query(`
        CREATE TABLE IF NOT EXISTS \`store_pos_state\` (
          \`store_id\` VARCHAR(60) PRIMARY KEY,
          \`state_data\` LONGTEXT NOT NULL,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (_) {}

    // 2. PURGE ALL EMPTY BOXES from existing database
    await db.query(`
      DELETE FROM day_box_sales 
      WHERE game_name = 'EMPTY' 
         OR game_name = 'Empty Slot' 
         OR pack_number = '---' 
         OR pack_number IS NULL
    `);

    await db.query(`
      DELETE FROM shift_box_sales 
      WHERE game_name = 'EMPTY' 
         OR game_name = 'Empty Slot' 
         OR pack_number = '---' 
         OR pack_number IS NULL
    `);

    await db.query(`
      DELETE FROM active_dispensers 
      WHERE game_name IS NULL 
         OR game_name = 'EMPTY' 
         OR game_name = 'Empty Slot' 
         OR pack_number IS NULL 
         OR pack_number = '---'
    `);

    // 3. Populate missing dates in day_box_sales from daily_reports
    await db.query(`
      UPDATE day_box_sales dbs
      INNER JOIN daily_reports dr ON dbs.report_id = dr.id
      SET dbs.date = dr.report_date
      WHERE dbs.date = '' OR dbs.date IS NULL
    `);

    // 4. Populate missing dates in shift_box_sales from shift_reports
    await db.query(`
      UPDATE shift_box_sales sbs
      INNER JOIN shift_reports sr ON sbs.shift_id = sr.id
      SET sbs.date = COALESCE(sr.shift_date, sr.started_at, 'CURRENT')
      WHERE sbs.date = '' OR sbs.date IS NULL
    `);

    // 5. Migrate any un-migrated daily reports (WITHOUT empty boxes)
    const [dReports] = await db.query('SELECT * FROM daily_reports');
    for (const dr of dReports) {
      const [existing] = await db.query('SELECT COUNT(*) as c FROM day_box_sales WHERE report_id = ?', [dr.id]);
      if (existing[0].c === 0 && dr.boxes_data) {
        let boxes = [];
        try { boxes = JSON.parse(dr.boxes_data); } catch (_) {}
        for (const b of boxes) {
          // SKIP EMPTY BOXES
          if (b.isEmpty || !b.name || b.name === 'EMPTY' || !b.pack || b.pack === '---') continue;

          if (b.isMultiPack && Array.isArray(b.subRows)) {
            for (const sr of b.subRows) {
              if (!sr.name || sr.name === 'EMPTY' || !sr.pack || sr.pack === '---') continue;
              const openT = parseIntSafe(sr.open, 0);
              const closeT = parseIntSafe(sr.close, 0);
              const sold = Math.max(0, closeT - openT);
              await db.query(
                `INSERT INTO day_box_sales (
                  report_id, date, box_number, game_name, pack_number, ticket_price,
                  opening_ticket, closing_ticket, tickets_sold, sales_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  dr.id, dr.report_date, b.box, sr.name, sr.pack,
                  parseNum(sr.price, 0), openT, closeT, sold,
                  parseNum(sr.total, 0)
                ]
              );
            }
          } else {
            const openT = parseIntSafe(b.open, 0);
            const closeT = parseIntSafe(b.close, 0);
            const sold = Math.max(0, closeT - openT);
            await db.query(
              `INSERT INTO day_box_sales (
                report_id, date, box_number, game_name, pack_number, ticket_price,
                opening_ticket, closing_ticket, tickets_sold, sales_amount
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                dr.id, dr.report_date, b.box, b.name,
                b.pack, parseNum(b.price, 0), openT, closeT,
                sold, parseNum(b.total, 0)
              ]
            );
          }
        }
      }
    }

    // 6. Migrate any un-migrated shift reports (WITHOUT empty boxes)
    const [sReports] = await db.query('SELECT * FROM shift_reports');
    for (const sr of sReports) {
      const [existing] = await db.query('SELECT COUNT(*) as c FROM shift_box_sales WHERE shift_id = ?', [sr.id]);
      if (existing[0].c === 0 && sr.slots_snapshot) {
        let slots = [];
        try { slots = JSON.parse(sr.slots_snapshot); } catch (_) {}
        const sDate = sr.shift_date || (sr.started_at ? String(sr.started_at).slice(0, 10) : new Date().toLocaleDateString('en-US'));
        for (const s of slots) {
          // SKIP EMPTY BOXES
          if (!s.packNumber || s.packNumber === '---' || s.status === 'EMPTY' || !s.gameName || s.gameName === 'Empty Slot') continue;

          const sold = Math.max(0, (s.currentTicket || 0) - (s.startTicket || 0));
          const amt = sold * parseNum(s.price, 0);
          await db.query(
            `INSERT INTO shift_box_sales (
              shift_id, shift_number, date, box_number, game_name, pack_number,
              ticket_price, start_ticket, close_ticket, tickets_sold, sales_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              sr.id, sr.shift_number, sDate, s.boxNumber, s.gameName,
              s.packNumber, parseNum(s.price, 0), s.startTicket || 0,
              s.currentTicket || 0, sold, amt
            ]
          );
        }
      }
    }

    // 7. Sync active dispensers from pos_state (ONLY loaded active boxes)
    const [pState] = await db.query('SELECT state_data FROM pos_state WHERE id = 1');
    if (pState.length > 0 && pState[0].state_data) {
      let state = {};
      try { state = JSON.parse(pState[0].state_data); } catch (_) {}
      await syncStateToNormalizedTables(state, db);
    }
  } catch (err) {
    console.warn('⚠️ [MySQL Migration] Notice during database cleanup:', err.message);
  }
}

// Sync POS state to active_dispensers (ONLY ACTIVE LOADED BOXES - ZERO EMPTY BOXES)
async function syncStateToNormalizedTables(state, db) {
  if (!state || !db) return;

  if (Array.isArray(state.slots)) {
    const activeBoxNums = [];

    for (const s of state.slots) {
      const isActive = (s.status === 'ACTIVE' || s.status === 'SOLD_OUT') &&
                       s.packNumber && s.packNumber !== '---' &&
                       s.gameName && s.gameName !== 'EMPTY' && s.gameName !== 'Empty Slot' &&
                       !s.isEmpty;

      if (!isActive) {
        // Remove empty box from active_dispensers table
        await db.query('DELETE FROM active_dispensers WHERE box_number = ?', [s.boxNumber]);
      } else {
        activeBoxNums.push(s.boxNumber);
        const sold = Math.max(0, (s.currentTicket || 0) - (s.startTicket || 0));
        const rem = Math.max(0, (s.packSize || 0) - (s.currentTicket || 0));
        const amt = sold * parseNum(s.price, 0);

        await db.query(
          `INSERT INTO active_dispensers (
            box_number, date, game_name, ticket_price, pack_number,
            start_ticket, current_ticket, tickets_sold, tickets_remaining, sales_revenue
          ) VALUES (?, CURRENT_DATE(), ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            date=CURRENT_DATE(),
            game_name=VALUES(game_name),
            ticket_price=VALUES(ticket_price),
            pack_number=VALUES(pack_number),
            start_ticket=VALUES(start_ticket),
            current_ticket=VALUES(current_ticket),
            tickets_sold=VALUES(tickets_sold),
            tickets_remaining=VALUES(tickets_remaining),
            sales_revenue=VALUES(sales_revenue)`,
          [
            s.boxNumber, s.gameName, parseNum(s.price, 0),
            s.packNumber, s.startTicket || 0, s.currentTicket || 0,
            sold, rem, amt
          ]
        );
      }
    }

    // Clean any boxes not in active list
    if (activeBoxNums.length > 0) {
      await db.query('DELETE FROM active_dispensers WHERE box_number NOT IN (?)', [activeBoxNums]);
    } else {
      await db.query('DELETE FROM active_dispensers');
    }
  }

  // 2. Sync reserve inventory packs
  if (Array.isArray(state.inventory)) {
    for (const inv of state.inventory) {
      if (!inv.packNumber) continue;
      const pPrice = parseNum(inv.price, 1);
      const pSize = inv.packSize || (pPrice >= 50 ? 18 : Math.floor(300 / pPrice));
      const todayStr = new Date().toLocaleDateString('en-US');

      await db.query(
        `INSERT INTO store_inventory (
          date_received, pack_number, game_name, ticket_price, pack_size, location
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          game_name=VALUES(game_name),
          ticket_price=VALUES(ticket_price),
          pack_size=VALUES(pack_size),
          location=VALUES(location)`,
        [
          todayStr, inv.packNumber, inv.gameName || 'Scratch Off',
          pPrice, pSize, inv.status === 'SAFE' ? 'SAFE' : 'STORAGE'
        ]
      );
    }
  }
}

// =============================================================
// API ROUTES
// =============================================================

// Safe Cloud & Railway Health Check Endpoint
app.get(['/health', '/api/health'], async (req, res) => {
  let dbHealthy = false;
  if (isDbConnected && pool) {
    try {
      await pool.query('SELECT 1');
      dbHealthy = true;
    } catch (_) {}
  }
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbHealthy ? 'connected' : (isDbConnected ? 'connected' : 'offline'),
    databaseName: isDbConnected ? dbConfig.database : undefined,
    version: '1.0.0'
  });
});

// 1. Health & Connection Status Check
app.get('/api/db-status', async (req, res) => {
  if (!pool) {
    return res.json({ connected: false, message: 'MySQL Pool is not initialized.', error: dbLastError });
  }
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS solution');
    isDbConnected = true;
    dbLastError = null;
    res.json({
      connected: true,
      database: dbConfig.database,
      host: dbConfig.host,
      port: dbConfig.port,
      status: 'Online & Synced'
    });
  } catch (err) {
    isDbConnected = false;
    dbLastError = err.message;
    res.status(500).json({ connected: false, error: err.message });
  }
});

// 2. Save Daily Report (Saves Parent + Itemized Active Box Sales with Date)
app.post('/api/save-day-report', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });

  try {
    const d = req.body;
    const reportDate = d.reportDate || new Date().toLocaleDateString('en-US');
    const reportTime = d.reportTime || new Date().toLocaleTimeString('en-US');
    const net = (parseNum(d.totalSales, 0) || (parseNum(d.totalScratcherSales, 0) + parseNum(d.onlineSales, 0))) -
                (parseNum(d.totalCashes, 0) || (parseNum(d.cashes, 0) + parseNum(d.onlineCashes, 0)));

    const query = `
      INSERT INTO daily_reports (
        report_date, report_time, cashier, store_name, total_scratcher_sales,
        online_sales, cashes, total_sales, net_balance, boxes_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      reportDate,
      reportTime,
      d.userId || 'master',
      d.storeName || 'AMIGO FOOD MART',
      parseNum(d.totalScratcherSales, 0),
      parseNum(d.onlineSales, 0),
      parseNum(d.cashes, 0) + parseNum(d.onlineCashes, 0),
      parseNum(d.totalSales, 0),
      net,
      JSON.stringify(d.boxes || [])
    ]);

    const reportId = result.insertId;

    // Insert Itemized Day Box Sales (NO EMPTY BOXES - DATE ALWAYS INCLUDED)
    if (Array.isArray(d.boxes) && d.boxes.length > 0) {
      for (const b of d.boxes) {
        // Skip empty dispenser boxes
        if (b.isEmpty || !b.name || b.name === 'EMPTY' || !b.pack || b.pack === '---') continue;

        if (b.isMultiPack && Array.isArray(b.subRows)) {
          for (const sr of b.subRows) {
            if (!sr.name || sr.name === 'EMPTY' || !sr.pack || sr.pack === '---') continue;
            const openT = parseIntSafe(sr.open, 0);
            const closeT = parseIntSafe(sr.close, 0);
            const sold = Math.max(0, closeT - openT);
            await pool.query(
              `INSERT INTO day_box_sales (
                report_id, date, box_number, game_name, pack_number, ticket_price,
                opening_ticket, closing_ticket, tickets_sold, sales_amount
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                reportId, reportDate, b.box, sr.name, sr.pack,
                parseNum(sr.price, 0), openT, closeT, sold,
                parseNum(sr.total, 0)
              ]
            );
          }
        } else {
          const openT = parseIntSafe(b.open, 0);
          const closeT = parseIntSafe(b.close, 0);
          const sold = Math.max(0, closeT - openT);
          await pool.query(
            `INSERT INTO day_box_sales (
              report_id, date, box_number, game_name, pack_number, ticket_price,
              opening_ticket, closing_ticket, tickets_sold, sales_amount
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              reportId, reportDate, b.box, b.name,
              b.pack, parseNum(b.price, 0), openT, closeT,
              sold, parseNum(b.total, 0)
            ]
          );
        }
      }
    }

    res.json({ success: true, insertId: reportId, message: 'Daily report saved with date and active boxes!' });
  } catch (err) {
    console.error('Error saving daily report to MySQL:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Get All Daily Reports
app.get('/api/day-reports', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  try {
    const [rows] = await pool.query('SELECT * FROM daily_reports ORDER BY id DESC LIMIT 100');
    res.json({ success: true, reports: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Get Itemized Box Sales for a Day Report
app.get('/api/day-report/:id/boxes', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  try {
    const [rows] = await pool.query('SELECT * FROM day_box_sales WHERE report_id = ? ORDER BY box_number', [req.params.id]);
    res.json({ success: true, boxes: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Save Shift Report (Saves Parent + Itemized Active Box Sales with Date)
app.post('/api/save-shift-report', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });

  try {
    const h = req.body;
    const floatVal = parseNum(h.drawerFloat, 0);
    const lottoSales = parseNum(h.totalSalesRevenue, 0);
    const cashes = parseNum(h.cashes, 0);
    const expectedCash = floatVal + lottoSales - cashes;
    const actualCash = parseNum(h.actualCashCounted, expectedCash);
    const overShort = actualCash - expectedCash;
    const shiftDate = h.endedAt ? String(h.endedAt).slice(0, 10) : (h.startedAt ? String(h.startedAt).slice(0, 10) : new Date().toLocaleDateString('en-US'));

    const query = `
      INSERT INTO shift_reports (
        shift_number, shift_date, cashier, tickets_sold, total_sales,
        cashes, drawer_float, actual_cash_counted, expected_cash,
        drawer_over_short, slots_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query(query, [
      parseIntSafe(h.shiftNumber, 1),
      shiftDate,
      h.cashier || 'master',
      parseIntSafe(h.totalTicketsSold, 0),
      lottoSales,
      cashes,
      floatVal,
      actualCash,
      expectedCash,
      overShort,
      JSON.stringify(h.slots || [])
    ]);

    const shiftId = result.insertId;

    // Insert Itemized Shift Box Sales (NO EMPTY BOXES - DATE ALWAYS INCLUDED)
    if (Array.isArray(h.slots) && h.slots.length > 0) {
      for (const s of h.slots) {
        // Skip empty dispenser boxes
        if (!s.packNumber || s.packNumber === '---' || s.status === 'EMPTY' || !s.gameName || s.gameName === 'Empty Slot') continue;

        const sold = Math.max(0, (s.currentTicket || 0) - (s.startTicket || 0));
        const amt = sold * parseNum(s.price, 0);
        await pool.query(
          `INSERT INTO shift_box_sales (
            shift_id, shift_number, date, box_number, game_name, pack_number,
            ticket_price, start_ticket, close_ticket, tickets_sold, sales_amount
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            shiftId, parseIntSafe(h.shiftNumber, 1), shiftDate, s.boxNumber,
            s.gameName, s.packNumber, parseNum(s.price, 0),
            s.startTicket || 0, s.currentTicket || 0, sold, amt
          ]
        );
      }
    }

    res.json({ success: true, insertId: shiftId, message: 'Shift report saved with date and active boxes!' });
  } catch (err) {
    console.error('Error saving shift report to MySQL:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Get All Shift Reports
app.get('/api/shift-reports', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  try {
    const [rows] = await pool.query('SELECT * FROM shift_reports ORDER BY shift_number DESC LIMIT 100');
    res.json({ success: true, shifts: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Get Itemized Box Sales for a Shift
app.get('/api/shift-report/:id/boxes', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  try {
    const [rows] = await pool.query('SELECT * FROM shift_box_sales WHERE shift_id = ? ORDER BY box_number', [req.params.id]);
    res.json({ success: true, boxes: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Persistent storage paths for multi-client state & users synchronization
const DATA_DIR = path.join(__dirname, 'server_data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
}
const POS_STATE_FILE = path.join(DATA_DIR, 'pos_state.json');
const USERS_FILE = path.join(DATA_DIR, 'registered_users.json');

function getPosStateFilePath(storeId = 'store_amigo') {
  const cleanId = String(storeId || 'store_amigo').replace(/[^a-zA-Z0-9_-]/g, '_');
  const specificFile = path.join(DATA_DIR, `pos_state_${cleanId}.json`);
  if (fs.existsSync(specificFile)) return specificFile;

  if (cleanId === 'store_amigo' || cleanId.includes('amigo')) {
    const amigoFoodMartFile = path.join(DATA_DIR, 'pos_state_store_amigo_food_mart.json');
    if (fs.existsSync(amigoFoodMartFile)) return amigoFoodMartFile;
    if (fs.existsSync(POS_STATE_FILE)) return POS_STATE_FILE;
  }
  return specificFile;
}

// 8. Full POS State Sync (Synchronizes active loaded boxes with Date)
app.post('/api/sync-pos-state', async (req, res) => {
  try {
    const raw = req.body;
    if (!raw) return res.status(400).json({ success: false, message: 'Missing state payload' });
    const stateObj = (raw && raw.state) ? raw.state : raw;
    const storeId = req.query.storeId || raw.storeId || stateObj.storeId || 'store_amigo';
    stateObj.storeId = storeId;
    const stateJson = JSON.stringify(stateObj);

    const targetFile = getPosStateFilePath(storeId);
    try {
      fs.writeFileSync(targetFile, stateJson, 'utf8');
      if (storeId === 'store_amigo') {
        fs.writeFileSync(POS_STATE_FILE, stateJson, 'utf8');
      }
    } catch (fsErr) {
      console.warn(`Warning writing ${targetFile}:`, fsErr.message);
    }

    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO store_pos_state (store_id, state_data) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE state_data = VALUES(state_data), updated_at = CURRENT_TIMESTAMP`,
          [storeId, stateJson]
        );
        if (storeId === 'store_amigo') {
          await pool.query(
            `INSERT INTO pos_state (id, state_data) VALUES (1, ?)
             ON DUPLICATE KEY UPDATE state_data = VALUES(state_data)`,
            [stateJson]
          );
          await syncStateToNormalizedTables(stateObj, pool);
        }
      } catch (dbErr) {
        console.warn('MySQL state sync warning:', dbErr.message);
      }
    }

    res.json({ success: true, storeId, message: `Active dispensers and state synchronized for store ${storeId}!` });
  } catch (err) {
    console.error('Error synchronizing POS state:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Load POS State from MySQL or fallback JSON store (Isolated per storeId)
app.get('/api/load-pos-state', async (req, res) => {
  try {
    const storeId = req.query.storeId || 'store_amigo';
    const targetFile = getPosStateFilePath(storeId);

    // 1. Try MySQL first from store_pos_state table (or legacy pos_state for store_amigo)
    if (isDbConnected && pool) {
      try {
        const [rows] = await pool.query('SELECT state_data, updated_at FROM store_pos_state WHERE store_id = ?', [storeId]);
        if (rows.length > 0 && rows[0].state_data) {
          const stateObj = JSON.parse(rows[0].state_data);
          stateObj.storeId = storeId;
          return res.json({ success: true, storeId, state: stateObj, updatedAt: rows[0].updated_at });
        }
        if (storeId === 'store_amigo') {
          const [legRows] = await pool.query('SELECT state_data, updated_at FROM pos_state WHERE id = 1');
          if (legRows.length > 0 && legRows[0].state_data) {
            const stateObj = JSON.parse(legRows[0].state_data);
            stateObj.storeId = 'store_amigo';
            return res.json({ success: true, storeId: 'store_amigo', state: stateObj, updatedAt: legRows[0].updated_at });
          }
        }
      } catch (dbErr) {
        console.warn('MySQL read error, falling back to JSON file:', dbErr.message);
      }
    }

    // 2. Fallback to file persistence
    if (fs.existsSync(targetFile)) {
      const raw = fs.readFileSync(targetFile, 'utf8');
      const stat = fs.statSync(targetFile);
      const stateObj = JSON.parse(raw);
      stateObj.storeId = storeId;
      return res.json({ success: true, storeId, state: stateObj, updatedAt: stat.mtime });
    }

    res.json({ success: false, storeId, message: `No stored state found in backend for store ${storeId}.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9a. Clear POS State across server & database (Isolated per storeId)
app.post('/api/clear-pos-state', async (req, res) => {
  try {
    const storeId = req.query.storeId || req.body?.storeId || 'store_amigo';
    const targetFile = getPosStateFilePath(storeId);
    if (fs.existsSync(targetFile)) {
      try { fs.unlinkSync(targetFile); } catch (_) {}
    }
    if (isDbConnected && pool) {
      try {
        await pool.query('DELETE FROM store_pos_state WHERE store_id = ?', [storeId]);
      } catch (dbErr) {
        console.warn('MySQL store_pos_state clear warning:', dbErr.message);
      }
    }
    if (storeId === 'store_amigo') {
      if (fs.existsSync(POS_STATE_FILE)) {
        try { fs.unlinkSync(POS_STATE_FILE); } catch (_) {}
      }
      if (isDbConnected && pool) {
        try {
          await pool.query('DELETE FROM pos_state WHERE id = 1');
          await pool.query('DELETE FROM active_dispensers');
        } catch (dbErr) {
          console.warn('MySQL clear warning:', dbErr.message);
        }
      }
    }
    res.json({ success: true, storeId, message: `Server POS state cleared for store ${storeId}!` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9b. Multi-client User Accounts Sync
app.post('/api/sync-users', (req, res) => {
  try {
    const users = req.body;
    if (Array.isArray(users)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
      return res.json({ success: true });
    }
    res.status(400).json({ success: false, message: 'Expected array of users' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/load-users', (req, res) => {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      return res.json({ success: true, users: JSON.parse(raw) });
    }
    res.json({ success: false, message: 'No users file found' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Live Active Dispenser Rack (Only Loaded Boxes)
app.get('/api/active-dispensers', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  try {
    const [rows] = await pool.query('SELECT * FROM active_dispensers ORDER BY box_number');
    res.json({ success: true, dispensers: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Store Inventory (Table Query)
app.get('/api/inventory', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  try {
    const [rows] = await pool.query('SELECT * FROM store_inventory ORDER BY location, id DESC');
    res.json({ success: true, inventory: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Log Ticket Scan / Sale with Date & Time
app.post('/api/log-scan', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  try {
    const s = req.body;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US');
    const timeStr = now.toLocaleTimeString('en-US');

    await pool.query(
      `INSERT INTO ticket_scans_log (
        date, time, barcode, box_number, game_name, pack_number,
        ticket_number, ticket_price, cashier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dateStr, timeStr, s.barcode || 'UNKNOWN', s.boxNumber || 0,
        s.gameName || 'Scratch Off', s.packNumber || '---',
        parseIntSafe(s.ticketNumber, 0), parseNum(s.price, 0),
        s.cashier || 'master'
      ]
    );
    res.json({ success: true, message: 'Scan logged to database.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 13. Query Human-Readable SQL Views Directly
app.get('/api/views/:viewName', async (req, res) => {
  if (!isDbConnected || !pool) return res.status(503).json({ success: false, message: 'MySQL is offline.' });
  const allowedViews = [
    'v_current_dispenser_rack',
    'v_daily_sales_overview',
    'v_shift_settlement_audit',
    'v_top_selling_games'
  ];
  const { viewName } = req.params;
  if (!allowedViews.includes(viewName)) {
    return res.status(400).json({ success: false, message: 'Invalid view name. Allowed: ' + allowedViews.join(', ') });
  }
  try {
    const [rows] = await pool.query(`SELECT * FROM \`${viewName}\` LIMIT 200`);
    res.json({ success: true, view: viewName, rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 14. ENTERPRISE ROLE-BASED ADMIN & TICKET MANAGEMENT APIS
// ============================================================================

const ADMIN_STATE_FILE = path.join(DATA_DIR, 'admin_state.json');

const PBKDF2_ROUNDS = 600000;
const PBKDF2_DIGEST = 'sha256';
const PBKDF2_KEYLEN = 32;

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ROUNDS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `pbkdf2$${PBKDF2_DIGEST}$${PBKDF2_ROUNDS}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    // Format 1: Modern 5-part format -> pbkdf2$digest$iterations$salt$hash
    if (parts.length === 5) {
      const digest = parts[1];
      const iterations = parseInt(parts[2], 10);
      const salt = parts[3];
      const originalHash = parts[4];
      if (isNaN(iterations) || !salt || !originalHash) return false;
      try {
        const keylen = Buffer.from(originalHash, 'hex').length;
        const testHash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(originalHash, 'hex'));
      } catch (_) {
        return false;
      }
    }
    // Format 2: Legacy 4-part format -> pbkdf2$iterations$salt$hash (sha512)
    if (parts.length === 4) {
      const iterations = parseInt(parts[1], 10);
      const salt = parts[2];
      const originalHash = parts[3];
      if (isNaN(iterations) || !salt || !originalHash) return false;
      try {
        const testHash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(originalHash, 'hex'));
      } catch (_) {
        return false;
      }
    }
  }
  // Format 3: Plaintext fallback with timing-safe comparison
  try {
    const b1 = Buffer.from(String(password));
    const b2 = Buffer.from(String(storedHash));
    return b1.length === b2.length && crypto.timingSafeEqual(b1, b2);
  } catch (_) {
    return storedHash === password;
  }
}

function needsPasswordRehash(storedHash) {
  if (!storedHash || typeof storedHash !== 'string') return true;
  if (!storedHash.startsWith('pbkdf2$')) return true;
  const parts = storedHash.split('$');
  if (parts.length === 5) {
    const digest = parts[1];
    const iterations = parseInt(parts[2], 10);
    return digest !== PBKDF2_DIGEST || iterations < PBKDF2_ROUNDS;
  }
  return true;
}

const activeAdminSessions = new Map();

function getActiveAdminSession(token) {
  if (!token || typeof token !== 'string') return null;
  const cached = activeAdminSessions.get(token);
  if (cached) {
    if (new Date(cached.expiresAt) <= new Date()) {
      activeAdminSessions.delete(token);
      return null;
    }
    return cached;
  }

  const st = getAdminState();
  const sessionRecord = (st.adminSessions || []).find(s => s.token === token);
  if (sessionRecord) {
    if (new Date(sessionRecord.expiresAt) > new Date()) {
      activeAdminSessions.set(token, sessionRecord);
      return sessionRecord;
    } else {
      st.adminSessions = (st.adminSessions || []).filter(s => s.token !== token);
      saveAdminState(st);
    }
  }
  return null;
}

function getAdminState() {
  const defaultCatalog = [
    { gameId: '1650', gameName: '5X Money', gameCode: '1650', price: 1.00, packSize: 300, packValue: 300.00, isActive: true },
    { gameId: '1602', gameName: 'Jr Jumbo', gameCode: '1602', price: 1.00, packSize: 300, packValue: 300.00, isActive: true },
    { gameId: '1631', gameName: 'Loteria', gameCode: '1631', price: 2.00, packSize: 150, packValue: 300.00, isActive: true },
    { gameId: '1644', gameName: 'Hit 100', gameCode: '1644', price: 2.00, packSize: 150, packValue: 300.00, isActive: true },
    { gameId: '1590', gameName: 'Cross Word', gameCode: '1590', price: 3.00, packSize: 100, packValue: 300.00, isActive: true },
    { gameId: '1611', gameName: 'Treasure Hunt', gameCode: '1611', price: 3.00, packSize: 100, packValue: 300.00, isActive: true },
    { gameId: '1688', gameName: 'Lucky 7s', gameCode: '1688', price: 5.00, packSize: 60, packValue: 300.00, isActive: true },
    { gameId: '1711', gameName: '50X Money', gameCode: '1711', price: 10.00, packSize: 30, packValue: 300.00, isActive: true },
    { gameId: '1720', gameName: 'Hit 1000', gameCode: '1720', price: 20.00, packSize: 30, packValue: 600.00, isActive: true },
    { gameId: '1770', gameName: '500X The Money', gameCode: '1770', price: 50.00, packSize: 20, packValue: 1000.00, isActive: true }
  ];

  const defaultStores = [
    { storeId: 'store_amigo', storeName: 'AMIGO FOOD MART', ownerUsername: 'amigo', retailerNumber: 'GA-89412', address: '2300 MOODY RD WARNER ROBINS, GA, 31088', phone: '(478) 923-4567', totalBoxes: 65, authorizationStatus: 'APPROVED', operationalStatus: 'ACTIVE' },
    { storeId: 'store_downtown', storeName: 'DOWNTOWN QUICK MART', ownerUsername: 'downtown_owner', retailerNumber: 'GA-94103', address: '104 N COMMERCIAL BLVD, WARNER ROBINS, GA, 31088', phone: '(478) 953-8821', totalBoxes: 60, authorizationStatus: 'APPROVED', operationalStatus: 'ACTIVE' }
  ];

  const defaultApps = [
    {
      id: 1,
      storeId: 'store_metro',
      storeName: 'METRO EXPRESS MART',
      applicantName: 'Sarah Jenkins',
      applicantEmail: 'sarah@metromart.com',
      applicantPhone: '(478) 555-0199',
      businessTaxId: 'TAX-98214',
      lotteryRetailerId: 'GA-77120',
      address: '450 Northside Dr, Macon, GA 31210',
      documents: ['GA_Lottery_License_2026.pdf', 'Storefront_Photo.jpg'],
      status: 'PENDING',
      adminNotes: '',
      createdAt: new Date().toISOString()
    }
  ];

  const defaultAdmins = [
    { id: 'adm_001', username: 'admin', password_hash: '1234', full_name: 'Platform Administrator', email: 'admin@jackpotlo.com', role: 'SUPER_ADMIN', is_active: 1, created_at: new Date().toISOString() }
  ];

  let st = {
    admins: defaultAdmins,
    adminSessions: [],
    stores: defaultStores,
    applications: defaultApps,
    catalog: defaultCatalog,
    ticketRequests: [
      {
        id: 1,
        storeId: 'store_amigo',
        storeName: 'AMIGO FOOD MART',
        gameId: '1720',
        gameName: 'Hit 1000',
        price: 20,
        packSize: 30,
        requestedBy: 'amigo',
        status: 'PENDING',
        adminDecisionReason: '',
        reviewedBy: null,
        reviewedAt: null,
        createdAt: new Date().toISOString()
      }
    ],
    approvedTickets: [
      { storeId: 'store_amigo', gameId: '1650', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' },
      { storeId: 'store_amigo', gameId: '1602', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' },
      { storeId: 'store_amigo', gameId: '1631', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' },
      { storeId: 'store_amigo', gameId: '1644', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' },
      { storeId: 'store_amigo', gameId: '1590', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' },
      { storeId: 'store_amigo', gameId: '1611', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' },
      { storeId: 'store_amigo', gameId: '1688', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' },
      { storeId: 'store_amigo', gameId: '1711', approvedBy: 'admin', approvedAt: new Date().toISOString(), status: 'ACTIVE' }
    ],
    allocations: [
      {
        id: 1,
        allocationReference: 'ALC-2026-001',
        storeId: 'store_amigo',
        storeName: 'AMIGO FOOD MART',
        gameId: '1650',
        gameName: '5X Money',
        packNumber: '128842',
        packSize: 300,
        ticketPrice: 1.00,
        packValue: 300.00,
        totalTickets: 300,
        allocatedBy: 'admin',
        allocationDate: new Date().toISOString().split('T')[0],
        status: 'ALLOCATED',
        receivedAt: null,
        createdAt: new Date().toISOString()
      }
    ],
    auditLogs: [
      {
        id: 'aud_init',
        adminUsername: 'system',
        actionType: 'SYSTEM_BOOTSTRAP',
        targetEntity: 'platform',
        targetId: 'jackpotlo',
        details: { message: 'Initialized enterprise lottery management system' },
        createdAt: new Date().toISOString()
      }
    ]
  };

  if (fs.existsSync(ADMIN_STATE_FILE)) {
    try {
      const raw = fs.readFileSync(ADMIN_STATE_FILE, 'utf8');
      st = { ...st, ...JSON.parse(raw) };
    } catch (_) {}
  } else {
    try {
      fs.writeFileSync(ADMIN_STATE_FILE, JSON.stringify(st, null, 2), 'utf8');
    } catch (_) {}
  }
  return st;
}

function saveAdminState(st) {
  try {
    fs.writeFileSync(ADMIN_STATE_FILE, JSON.stringify(st, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving admin state file:', e);
  }
}

// Security Middleware: Require Platform Administrator privileges
function requireAdminRole(req, res, next) {
  const rawToken = req.headers['x-admin-token'] || req.headers['authorization'] || '';
  const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();
  const provisionKey = process.env.ADMIN_PROVISION_KEY || 'lotto_admin_secret_key';

  if (!token) {
    return res.status(403).json({
      success: false,
      message: 'Access Denied: Missing administrator authorization token.'
    });
  }

  // Allow server internal provision key or strictly validated session token
  if (token === provisionKey) {
    req.adminSession = { username: 'SUPER_ADMIN', role: 'SUPER_ADMIN' };
    return next();
  }

  const session = getActiveAdminSession(token);
  if (session) {
    req.adminSession = session;
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access Denied: Only authorized Platform Administrators can access this endpoint.'
  });
}

// 14a. Unified Role-Based Login Endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both username and password.' });
    }

    const normUser = String(username).trim().toLowerCase();
    const normPass = String(password).trim();
    const st = getAdminState();

    // 1. Check if user is a Platform Administrator
    const matchedAdmin = st.admins.find(a => (a.username || '').toLowerCase() === normUser && a.is_active);
    if (matchedAdmin) {
      // In production, reject default credentials
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction && normUser === 'admin' && (normPass === '1234' || matchedAdmin.password_hash === '1234')) {
        return res.status(403).json({
          success: false,
          code: 'DEFAULT_CREDENTIALS_PROHIBITED',
          message: 'Default admin credentials (admin/1234) cannot remain usable in production. Run "npm run admin:reset" or use the provisioning endpoint to configure a secure password.'
        });
      }

      const isPassValid = verifyPassword(normPass, matchedAdmin.password_hash);
      if (isPassValid) {
        // Automatically upgrade legacy plaintext or lower-work-factor hash to PBKDF2-HMAC-SHA256 (600,000 iterations)
        if (needsPasswordRehash(matchedAdmin.password_hash)) {
          matchedAdmin.password_hash = hashPassword(normPass);
          matchedAdmin.updated_at = new Date().toISOString();
        }

        // Generate cryptographically secure random session token
        const token = 'adm_' + crypto.randomBytes(32).toString('hex');
        const session = {
          token,
          username: matchedAdmin.username,
          fullName: matchedAdmin.full_name,
          role: 'SUPER_ADMIN',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };

        activeAdminSessions.set(token, session);
        if (!Array.isArray(st.adminSessions)) st.adminSessions = [];
        st.adminSessions = st.adminSessions.filter(s => new Date(s.expiresAt) > new Date()).slice(-49);
        st.adminSessions.push(session);

        // Audit log
        st.auditLogs.unshift({
          id: 'aud_' + Date.now(),
          adminUsername: matchedAdmin.username,
          actionType: 'ADMIN_LOGIN',
          targetEntity: 'admin_users',
          targetId: matchedAdmin.username,
          details: { ip: req.ip },
          createdAt: new Date().toISOString()
        });
        saveAdminState(st);

        return res.json({
          success: true,
          role: 'ADMIN',
          isAdmin: true,
          redirect: '/admin',
          token,
          user: {
            username: matchedAdmin.username,
            name: matchedAdmin.full_name,
            role: 'SUPER_ADMIN',
            email: matchedAdmin.email
          }
        });
      } else {
        return res.status(401).json({ success: false, message: 'Incorrect password for administrator account.' });
      }
    }

    // 2. Normal Store User Login (e.g. amigo, store owner, cashier)
    const cleanId = normUser.replace(/[^a-z0-9_]/g, '_');
    const isAmigo = normUser === 'amigo' || normUser === 'master';
    
    // Look up store by owner username, storeId, or amigo default
    const matchedStore = st.stores.find(s => 
      (s.ownerUsername && s.ownerUsername.toLowerCase() === normUser) ||
      (s.storeId && s.storeId.toLowerCase() === normUser) ||
      (s.storeId && s.storeId.toLowerCase() === ('store_' + cleanId)) ||
      (isAmigo && s.storeId === 'store_amigo')
    );

    // Check for pending application
    const matchedApp = (st.applications || []).find(a => 
      (a.applicantName && a.applicantName.toLowerCase().replace(/\s+/g, '_') === normUser) ||
      (a.storeId && a.storeId.toLowerCase() === ('store_' + cleanId)) ||
      (a.storeId && a.storeId.toLowerCase() === normUser)
    );

    if (matchedApp && matchedApp.status === 'PENDING' && !matchedStore) {
      return res.status(403).json({
        success: false,
        code: 'STORE_APPLICATION_PENDING',
        message: `Your store registration for "${matchedApp.storeName}" is currently pending administrator review. You will be able to log in once approved.`
      });
    }

    if (matchedApp && matchedApp.status === 'REJECTED' && !matchedStore) {
      return res.status(403).json({
        success: false,
        code: 'STORE_APPLICATION_REJECTED',
        message: `Your store application for "${matchedApp.storeName}" was rejected by lottery administration.`
      });
    }

    const storeId = matchedStore ? matchedStore.storeId : (isAmigo ? 'store_amigo' : ('store_' + cleanId));
    const storeName = matchedStore ? matchedStore.storeName : (isAmigo ? 'Amigo Food Mart' : (username.charAt(0).toUpperCase() + username.slice(1) + ' Store'));
    const isSuspended = matchedStore ? matchedStore.authorizationStatus === 'SUSPENDED' : false;

    // Auto-create/register store in st.stores if new self-service tenant
    if (!matchedStore) {
      st.stores.push({
        storeId,
        storeName,
        ownerUsername: normUser,
        retailerNumber: `GA-${Math.floor(10000 + Math.random() * 90000)}`,
        address: 'Georgia Retail Location',
        phone: '(478) 555-0100',
        totalBoxes: 65,
        authorizationStatus: 'APPROVED',
        operationalStatus: 'ACTIVE'
      });
      saveAdminState(st);
    }

    return res.json({
      success: true,
      role: 'STORE_USER',
      isAdmin: false,
      redirect: '/',
      storeId,
      storeName,
      isSuspended,
      user: {
        username: normUser,
        name: username.charAt(0).toUpperCase() + username.slice(1),
        role: 'Store Owner',
        storeId,
        storeName
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14b. Secure Administrator Provisioning Endpoint
app.post('/api/admin/provision', async (req, res) => {
  try {
    const key = req.headers['x-admin-provision-key'] || req.body?.provisionKey;
    const expectedKey = process.env.ADMIN_PROVISION_KEY || 'lotto_admin_secret_key';
    const st = getAdminState();

    if (key !== expectedKey) {
      return res.status(403).json({ success: false, message: 'Invalid admin provisioning key.' });
    }

    const { username, password, fullName, email } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required.' });
    }

    if (String(password).length < 8 && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters in production.' });
    }

    const normUser = String(username).trim().toLowerCase();
    const existing = st.admins.find(a => (a.username || '').toLowerCase() === normUser);
    const hashedPassword = hashPassword(String(password).trim());

    if (existing) {
      existing.password_hash = hashedPassword;
      existing.full_name = fullName || existing.full_name;
      existing.email = email || existing.email;
      existing.is_active = 1;
      existing.updated_at = new Date().toISOString();
    } else {
      st.admins.push({
        id: `adm_${Date.now()}`,
        username: normUser,
        password_hash: hashedPassword,
        full_name: fullName || `${username} Admin`,
        email: email || `${normUser}@jackpotlo.com`,
        role: 'SUPER_ADMIN',
        is_active: 1,
        created_at: new Date().toISOString()
      });
    }

    // Revoke any existing sessions for this admin
    if (Array.isArray(st.adminSessions)) {
      st.adminSessions = st.adminSessions.filter(s => (s.username || '').toLowerCase() !== normUser);
    }
    for (const [t, s] of activeAdminSessions.entries()) {
      if ((s.username || '').toLowerCase() === normUser) {
        activeAdminSessions.delete(t);
      }
    }

    st.auditLogs.unshift({
      id: `aud_${Date.now()}`,
      adminUsername: 'API_PROVISION',
      actionType: 'ADMIN_PROVISIONED',
      targetEntity: 'admin_users',
      targetId: normUser,
      details: { username: normUser, fullName },
      createdAt: new Date().toISOString()
    });

    saveAdminState(st);

    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO admin_users (id, username, password_hash, full_name, email, role, is_active)
           VALUES (?, ?, ?, ?, ?, 'SUPER_ADMIN', 1)
           ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), full_name = VALUES(full_name), email = VALUES(email), is_active = 1`,
          [`adm_${Date.now()}`, normUser, hashedPassword, fullName || `${username} Admin`, email || `${normUser}@jackpotlo.com`]
        );
      } catch (dbErr) {
        console.warn('MySQL admin provision warning:', dbErr.message);
      }
    }

    res.json({ success: true, message: `Administrator "${normUser}" provisioned successfully with cryptographically hashed credentials.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14b-2. Administrator Password Change Endpoint
app.post('/api/admin/change-password', requireAdminRole, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
    }

    if (newPassword === '1234' || newPassword.toLowerCase() === 'admin') {
      return res.status(400).json({ success: false, message: 'Insecure password rejected. Choose a strong password.' });
    }

    const st = getAdminState();
    const sessionUser = req.adminSession?.username;
    const adminRec = st.admins.find(a => (a.username || '').toLowerCase() === (sessionUser || '').toLowerCase());
    if (!adminRec) {
      return res.status(404).json({ success: false, message: 'Administrator account not found.' });
    }

    if (!verifyPassword(currentPassword, adminRec.password_hash)) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    adminRec.password_hash = hashPassword(newPassword);
    adminRec.updated_at = new Date().toISOString();

    // Revoke other sessions
    const currentToken = req.headers['x-admin-token'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (Array.isArray(st.adminSessions)) {
      st.adminSessions = st.adminSessions.filter(s => s.token === currentToken || (s.username || '').toLowerCase() !== adminRec.username.toLowerCase());
    }

    st.auditLogs.unshift({
      id: `aud_${Date.now()}`,
      adminUsername: adminRec.username,
      actionType: 'ADMIN_PASSWORD_CHANGED',
      targetEntity: 'admin_users',
      targetId: adminRec.username,
      details: { message: 'Password securely changed and hashed with PBKDF2-HMAC-SHA256 (600,000 iterations)' },
      createdAt: new Date().toISOString()
    });

    saveAdminState(st);

    if (isDbConnected && pool) {
      try {
        await pool.query(
          'UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?',
          [adminRec.password_hash, adminRec.username]
        );
      } catch (dbErr) {
        console.warn('MySQL admin password change warning:', dbErr.message);
      }
    }

    res.json({ success: true, message: `Password for administrator "${adminRec.username}" successfully updated.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14b-3. Administrator Logout Endpoint (Revokes Server Session Token)
app.post(['/api/admin/logout', '/api/auth/logout'], (req, res) => {
  try {
    const rawToken = req.headers['x-admin-token'] || req.headers['authorization'] || req.body?.token || '';
    const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7).trim() : rawToken.trim();
    
    if (token) {
      activeAdminSessions.delete(token);
      const st = getAdminState();
      if (Array.isArray(st.adminSessions)) {
        st.adminSessions = st.adminSessions.filter(s => s.token !== token);
        saveAdminState(st);
      }
    }
    return res.json({ success: true, message: 'Administrator session revoked successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14c. Admin Dashboard: Overview Metrics
app.get('/api/admin/overview', requireAdminRole, (req, res) => {
  const st = getAdminState();
  const totalStores = st.stores.length;
  const pendingApplications = st.applications.filter(a => a.status === 'PENDING').length;
  const approvedStores = st.stores.filter(s => s.authorizationStatus === 'APPROVED').length;
  const suspendedStores = st.stores.filter(s => s.authorizationStatus === 'SUSPENDED').length;
  const totalCatalogGames = st.catalog.length;
  const pendingRequests = st.ticketRequests.filter(r => r.status === 'PENDING').length;
  const totalAllocations = st.allocations.length;

  res.json({
    success: true,
    stats: {
      totalStores,
      pendingApplications,
      approvedStores,
      suspendedStores,
      totalCatalogGames,
      pendingRequests,
      totalAllocations
    },
    recentActivity: st.auditLogs.slice(0, 10)
  });
});

// 14d. Admin: Stores List
app.get('/api/admin/stores', requireAdminRole, (req, res) => {
  const st = getAdminState();
  res.json({ success: true, stores: st.stores });
});

// 14e. Admin: Update Store Status (Suspend / Reactivate)
app.post('/api/admin/stores/:storeId/status', requireAdminRole, (req, res) => {
  const { storeId } = req.params;
  const { authorizationStatus, operationalStatus, reason, adminUsername } = req.body || {};
  const st = getAdminState();
  const store = st.stores.find(s => s.storeId === storeId);
  if (!store) return res.status(404).json({ success: false, message: 'Store not found' });

  store.authorizationStatus = authorizationStatus || store.authorizationStatus;
  store.operationalStatus = operationalStatus || store.operationalStatus;
  store.updatedAt = new Date().toISOString();

  st.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminUsername: adminUsername || 'admin',
    actionType: `STORE_${store.authorizationStatus}`,
    targetEntity: 'stores',
    targetId: storeId,
    details: { storeName: store.storeName, reason, authorizationStatus, operationalStatus },
    createdAt: new Date().toISOString()
  });

  saveAdminState(st);
  res.json({ success: true, store, message: `Store "${store.storeName}" status updated to ${store.authorizationStatus}.` });
});

// Public: Store Registration / Lottery License Application
app.post(['/api/store-applications', '/api/applications'], async (req, res) => {
  try {
    const b = req.body || {};
    const storeName = b.storeName || b.name;
    const applicantName = b.applicantName || b.ownerName || b.applicant_name;
    const applicantEmail = b.applicantEmail || b.ownerEmail || b.email || '';
    const applicantPhone = b.applicantPhone || b.ownerPhone || b.phone || '';
    const businessTaxId = b.businessTaxId || b.taxId || `TAX-${Math.floor(10000 + Math.random() * 90000)}`;
    const lotteryRetailerId = b.lotteryRetailerId || b.businessNumber || b.retailerNumber || `GA-${Math.floor(10000 + Math.random() * 90000)}`;
    const address = b.address || '';
    const username = b.username;

    if (!storeName || !applicantName) {
      return res.status(400).json({ success: false, message: 'Store Name and Applicant Name are required.' });
    }

    const st = getAdminState();
    const cleanId = String(storeName).toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'store_' + Date.now();
    const storeId = cleanId.startsWith('store_') ? cleanId : ('store_' + cleanId);
    const ownerUser = (username || applicantName).toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const newApp = {
      id: Date.now(),
      storeId,
      storeName: String(storeName).trim(),
      applicantName: String(applicantName).trim(),
      ownerUsername: ownerUser,
      applicantEmail,
      applicantPhone,
      businessTaxId,
      lotteryRetailerId,
      address,
      documents: ['State Lottery Certificate (Verified)', 'Retail Business License (Pending Verification)'],
      status: 'PENDING',
      adminNotes: '',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(st.applications)) st.applications = [];
    st.applications.unshift(newApp);

    // Save to MySQL if available
    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO store_applications 
            (store_id, store_name, applicant_name, applicant_email, applicant_phone, business_tax_id, lottery_retailer_id, address, documents, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newApp.storeId, newApp.storeName, newApp.applicantName, newApp.applicantEmail, newApp.applicantPhone, newApp.businessTaxId, newApp.lotteryRetailerId, newApp.address, JSON.stringify(newApp.documents), 'PENDING']
        );
      } catch (dbErr) {
        console.warn('MySQL application insert error:', dbErr.message);
      }
    }

    saveAdminState(st);
    res.json({
      success: true,
      message: `Store application for "${newApp.storeName}" submitted successfully! It is now pending administrator review.`,
      application: newApp
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 14f. Admin: Store Applications
app.get('/api/admin/applications', requireAdminRole, (req, res) => {
  const st = getAdminState();
  res.json({ success: true, applications: st.applications });
});

// 14g. Admin: Review Store Application
app.post('/api/admin/applications/:id/review', requireAdminRole, async (req, res) => {
  const id = req.params.id;
  const { decision, notes, adminUsername } = req.body || {};
  const st = getAdminState();
  const appRec = st.applications.find(a => String(a.id) === String(id));
  if (!appRec) return res.status(404).json({ success: false, message: 'Application not found' });

  const statusMap = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    MORE_INFO: 'MORE_INFO_REQUIRED'
  };
  appRec.status = statusMap[decision] || 'PENDING';
  appRec.adminNotes = notes || '';
  appRec.reviewedBy = adminUsername || 'admin';
  appRec.reviewedAt = new Date().toISOString();

  if (decision === 'APPROVE') {
    const ownerUser = (appRec.ownerUsername || appRec.applicantName || 'owner').toLowerCase().replace(/\s+/g, '_');
    const existingStore = st.stores.find(s => s.storeId === appRec.storeId);
    if (!existingStore) {
      st.stores.push({
        storeId: appRec.storeId,
        storeName: appRec.storeName,
        ownerUsername: ownerUser,
        retailerNumber: appRec.lotteryRetailerId || `GA-${Math.floor(10000 + Math.random() * 90000)}`,
        address: appRec.address,
        phone: appRec.applicantPhone,
        totalBoxes: 65,
        authorizationStatus: 'APPROVED',
        operationalStatus: 'ACTIVE'
      });
    } else {
      existingStore.authorizationStatus = 'APPROVED';
      existingStore.operationalStatus = 'ACTIVE';
    }

    // Initialize clean POS state for the new store
    const storeStateFile = getPosStateFilePath(appRec.storeId);
    if (!fs.existsSync(storeStateFile)) {
      const cleanState = {
        storeId: appRec.storeId,
        storeName: appRec.storeName,
        totalSlots: 65,
        shiftNumber: 1,
        shiftStatus: 'SHIFT_NOT_STARTED',
        slots: Array.from({ length: 65 }, (_, i) => ({
          boxNumber: i + 1,
          gameName: '',
          price: 1,
          packNumber: '',
          startTicket: 0,
          currentTicket: 0,
          ticketsSold: 0,
          status: 'EMPTY'
        })),
        inStockInventory: []
      };
      try {
        fs.writeFileSync(storeStateFile, JSON.stringify(cleanState, null, 2), 'utf8');
      } catch (_) {}
    }

    // Persist to MySQL stores, store_applications, and store_pos_state tables
    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO stores (store_id, store_name, owner_username, retailer_number, address, phone, total_boxes, authorization_status, operational_status)
           VALUES (?, ?, ?, ?, ?, ?, 65, 'APPROVED', 'ACTIVE')
           ON DUPLICATE KEY UPDATE authorization_status = 'APPROVED', operational_status = 'ACTIVE'`,
          [appRec.storeId, appRec.storeName, ownerUser, appRec.lotteryRetailerId || 'GA-00000', appRec.address, appRec.applicantPhone]
        );
        await pool.query(
          `UPDATE store_applications SET status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, admin_notes = ? WHERE store_id = ?`,
          [adminUsername || 'admin', notes || '', appRec.storeId]
        );
        await pool.query(
          `INSERT INTO store_pos_state (store_id, state_data) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE state_data = VALUES(state_data), updated_at = CURRENT_TIMESTAMP`,
          [appRec.storeId, JSON.stringify(cleanState)]
        );
      } catch (dbErr) {
        console.warn('MySQL store approve error:', dbErr.message);
      }
    }
  }

  st.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminUsername: adminUsername || 'admin',
    actionType: `APPLICATION_${appRec.status}`,
    targetEntity: 'store_applications',
    targetId: String(id),
    details: { storeName: appRec.storeName, notes },
    createdAt: new Date().toISOString()
  });

  saveAdminState(st);
  res.json({ success: true, application: appRec });
});

// 14h. Admin: Lottery Ticket Catalog
app.get('/api/admin/catalog', requireAdminRole, (req, res) => {
  const st = getAdminState();
  res.json({ success: true, catalog: st.catalog });
});

app.post('/api/admin/catalog', requireAdminRole, (req, res) => {
  const game = req.body;
  if (!game || !game.gameId || !game.gameName) {
    return res.status(400).json({ success: false, message: 'Game ID and Name are required.' });
  }
  const st = getAdminState();
  const existingIdx = st.catalog.findIndex(g => g.gameId === game.gameId);
  const cleanGame = {
    gameId: String(game.gameId),
    gameName: String(game.gameName).trim(),
    gameCode: String(game.gameCode || game.gameId).trim(),
    price: parseNum(game.price, 1),
    packSize: parseIntSafe(game.packSize, 100),
    packValue: parseNum(game.packValue, parseNum(game.price, 1) * parseIntSafe(game.packSize, 100)),
    isActive: Boolean(game.isActive ?? true)
  };

  if (existingIdx >= 0) {
    st.catalog[existingIdx] = cleanGame;
  } else {
    st.catalog.push(cleanGame);
  }

  st.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminUsername: req.body.adminUsername || 'admin',
    actionType: existingIdx >= 0 ? 'CATALOG_GAME_UPDATED' : 'CATALOG_GAME_ADDED',
    targetEntity: 'lottery_ticket_catalog',
    targetId: cleanGame.gameId,
    details: cleanGame,
    createdAt: new Date().toISOString()
  });

  saveAdminState(st);
  res.json({ success: true, game: cleanGame });
});

// 14i. Admin: Store Ticket Requests
app.get('/api/admin/ticket-requests', requireAdminRole, (req, res) => {
  const st = getAdminState();
  res.json({ success: true, requests: st.ticketRequests });
});

app.post('/api/admin/ticket-requests/:id/review', requireAdminRole, async (req, res) => {
  const id = req.params.id;
  const { decision, reason, adminUsername } = req.body || {};
  const st = getAdminState();
  const reqItem = st.ticketRequests.find(r => String(r.id) === String(id));
  if (!reqItem) return res.status(404).json({ success: false, message: 'Request not found' });

  const statusMap = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    MORE_INFO: 'MORE_INFO_REQUIRED'
  };
  reqItem.status = statusMap[decision] || 'PENDING';
  reqItem.adminDecisionReason = reason || '';
  reqItem.reviewedBy = adminUsername || 'admin';
  reqItem.reviewedAt = new Date().toISOString();

  // On approval: record in store_approved_tickets (authorizes store, but does NOT create physical stock!)
  if (decision === 'APPROVE') {
    const already = st.approvedTickets.some(a => a.storeId === reqItem.storeId && a.gameId === reqItem.gameId);
    if (!already) {
      st.approvedTickets.push({
        storeId: reqItem.storeId,
        gameId: reqItem.gameId,
        approvedBy: adminUsername || 'admin',
        approvedAt: new Date().toISOString(),
        status: 'ACTIVE'
      });
    }

    if (isDbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO store_approved_tickets (store_id, game_id, approved_by, status)
           VALUES (?, ?, ?, 'ACTIVE')
           ON DUPLICATE KEY UPDATE status = 'ACTIVE'`,
          [reqItem.storeId, reqItem.gameId, adminUsername || 'admin']
        );
        await pool.query(
          `UPDATE store_ticket_requests SET status = 'APPROVED', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, admin_decision_reason = ? WHERE id = ?`,
          [adminUsername || 'admin', reason || '', reqItem.id]
        );
      } catch (dbErr) {
        console.warn('MySQL ticket approval warning:', dbErr.message);
      }
    }
  }

  st.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminUsername: adminUsername || 'admin',
    actionType: `TICKET_REQUEST_${reqItem.status}`,
    targetEntity: 'store_ticket_requests',
    targetId: String(id),
    details: { storeId: reqItem.storeId, gameName: reqItem.gameName, reason },
    createdAt: new Date().toISOString()
  });

  saveAdminState(st);
  res.json({ success: true, request: reqItem });
});

// 14j. Admin: Ticket Stock Allocations
app.get('/api/admin/allocations', requireAdminRole, (req, res) => {
  const st = getAdminState();
  res.json({ success: true, allocations: st.allocations });
});

app.post('/api/admin/allocations', requireAdminRole, async (req, res) => {
  const data = req.body || {};
  const st = getAdminState();
  const cleanPack = String(data.packNumber || '').trim();

  if (!cleanPack || !data.storeId || !data.gameId) {
    return res.status(400).json({ success: false, message: 'Store, Game, and Pack Number are required.' });
  }

  // Prevent duplicate allocations of the same pack to this store
  const isDuplicate = st.allocations.some(a => a.storeId === data.storeId && String(a.packNumber).trim() === cleanPack);
  if (isDuplicate) {
    return res.status(400).json({
      success: false,
      message: `Pack #${cleanPack} is already allocated to store "${data.storeName || data.storeId}". Duplicate allocations are prevented.`
    });
  }

  const newAlloc = {
    id: Date.now(),
    allocationReference: data.allocationReference || `ALC-${Date.now().toString().slice(-6)}`,
    storeId: data.storeId,
    storeName: data.storeName || data.storeId,
    gameId: data.gameId,
    gameName: data.gameName || 'Lottery Scratch Game',
    packNumber: cleanPack,
    packSize: parseIntSafe(data.packSize, 100),
    ticketPrice: parseNum(data.ticketPrice, 1.00),
    packValue: parseNum(data.packValue, parseNum(data.ticketPrice, 1.00) * parseIntSafe(data.packSize, 100)),
    totalTickets: parseIntSafe(data.packSize, 100),
    allocatedBy: data.adminUsername || 'admin',
    allocationDate: data.allocationDate || new Date().toISOString().split('T')[0],
    status: 'ALLOCATED',
    receivedAt: null,
    createdAt: new Date().toISOString()
  };

  st.allocations.unshift(newAlloc);

  // Update target store's live inventory so pack appears in store's POS in-stock inventory
  const storeStateFile = getPosStateFilePath(data.storeId);
  let storeStateObj = { slots: [], inStockInventory: [] };
  if (fs.existsSync(storeStateFile)) {
    try { storeStateObj = JSON.parse(fs.readFileSync(storeStateFile, 'utf8')); } catch (_) {}
  }
  if (!Array.isArray(storeStateObj.inStockInventory)) storeStateObj.inStockInventory = [];
  const alreadyInStock = storeStateObj.inStockInventory.some(p => String(p.packNumber) === cleanPack);
  if (!alreadyInStock) {
    storeStateObj.inStockInventory.push({
      id: `alloc_${Date.now()}_${cleanPack}`,
      gameName: newAlloc.gameName,
      gameNumber: `Game ${newAlloc.gameId}`,
      packNumber: cleanPack,
      price: newAlloc.ticketPrice,
      packSize: `${newAlloc.packSize} tickets`,
      packSizeNum: newAlloc.packSize,
      status: 'IN_STOCK',
      statusLabel: 'In stock',
      statusBadgeClass: 'badge-in-stock',
      boxNumber: null,
      position: '000',
      receivedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    });
    try {
      fs.writeFileSync(storeStateFile, JSON.stringify(storeStateObj, null, 2), 'utf8');
    } catch (e) {
      console.warn('Error updating store state with allocation:', e.message);
    }
  }

  // Persist to MySQL tables
  if (isDbConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO ticket_stock_allocations (
          allocation_reference, store_id, store_name, game_id, game_name, pack_number,
          pack_size, ticket_price, pack_value, total_tickets, allocated_by, allocation_date, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ALLOCATED')
        ON DUPLICATE KEY UPDATE status = 'ALLOCATED'`,
        [
          newAlloc.allocationReference, newAlloc.storeId, newAlloc.storeName, newAlloc.gameId,
          newAlloc.gameName, newAlloc.packNumber, newAlloc.packSize, newAlloc.ticketPrice,
          newAlloc.packValue, newAlloc.totalTickets, newAlloc.allocatedBy, newAlloc.allocationDate
        ]
      );
      await pool.query(
        `INSERT INTO store_inventory (store_id, date_received, pack_number, game_name, ticket_price, pack_size, location)
         VALUES (?, CURDATE(), ?, ?, ?, ?, 'STORAGE')
         ON DUPLICATE KEY UPDATE location = 'STORAGE'`,
        [newAlloc.storeId, newAlloc.packNumber, newAlloc.gameName, newAlloc.ticketPrice, newAlloc.packSize]
      );
      await pool.query(
        `INSERT INTO store_pos_state (store_id, state_data) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE state_data = VALUES(state_data), updated_at = CURRENT_TIMESTAMP`,
        [data.storeId, JSON.stringify(storeStateObj)]
      );
    } catch (dbErr) {
      console.warn('MySQL allocation insert warning:', dbErr.message);
    }
  }

  st.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    adminUsername: data.adminUsername || 'admin',
    actionType: 'STOCK_ALLOCATED',
    targetEntity: 'ticket_stock_allocations',
    targetId: cleanPack,
    details: { storeId: data.storeId, gameName: data.gameName, packNumber: cleanPack, ref: newAlloc.allocationReference },
    createdAt: new Date().toISOString()
  });

  saveAdminState(st);
  res.json({ success: true, allocation: newAlloc });
});

// 14k. Admin: Reports Across Stores
app.get('/api/admin/reports', requireAdminRole, (req, res) => {
  const st = getAdminState();
  const storesData = [];
  const inventoryData = [];
  const shiftReportsList = [];
  const discrepanciesList = [];

  st.stores.forEach(store => {
    const storeState = getPosStateFilePath(store.storeId);
    let activeBoxes = 0;
    let ticketsSold = 0;
    let sales = 0;
    let onlineSales = 0;
    let cashes = 0;
    let netBalance = 0;
    let activeCounterPacks = 0;
    let activeCounterValue = 0;
    let safePacksCount = 0;
    let safePacksValue = 0;
    let storagePacksCount = 0;
    let storagePacksValue = 0;
    const storePacks = [];

    if (fs.existsSync(storeState)) {
      try {
        const raw = JSON.parse(fs.readFileSync(storeState, 'utf8'));
        const slots = Array.isArray(raw.slots) ? raw.slots : [];
        const activeSlots = slots.filter(s => s.status === 'ACTIVE' && s.packNumber);
        activeBoxes = activeSlots.length;
        activeCounterPacks = activeBoxes;
        ticketsSold = activeSlots.reduce((acc, s) => acc + (s.ticketsSold || 0), 0);
        sales = activeSlots.reduce((acc, s) => acc + ((s.ticketsSold || 0) * (s.price || 0)), 0);
        onlineSales = Number(raw.onlineSales || 0);
        cashes = Number(raw.cashes || 0);
        netBalance = sales + onlineSales - cashes;

        activeSlots.forEach(s => {
          const val = (Number(s.price) || 1) * (Number(s.packSize) || 100);
          activeCounterValue += val;
          storePacks.push({
            packNumber: s.packNumber,
            gameName: s.gameName,
            price: s.price,
            packSize: s.packSize,
            boxNumber: s.boxNumber,
            location: 'COUNTER'
          });
        });

        // Safe Inventory
        const inStock = Array.isArray(raw.inStockInventory) ? raw.inStockInventory : [];
        safePacksCount = inStock.length;
        inStock.forEach(p => {
          const val = (Number(p.price) || 1) * (Number(p.packSize) || 100);
          safePacksValue += val;
          storePacks.push({
            packNumber: p.packNumber,
            gameName: p.gameName,
            price: p.price,
            packSize: p.packSize,
            location: 'SAFE'
          });
        });

        // Storage Inventory
        const inv = Array.isArray(raw.inventory) ? raw.inventory : [];
        storagePacksCount = inv.length;
        inv.forEach(p => {
          const val = Number(p.bookValue) || ((Number(p.price) || 1) * (Number(p.packSize) || 100));
          storagePacksValue += val;
          storePacks.push({
            packNumber: p.packNumber,
            gameName: p.gameName,
            price: p.price,
            packSize: p.packSize,
            location: 'STORAGE'
          });
        });

        // Shift History
        const shifts = Array.isArray(raw.shiftHistory) ? raw.shiftHistory : [];
        shifts.forEach(sh => {
          const shiftSold = Number(sh.totalTicketsSold ?? sh.ticketsSold ?? 0);
          const shiftRev = Number(sh.totalSalesRevenue ?? sh.salesRevenue ?? (shiftSold * 2));
          const shiftCash = Number(sh.cashes ?? 0);
          const shiftOverShort = Number(sh.drawerOverShort ?? 0);
          const shiftCounted = Number(sh.actualCashCounted ?? sh.countedCash ?? 0);

          shiftReportsList.push({
            storeId: store.storeId,
            storeName: store.storeName,
            shiftNumber: sh.shiftNumber || 1,
            date: sh.shiftDate || sh.date || 'Recent',
            cashier: sh.cashier || 'Cashier',
            ticketsSold: shiftSold,
            salesRevenue: shiftRev,
            cashes: shiftCash,
            drawerFloat: Number(sh.drawerFloat ?? 0),
            actualCashCounted: shiftCounted,
            drawerOverShort: shiftOverShort
          });

          if (shiftOverShort !== 0) {
            discrepanciesList.push({
              storeId: store.storeId,
              storeName: store.storeName,
              shiftNumber: sh.shiftNumber || 1,
              date: sh.shiftDate || sh.date || 'Recent',
              cashier: sh.cashier || 'Cashier',
              type: 'CASH_OVER_SHORT',
              varianceAmount: shiftOverShort,
              description: shiftOverShort > 0 ? `Drawer OVER by ${shiftOverShort.toFixed(2)}` : `Drawer SHORT by ${Math.abs(shiftOverShort).toFixed(2)}`,
              auditStatus: Math.abs(shiftOverShort) > 20 ? 'ATTENTION' : 'NOTED'
            });
          }
        });

        // Also check if current shift has unscanned boxes or issues
        const unscanned = activeSlots.filter(s => !s.scannedInEndShift && raw.shiftStatus === 'SCANNING_END_SHIFT');
        if (unscanned.length > 0) {
          discrepanciesList.push({
            storeId: store.storeId,
            storeName: store.storeName,
            shiftNumber: raw.shiftNumber || 1,
            date: 'Current Shift',
            cashier: raw.cashierName || 'Cashier',
            type: 'UNSCANNED_BOX',
            varianceAmount: 0,
            description: `${unscanned.length} active box(es) not yet verified in closing shift audit.`,
            auditStatus: 'PENDING_SCAN'
          });
        }
      } catch (_) {}
    }

    storesData.push({
      storeId: store.storeId,
      storeName: store.storeName,
      retailerNumber: store.retailerNumber,
      authorizationStatus: store.authorizationStatus,
      operationalStatus: store.operationalStatus || 'ACTIVE',
      activeBoxes,
      ticketsSold,
      salesRevenue: sales,
      onlineSales,
      cashes,
      netBalance
    });

    inventoryData.push({
      storeId: store.storeId,
      storeName: store.storeName,
      activeCounterPacks,
      activeCounterValue,
      safePacksCount,
      safePacksValue,
      storagePacksCount,
      storagePacksValue,
      totalPacks: activeCounterPacks + safePacksCount + storagePacksCount,
      totalInventoryValue: activeCounterValue + safePacksValue + storagePacksValue,
      packs: storePacks
    });
  });

  res.json({
    success: true,
    storesSummary: storesData,
    inventorySummary: inventoryData,
    shiftReports: shiftReportsList,
    discrepancies: discrepanciesList
  });
});

// 14l. Admin: Audit Logs
app.get('/api/admin/audit-logs', requireAdminRole, (req, res) => {
  const st = getAdminState();
  res.json({ success: true, auditLogs: st.auditLogs });
});

// ----------------------------------------------------------------------------
// 15. STORE-SIDE TICKET REQUEST & ALLOCATION APIS
// ----------------------------------------------------------------------------

// Store: Available catalog
app.get('/api/store/catalog', (req, res) => {
  const { storeId } = req.query;
  const st = getAdminState();
  const approvedIds = (st.approvedTickets || []).filter(a => a.storeId === storeId && a.status !== 'REVOKED').map(a => a.gameId);
  const requested = (st.ticketRequests || []).filter(r => r.storeId === storeId);

  const catalog = (st.catalog || []).map(g => {
    const isApproved = approvedIds.includes(g.gameId);
    const existingReq = requested.find(r => r.gameId === g.gameId);
    return {
      ...g,
      isApproved,
      requestStatus: isApproved ? 'APPROVED' : (existingReq ? existingReq.status : null),
      requestId: existingReq ? existingReq.id : null,
      adminReason: existingReq ? existingReq.adminDecisionReason : null
    };
  });

  res.json({ success: true, catalog });
});

// Store: Ticket requests
app.get('/api/store/requests', (req, res) => {
  const { storeId } = req.query;
  const st = getAdminState();
  const requests = (st.ticketRequests || []).filter(r => r.storeId === storeId);
  res.json({ success: true, requests });
});

app.post('/api/store/requests', async (req, res) => {
  const { storeId, storeName, gameId, requestedBy } = req.body || {};
  if (!storeId || !gameId) {
    return res.status(400).json({ success: false, message: 'Store ID and Game ID are required.' });
  }

  const st = getAdminState();
  const game = (st.catalog || []).find(g => g.gameId === gameId) || { gameName: 'Lottery Game', price: 1, packSize: 100 };
  
  // Prevent duplicate pending requests
  const pending = st.ticketRequests.find(r => r.storeId === storeId && r.gameId === gameId && r.status === 'PENDING');
  if (pending) {
    return res.status(400).json({ success: false, message: 'A request for this game is already pending administrator review.' });
  }

  const newRequest = {
    id: Date.now(),
    storeId,
    storeName: storeName || 'Store',
    gameId,
    gameName: game.gameName,
    price: game.price,
    packSize: game.packSize,
    requestedBy: requestedBy || 'owner',
    status: 'PENDING',
    adminDecisionReason: '',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date().toISOString()
  };

  st.ticketRequests.unshift(newRequest);

  if (isDbConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO store_ticket_requests (store_id, store_name, game_id, game_name, price, requested_by, status)
         VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
        [newRequest.storeId, newRequest.storeName, newRequest.gameId, newRequest.gameName, newRequest.price, newRequest.requestedBy]
      );
    } catch (dbErr) {
      console.warn('MySQL ticket request insert warning:', dbErr.message);
    }
  }

  saveAdminState(st);
  res.json({ success: true, request: newRequest, requestId: newRequest.id });
});

// Store: Approved ticket types
app.get('/api/store/approved-tickets', (req, res) => {
  const { storeId } = req.query;
  const st = getAdminState();
  const approvedIds = (st.approvedTickets || []).filter(a => a.storeId === storeId && a.status !== 'REVOKED').map(a => a.gameId);
  const approvedGames = (st.catalog || []).filter(g => approvedIds.includes(g.gameId));
  res.json({ success: true, approved: approvedGames, approvedTickets: approvedGames });
});

// Store: Physical stock allocations
app.get('/api/store/allocations', (req, res) => {
  const { storeId } = req.query;
  const st = getAdminState();
  const allocations = (st.allocations || []).filter(a => a.storeId === storeId);
  res.json({ success: true, allocations });
});

// Store: Receive allocated pack into store inventory
app.post('/api/store/receive-allocation', (req, res) => {
  const { allocationId, storeId, receivedBy } = req.body || {};
  const st = getAdminState();
  const alloc = st.allocations.find(a => (String(a.id) === String(allocationId) || String(a.packNumber) === String(allocationId)) && a.storeId === storeId);
  if (!alloc) {
    return res.status(404).json({ success: false, message: 'Allocation record not found for this store.' });
  }

  alloc.status = 'RECEIVED';
  alloc.receivedAt = new Date().toISOString();
  saveAdminState(st);
  res.json({ success: true, allocation: alloc, message: `Pack #${alloc.packNumber} received.` });
});

// SPA Route handler for /admin
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(path.join(distPath, 'index.html'))) {
    res.sendFile(path.join(distPath, 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

// Start listening and initialize DB
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 LottoTrack Backend API Server running at http://${HOST}:${PORT}`);
  initDatabase().catch(err => {
    console.warn('Database initialization warning on boot:', err.message);
  });
});

// Graceful shutdown handling for cloud containers (Railway SIGTERM)
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Gracefully shutting down LottoTrack API server...');
  server.close(async () => {
    if (pool) {
      try { await pool.end(); } catch (_) {}
    }
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down...');
  server.close(async () => {
    if (pool) {
      try { await pool.end(); } catch (_) {}
    }
    process.exit(0);
  });
});
