-- ============================================================
-- AI Smart Expense + Income Tracker
-- PostgreSQL Schema v1.0
-- Compatible with Supabase
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search on merchants

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE transaction_type AS ENUM ('income', 'expense', 'transfer');
CREATE TYPE subscription_plan AS ENUM ('free', 'pro', 'business');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'trialing');
CREATE TYPE receipt_status AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE slip_status AS ENUM ('pending', 'verified', 'rejected');

-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  plan          subscription_plan NOT NULL DEFAULT 'free',
  currency      CHAR(3) NOT NULL DEFAULT 'THB',
  timezone      TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  locale        TEXT NOT NULL DEFAULT 'th-TH',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supabase Auth hook: auto-create user row on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- CATEGORIES
-- ============================================================

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  name_th     TEXT,                    -- Thai label (AI auto-fill)
  icon        TEXT NOT NULL DEFAULT '💰',
  color       TEXT NOT NULL DEFAULT '#6366f1',
  type        transaction_type NOT NULL DEFAULT 'expense',
  budget      NUMERIC(14, 2),          -- optional monthly budget cap
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- NULL user_id = system-wide default category
  CONSTRAINT category_name_unique UNIQUE NULLS NOT DISTINCT (user_id, name)
);

-- System default categories (shared across all users)
INSERT INTO categories (id, user_id, name, name_th, icon, color, type, is_default, sort_order) VALUES
  (uuid_generate_v4(), NULL, 'Food & Drink',    'อาหารและเครื่องดื่ม', '🍜', '#f97316', 'expense', TRUE, 1),
  (uuid_generate_v4(), NULL, 'Transport',       'การเดินทาง',          '🚗', '#3b82f6', 'expense', TRUE, 2),
  (uuid_generate_v4(), NULL, 'Shopping',        'ช้อปปิ้ง',            '🛍️', '#ec4899', 'expense', TRUE, 3),
  (uuid_generate_v4(), NULL, 'Entertainment',   'บันเทิง',             '🎮', '#8b5cf6', 'expense', TRUE, 4),
  (uuid_generate_v4(), NULL, 'Health',          'สุขภาพ',              '💊', '#10b981', 'expense', TRUE, 5),
  (uuid_generate_v4(), NULL, 'Bills',           'บิลและค่าใช้จ่าย',   '📄', '#6b7280', 'expense', TRUE, 6),
  (uuid_generate_v4(), NULL, 'Education',       'การศึกษา',            '📚', '#0ea5e9', 'expense', TRUE, 7),
  (uuid_generate_v4(), NULL, 'Salary',          'เงินเดือน',           '💵', '#22c55e', 'income',  TRUE, 10),
  (uuid_generate_v4(), NULL, 'Freelance',       'รายได้อิสระ',         '💻', '#84cc16', 'income',  TRUE, 11),
  (uuid_generate_v4(), NULL, 'Investment',      'การลงทุน',            '📈', '#eab308', 'income',  TRUE, 12),
  (uuid_generate_v4(), NULL, 'Other Income',    'รายได้อื่นๆ',         '🪙', '#a3e635', 'income',  TRUE, 13),
  (uuid_generate_v4(), NULL, 'Other Expense',   'รายจ่ายอื่นๆ',        '📦', '#9ca3af', 'expense', TRUE, 99);

-- ============================================================
-- WALLETS / ACCOUNTS
-- ============================================================

