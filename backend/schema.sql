CREATE EXTENSION IF NOT EXISTS vector;

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- USER PREFERENCES
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  interest TEXT,
  language TEXT,
  genre TEXT,
  selected_titles TEXT[],
  selected_actors TEXT[],
  favorite_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CONTENT
CREATE TABLE IF NOT EXISTS content (
  content_id TEXT PRIMARY KEY,
  external_source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  description TEXT,
  poster_url TEXT,
  release_date DATE,
  language TEXT,
  genres TEXT[],
  rating DOUBLE PRECISION,
  popularity_score DOUBLE PRECISION,
  embedding vector(384),
  embedding_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_source, external_id)
);

-- USER INTERACTIONS
CREATE TABLE IF NOT EXISTS user_interactions (
  interaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL REFERENCES content(content_id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,
  rating_value INT CHECK (rating_value BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DAILY RECOMMENDATIONS
CREATE TABLE IF NOT EXISTS daily_recommendations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rec_date DATE NOT NULL,
  content_id TEXT NOT NULL REFERENCES content(content_id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(user_id, rec_date)
);

-- Vector index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_content_embedding_hnsw
  ON content USING hnsw (embedding vector_cosine_ops);
