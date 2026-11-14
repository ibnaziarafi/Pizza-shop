CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  accepting INTEGER NOT NULL DEFAULT 1,
  eta INTEGER NOT NULL DEFAULT 20
);
--> statement-breakpoint

INSERT OR IGNORE INTO settings (id, accepting, eta) VALUES (1, 1, 20);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS menu_availability (
  item_id TEXT PRIMARY KEY,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1))
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('new', 'preparing', 'ready', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  tax INTEGER NOT NULL,
  total INTEGER NOT NULL,
  eta INTEGER NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
