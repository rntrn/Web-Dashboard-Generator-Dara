[🇮🇩 Bahasa Indonesia](README.md)&nbsp;·&nbsp;🇬🇧 English

# DARA Free — Web Dashboard Generator

**Build dashboards straight from your MySQL database.** DARA reads your table
schema, automatically suggests fitting charts, offers a Tableau/Power BI-style
manual chart builder, then lets you arrange everything into a dashboard you
can share or embed in other applications.

This is the **free, open** edition of DARA: MySQL as the database, local
authentication, no Oracle or LDAP dependency.

```
Data Connection  →  Explore Data  →  Chart Builder  →  Dashboard  →  Story  →  Share / Embed
(connect to an      (auto chart      (pick dimension   (12-column    (step-by-step  (key-protected
 external DB,        suggestions)     & measure)        grid)         presentation)  public viewer)
 admin-only)
```

*Data Connection* and *Data Preparation* are admin-only — see
[`docs/08-data-connection.md`](docs/08-data-connection.md) for the
architecture and phase status.

> **Note:** this English README is a translation of the project overview.
> The deeper technical docs it links to (`INSTALL.md`, `USAGE.md`, etc.)
> are currently **Indonesian-only**. Code comments and error messages
> throughout the project are also in Indonesian.

---

## Table of contents

