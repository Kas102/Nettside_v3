const path = require('path');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));

// session slik at du kan logge inn og holde deg innlogget imens du navigerer rundt
app.use(session({
  secret: 'superhemmelig123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// gjør session tilgjengelig i EJS
app.use((req, res, next) => {
  res.locals.user = req.session;
  next();
});

// Database sqlite
const db = new sqlite3.Database(path.join(__dirname, 'naprapat.db'));

db.serialize(() => {

  db.run(`
    CREATE TABLE IF NOT EXISTS Bruker (
      bruker_id INTEGER PRIMARY KEY AUTOINCREMENT,
      navn TEXT NOT NULL,
      passord_hash TEXT NOT NULL,
      laget_dato TEXT NOT NULL,
      rolle TEXT NOT NULL,
      telefonnummer TEXT NOT NULL,
      email TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Time (
      time_id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_tid TEXT NOT NULL,
      slutt_tid TEXT NOT NULL,
      dato TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ledig',
      bruker_id INTEGER,
      kommentar TEXT,
      FOREIGN KEY (bruker_id) REFERENCES Bruker(bruker_id),
      UNIQUE(dato, start_tid)
    )
  `);

});
// Promise helper
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

// AUTH MIDDLEWARE
function isLoggedIn(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.rolle === 'admin') {
    return next();
  }
  res.send("Ingen tilgang");
}

// REGISTER
app.post('/register', async (req, res) => {
  const { navn, password, telefonnummer, email } = req.body;

  const hash = await bcrypt.hash(password, 10);

  db.run(`
    INSERT INTO Bruker (navn, passord_hash, laget_dato, rolle, telefonnummer, email)
    VALUES (?, ?, datetime('now'), 'user', ?, ?)
  `, [navn, hash, telefonnummer, email], (err) => {
    if (err) return res.send("Feil ved registrering");
    res.redirect('/login');
  });
});

// LOGIN
app.post('/login', (req, res) => {
  const { navn, password } = req.body;

  db.get(`SELECT * FROM Bruker WHERE navn = ?`, [navn], async (err, user) => {
    if (!user) return res.send("Bruker finnes ikke");

    const match = await bcrypt.compare(password, user.passord_hash);

    if (match) {
      req.session.userId = user.bruker_id;
      req.session.navn = user.navn;
      req.session.telefonnummer = user.telefonnummer;
      req.session.email = user.email;
      req.session.rolle = user.rolle;

      req.session.save(() => res.redirect('/'));
    } else {
      res.send("Feil passord");
    }
  });
});
app.post('/admin-avlys', isLoggedIn, isAdmin, (req, res) => {
  const { time_id } = req.body;

  console.log("ADMIN AVLYSER TIME:", time_id);

  db.run(`
    UPDATE Time
    SET status = 'ledig',
        bruker_id = NULL,
        kommentar = NULL
    WHERE time_id = ?
  `, [time_id], function(err) {

    if (err) {
      console.error("FEIL:", err);
      return res.send("Feil ved avlysning");
    }

    console.log("RADER ENDRET:", this.changes);

    res.redirect('/admin-timer');
  });
});
// LOGOUT
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});
// SLETT BRUKER
app.post('/slett-bruker', isLoggedIn, async (req, res) => {
  const bruker_id = req.session.userId;

  try {
    // 1. Sjekk om brukeren har noen timer
    const timer = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM Time WHERE bruker_id = ?`,
        [bruker_id],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });

    // 2. Hvis brukeren har timer → IKKE lov å slette
    if (timer.length > 0) {
      return res.send("Du kan ikke slette brukeren din før alle timer er avlyst");
    }

    // 3. Slett bruker
    await dbRun(`DELETE FROM Bruker WHERE bruker_id = ?`, [bruker_id]);

    // 4. Logg ut
    req.session.destroy(() => {
      res.redirect('/');
    });

  } catch (err) {
    console.error(err);
    res.send("Feil ved sletting av bruker");
  }
});
// VIS INDEX + TIMER
app.get('/', (req, res) => {
  const sql = `
  SELECT time_id, start_tid, slutt_tid, dato
  FROM Time
  ORDER BY dato, start_tid
`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Feil i / ruten:", err);
      return res.status(500).send("Serverfeil: Se terminalen for detaljer");
    }

    res.render('index', {
      timer: rows,
      message: null
    });
  });
});

app.get('/admin-timer', isLoggedIn, isAdmin, (req, res) => {

  const sql = `
    SELECT Time.*, Bruker.navn
    FROM Time
    LEFT JOIN Bruker ON Time.bruker_id = Bruker.bruker_id
    WHERE status = 'booket'
    ORDER BY dato, start_tid
  `;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.send("Feil ved henting av timer");
    }

    res.render('admin-timer', {
      timer: rows
    });
  });

});

// mine timer
app.get('/timer', isLoggedIn, (req, res) => {
  const bruker_id = req.session.userId;

  const sql = `
  SELECT time_id, dato, start_tid, slutt_tid, status, kommentar
  FROM Time
  WHERE bruker_id = ?
  ORDER BY dato, start_tid
`;

  db.all(sql, [bruker_id], (err, rows) => {
    if (err) {
      console.error(err);
      return res.send("Feil ved henting av timer");
    }

    res.render('timer', {
      timer: rows
    });
  });
});
app.post('/bestill-time', isLoggedIn, async (req, res) => {
  try {
    const { bestillingsdato, bestillingstid, kommentar } = req.body;
    const bruker_id = req.session.userId;

    // 1. hvis vi har en ombooking
    if (req.session.ombook_time_id) {
      const gammelTimeId = req.session.ombook_time_id;

      // frigjør gammel time
      await dbRun(`
        UPDATE Time
        SET status = 'ledig',
            bruker_id = NULL,
            kommentar = NULL
        WHERE time_id = ?
      `, [gammelTimeId]);

      req.session.ombook_time_id = null;
    }

    // 2. finn ny ledig time
    const time = await new Promise((resolve, reject) => {
      db.get(
        `SELECT * FROM Time WHERE dato = ? AND start_tid = ? AND status = 'ledig'`,
        [bestillingsdato, bestillingstid],
        (err, row) => {
          if (err) return reject(err);
          resolve(row);
        }
      );
    });

    if (!time) {
      return res.send("Timen er ikke ledig");
    }

    // 3. book ny
    await dbRun(`
      UPDATE Time
      SET status = 'booket',
          bruker_id = ?,
          kommentar = ?
      WHERE time_id = ?
    `, [bruker_id, kommentar, time.time_id]);

    res.redirect('/timer');

  } catch (err) {
    console.log(err);
    res.send("Feil ved bestilling");
  }
});
function formatDato(dato) {
  const year = dato.getFullYear();
  const month = String(dato.getMonth() + 1).padStart(2, '0');
  const day = String(dato.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Lager timer for én dag
function lagTimerForDag(dato, start, slutt, intervallMinutter) {
  let current = new Date(`${dato}T${start}`);
  let end = new Date(`${dato}T${slutt}`);

  while (current < end) {
    let neste = new Date(current.getTime() + intervallMinutter * 60000);

    const startTid = current.toTimeString().slice(0, 5);
    const sluttTid = neste.toTimeString().slice(0, 5);

    db.run(`
      INSERT OR IGNORE INTO Time (start_tid, slutt_tid, dato)
      VALUES (?, ?, ?)
    `, [startTid, sluttTid, dato]);

    current = neste;
  }
}

// Lager timer én måned frem fra i dag
function lagTimerEnMaanedFrem() {
  let idag = new Date();
  let sluttDato = new Date();
  sluttDato.setMonth(sluttDato.getMonth() + 1);

  let current = new Date(idag);

  while (current < sluttDato) {
    let dag = current.getDay();

    // Hopper over helg (0 = søndag, 6 = lørdag)
    if (dag !== 0 && dag !== 6) {
      let datoStr = formatDato(current);

      // 09:00 til 16:00
      lagTimerForDag(datoStr, '09:00', '16:00', 60);
    }

    current.setDate(current.getDate() + 1);
  }
}

app.post('/avlys-time', isLoggedIn, (req, res) => {
  const { dato, tid } = req.body;

  db.run(`
    UPDATE Time
    SET status = 'ledig',
        bruker_id = NULL,
        kommentar = NULL
    WHERE dato = ? AND start_tid = ?
  `, [dato, tid], (err) => {
    if (err) return res.send("Feil ved avlysning");
    res.redirect('/timer');
  });
});
// ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.get('/api/timebestillinger', (req, res) => {
  const { start, end } = req.query;

  const sql = `
    SELECT dato, start_tid 
    FROM Time
    WHERE dato BETWEEN ? AND ?
    AND status = 'booket'
  `;

  db.all(sql, [start, end], (err, rows) => {
    if (err) {
      console.error("DB feil:", err);
      return res.status(500).json({ error: "Databasefeil" });
    }

    res.json(rows); // sender json til frontend
  });
});
app.post('/ombook-time', isLoggedIn, (req, res) => {
  const { time_id } = req.body;

  // lagrer hvilken time som skal ombookes
  req.session.ombook_time_id = time_id;

  // sender bruker til bestillingsside
  res.redirect('/bestilling');
});
// statisk
app.use(express.static(path.join(__dirname, 'public')));

// SIDER
app.get('/profil',(req, res) => res.render('profil'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));
app.get('/index', (req, res) => res.render('index'));
app.get('/bestilling', (req, res) => {
  res.render('bestilling', {
    ombook: req.session.ombook_time_id || null
  });
});
//kjører funksjon
lagTimerEnMaanedFrem();
// START
app.listen(PORT, () => {
  console.log(`Server kjører på http://localhost:${PORT}`);
});
