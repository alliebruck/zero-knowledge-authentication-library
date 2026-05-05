import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'bearwatch.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            pub_key TEXT UNIQUE NOT NULL,
            name TEXT,
            balance REAL DEFAULT 10000.00,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS portfolio (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ticker TEXT NOT NULL,
            shares REAL NOT NULL DEFAULT 0,
            avg_price REAL NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, ticker)
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            ticker TEXT NOT NULL,
            action TEXT NOT NULL,
            shares REAL NOT NULL,
            price REAL NOT NULL,
            total REAL NOT NULL,
            ai_model TEXT,
            ai_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    ''')
    existing_trade_columns = {
        row['name'] for row in conn.execute('PRAGMA table_info(trades)').fetchall()
    }
    if 'ai_model' not in existing_trade_columns:
        conn.execute('ALTER TABLE trades ADD COLUMN ai_model TEXT')
    if 'ai_reason' not in existing_trade_columns:
        conn.execute('ALTER TABLE trades ADD COLUMN ai_reason TEXT')
    conn.commit()
    conn.close()