- [Who this document is for](#who-this-document-is-for)
- [Quick install](#quick-install)
- [Running it](#running-it)
- [Connecting external databases (Data Connection)](#connecting-external-databases-data-connection)
- [Documentation map](#documentation-map)
- [Project structure](#project-structure)
- [System requirements](#system-requirements)
- [Frequently used commands](#frequently-used-commands)
- [License](#license)
- [Support Me](#-support-me)

---

## Who this document is for

Docs in this repository are written in layers — from the most practical to
the most in-depth. You don't need to read everything at once:

| If you want to… | Read (Indonesian) |
|---|---|
| install and run it | `INSTALL.md` |
| use the app | `USAGE.md` |
| know what's in each database table | `db/README.md` |

---

## Quick install

Prerequisites: **Node.js 18+** and a running **MySQL 8.0+** (or MariaDB 10.5+).

**Windows**

```bat
git clone https://github.com/rntrn/Web-Dashboard-Generator-Dara.git
cd Web-Dashboard-Generator-Dara
install.bat
```

**Linux / macOS**

```bash
git clone https://github.com/rntrn/Web-Dashboard-Generator-Dara.git
cd Web-Dashboard-Generator-Dara
chmod +x install.sh start.sh
./install.sh
```

The installer will ask for your MySQL credentials, create the database,
create all tables, load sample data, and write the `.env` file. Details in
[`INSTALL.md`](INSTALL.md) (Indonesian).

---

## Running it

**Development mode** (two processes, hot reload):

```bash
./start.sh            # Windows: start.bat
# frontend   http://localhost:5173
# backend    http://localhost:3001
```

**Production mode** (single process, single port):

```bash
./start.sh prod       # Windows: start.bat prod
# everything at http://localhost:3001
```

First login: **admin / admin123** — change it right away with
`npm run create-admin`.

---

## Connecting external databases (Data Connection)

MySQL is still required for DARA's own metadata. *Data Connection* is an
additional admin-only menu for connecting to **other** databases, then
importing chosen tables/collections as new tables in DARA's own database
— once imported, they're immediately usable in Explore Data/Chart Builder
like any other table. See [`docs/08-data-connection.md`](docs/08-data-connection.md)
(Indonesian) for the full architecture and limitations (why not live
cross-database queries, the 100,000-row-per-import cap, etc.).

**16 databases already have working driver adapters**: PostgreSQL,
MySQL/MariaDB, SQL Server, Oracle, external SQLite, MongoDB, Redis,
Cassandra, ClickHouse, CockroachDB, Neo4j, Firestore, Snowflake, DynamoDB,
Pinecone, Milvus.

To keep the base install lightweight, only 4 are installed by default —
the rest are installed on demand:

| | Driver |
|---|---|
| **Installed by default** | `mysql`, `postgres`, `cockroachdb`, `sqlite_ext` |
| **Needs manual install** (12) | mssql, oracle, clickhouse, snowflake, mongodb, cassandra, neo4j, redis, dynamodb, firestore, pinecone, milvus |

```bash
cd server
npm run driver:install -- --list         # list all drivers + status
npm run driver:install -- mssql mongodb  # install one or more drivers
```

You can also install them during initial setup — the installer offers
this as an optional step 3 (requires internet, skippable, off by
default). If a driver is selected in the UI but its package isn't
installed yet, the "Test" button fails with a clear message stating the
exact install command — it doesn't crash.

### Shaping data before it hits a chart (Data Preparation)

Once a table exists in DARA (upload, Data Connection import, or a sample
table), the **Data Preparation** menu (admin) lets you combine and clean
it up without writing SQL: pick a source table → pick/rename/retype
columns → optionally join it with one other table (relation suggestions
are automatic) → live preview → save as a new table. The resulting table
can be shared with regular users, same as upload/import tables. Full
details in [`docs/08-data-connection.md`](docs/08-data-connection.md)
(Indonesian).

---

## Documentation map

```
README.md / README.en.md   ← You are here: overview
INSTALL.md             install steps (automatic & manual) + troubleshooting
USAGE.md                how to use the app, from data exploration to embed
db/README.md             data dictionary: every table and column
```

---

## Project structure

```
dara-free/
├── installer/          Install CLI (plain Node, no dependencies)
│   ├── index.js        main 8-step flow
│   └── lib/             ui, prerequisites, env, db
├── db/                  Everything database-related
│   ├── schema/          DDL: 001_core.sql, 002_sample_tables.sql
│   ├── seed/             initial data: 003_seed_core.sql, 004_seed_sample.sql
│   ├── tools/             sample data generator
│   └── README.md         data dictionary
├── server/              Express backend (ESM)
│   ├── src/
│   │   ├── config/       database.js, metaStore.js, appConfig.js
│   │   ├── lib/           dialect.js, aggExpr.js, filterSql.js, acl.js, ...
│   │   ├── middlewares/  auth, security, rate limit, static
│   │   ├── modules/       one folder per domain (charts, dashboards, ...)
│   │   └── server.js     entry point
│   └── scripts/          migrate, create-admin, backup, drop-database
├── client/              React + Vite + Tailwind frontend
│   └── src/
├── install.bat/.sh       installer wrapper
├── start.bat/.sh         runs the app
└── uninstall.bat/.sh     removes the database + install folders (backup mandatory first)
```

One backend module = one folder containing `*.routes.js` (URLs),
`*.controller.js` (reads the request), `*.service.js` (business rules),
`*.repository.js` (data access). This split is consistent across every
module.

---

## System requirements

| Component | Minimum | Notes |
|---|---|---|
| Node.js | 18 | 20 LTS recommended |
| MySQL | 8.0 | MariaDB 10.5+ also works |
| RAM | 512 MB | for the server |
| Browser | recent Chrome/Edge/Firefox | |

No-MySQL alternative: set `DB_TYPE=sqlite` and `META_STORE=file` in
`server/.env` to try DARA with local files. Statistical aggregations
(MEDIAN/P90/P95) are actually only available in this mode.

---

## Frequently used commands

All run from the project's root folder.

| Command | Purpose |
|---|---|
| `npm run setup` | run the installer |
| `npm run db:migrate` | apply pending migrations |
| `npm run db:seed` | migrate + load sample data |
| `npm run db:reset` | drop all `dara_*` tables and rebuild |
| `npm run db:status` | see which migrations have/haven't run |
| `npm run create-admin` | change the admin username & password |
| `npm run backup` | back up DARA **metadata** as a .zip |
| `npm run build` | build the UI for production |
| `npm run uninstall` | remove the database + install folders (full backup mandatory first, see [`INSTALL.md`](INSTALL.md#uninstall)) |

### Backup

Data (`mysqldump`) and `.env` never go into git (see `.gitignore`) — so
commit/push alone isn't enough to protect either of them. Back up metadata
with `npm run backup`, dump data with `mysqldump`, and copy `.env`
manually before any major change.

> **PowerShell:** the `.\` prefix is required to run `.bat` files/scripts
> from the current folder (e.g. `.\install.bat`) — without it PowerShell
> rejects the command with *"is not recognized as the name of a cmdlet"*.
> Command Prompt (`cmd.exe`) doesn't need that prefix.

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## ☕ Support Me
If you find this project useful, you can support me on Ko-fi:
[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/laqoushop)