CREATE TABLE wallets (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'bank',   -- bank | cash | credit | e-wallet
  bank_name   TEXT,
  balance     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#6366f1',
  icon        TEXT NOT NULL DEFAULT '🏦',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS (core table)
-- ============================================================

CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id       UUID REFERENCES wallets(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,

  type            transaction_type NOT NULL,
  amount          NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  currency        CHAR(3) NOT NULL DEFAULT 'THB',
  note            TEXT,
  merchant        TEXT,                        -- shop name (from OCR or manual)
  location        TEXT,

  -- AI-generated fields
  ai_category_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
  ai_confidence        NUMERIC(4, 3),          -- 0.000 – 1.000
  ai_merchant_normalized TEXT,                 -- cleaned shop name
  ai_tags              TEXT[],                 -- e.g. ['coffee','morning-routine']

  -- Transfer fields (only when type = 'transfer')
  transfer_to_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,

  transacted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_txn_user_date    ON transactions (user_id, transacted_at DESC);
CREATE INDEX idx_txn_user_cat     ON transactions (user_id, category_id);
CREATE INDEX idx_txn_user_type    ON transactions (user_id, type);
CREATE INDEX idx_txn_merchant     ON transactions USING gin (merchant gin_trgm_ops);

-- ============================================================
-- RECEIPTS / SLIP OCR
-- ============================================================

CREATE TABLE receipts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  image_url       TEXT NOT NULL,               -- Supabase Storage path
  status          receipt_status NOT NULL DEFAULT 'pending',

  -- Raw OCR output
  ocr_raw_text    TEXT,
  -- Parsed fields from AI
  ocr_amount      NUMERIC(14, 2),
  ocr_merchant    TEXT,
  ocr_date        DATE,
  ocr_items       JSONB,                       -- line items if available
  ocr_confidence  NUMERIC(4, 3),

  error_message   TEXT,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- BUDGETS
-- ============================================================

CREATE TABLE budgets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id   UUID REFERENCES categories(id) ON DELETE CASCADE,
  amount        NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  period        TEXT NOT NULL DEFAULT 'monthly', -- monthly | weekly | yearly
  start_date    DATE NOT NULL,
  end_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT budget_unique UNIQUE (user_id, category_id, period, start_date)
);

-- ============================================================
-- SUBSCRIPTIONS & PAYMENTS
-- ============================================================

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan            subscription_plan NOT NULL,
  status          subscription_status NOT NULL DEFAULT 'trialing',
  current_period_start  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end    TIMESTAMPTZ NOT NULL,
  cancelled_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_slips (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  image_url       TEXT NOT NULL,
  amount          NUMERIC(10, 2),
  status          slip_status NOT NULL DEFAULT 'pending',
  verified_at     TIMESTAMPTZ,
  admin_note      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AI CHAT HISTORY
-- ============================================================

CREATE TABLE ai_conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_messages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL,
  -- Attached context snapshot (e.g. monthly summary used for this reply)
  context_snapshot JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,           -- budget_alert | insight | receipt_done | payment_verified
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_unread ON notifications (user_id, is_read, created_at DESC);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_txn_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (Supabase RLS)
-- ============================================================

ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_slips     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications     ENABLE ROW LEVEL SECURITY;

-- Users: see/edit only own row
CREATE POLICY "users: own row" ON users
  FOR ALL USING (auth.uid() = id);

-- Categories: own + system defaults (user_id IS NULL)
CREATE POLICY "categories: own + defaults" ON categories
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "categories: insert own" ON categories
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "categories: update own" ON categories
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "categories: delete own" ON categories
  FOR DELETE USING (user_id = auth.uid());

-- Generic "own row" policies for remaining tables
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'wallets','transactions','receipts','budgets',
    'subscriptions','payment_slips','ai_conversations','notifications'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "%s: own" ON %I FOR ALL USING (user_id = auth.uid())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ai_messages: access via parent conversation ownership
CREATE POLICY "ai_messages: own via conversation" ON ai_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- ============================================================
-- REALTIME (Supabase)
-- ============================================================

-- Enable realtime for tables that need live sync across devices
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE receipts;

-- ============================================================
-- VIEWS (for dashboard queries)
-- ============================================================

-- Monthly summary per category
CREATE OR REPLACE VIEW v_monthly_category_totals AS
SELECT
  t.user_id,
  DATE_TRUNC('month', t.transacted_at) AS month,
  COALESCE(t.category_id, t.ai_category_id) AS category_id,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color,
  t.type,
  SUM(t.amount) AS total,
  COUNT(*) AS tx_count
FROM transactions t
LEFT JOIN categories c ON c.id = COALESCE(t.category_id, t.ai_category_id)
GROUP BY 1, 2, 3, 4, 5, 6, 7;

-- Daily spending (last 90 days) per user
CREATE OR REPLACE VIEW v_daily_spending AS
SELECT
  user_id,
  transacted_at::DATE AS day,
  type,
  SUM(amount) AS total,
  COUNT(*) AS tx_count
FROM transactions
WHERE transacted_at >= NOW() - INTERVAL '90 days'
GROUP BY 1, 2, 3;

-- ============================================================
-- STORAGE BUCKETS (run in Supabase dashboard or via API)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars',  'avatars',  true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('slips',    'slips',    false);
