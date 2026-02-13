-- Emma RAG Documents - Vector search for intelligent context retrieval
--
-- This migration creates:
-- 1. pgvector extension for embeddings
-- 2. emma_documents table for storing metric/insight/product documents with embeddings
-- 3. search_emma_documents RPC for similarity search
-- 4. Helper functions for document management

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Emma documents table with embeddings
CREATE TABLE IF NOT EXISTS emma_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Document type and categorization
  doc_type TEXT NOT NULL CHECK (doc_type IN ('metric', 'insight', 'product', 'trend', 'goal', 'alert')),
  category TEXT CHECK (category IN ('sales', 'customers', 'inventory', 'seo', 'traffic', 'goals', 'general')),
  doc_id TEXT NOT NULL, -- Unique identifier within type (e.g., 'conversion_rate', 'product_123')

  -- Content
  content JSONB NOT NULL,
  text_content TEXT NOT NULL, -- The text that was embedded

  -- Embedding vector (1536 dimensions for text-embedding-3-small)
  embedding vector(1536),

  -- Metadata
  priority INT DEFAULT 0, -- Higher = more important, shown first in ties
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Unique constraint: one document per store/type/id combo
  CONSTRAINT emma_documents_unique UNIQUE(store_id, doc_type, doc_id)
);

-- Create HNSW index for fast similarity search
-- m=16, ef_construction=64 is a good balance for <10k documents
CREATE INDEX IF NOT EXISTS emma_documents_embedding_idx
ON emma_documents
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Index for filtering by store and type
CREATE INDEX IF NOT EXISTS emma_documents_store_type_idx
ON emma_documents(store_id, doc_type);

CREATE INDEX IF NOT EXISTS emma_documents_store_category_idx
ON emma_documents(store_id, category);

-- RPC: Search for relevant documents using vector similarity
CREATE OR REPLACE FUNCTION search_emma_documents(
  p_store_id UUID,
  p_query_embedding vector(1536),
  p_limit INT DEFAULT 10,
  p_categories TEXT[] DEFAULT NULL,
  p_doc_types TEXT[] DEFAULT NULL,
  p_min_similarity FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  doc_type TEXT,
  category TEXT,
  doc_id TEXT,
  content JSONB,
  text_content TEXT,
  priority INT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.doc_type,
    d.category,
    d.doc_id,
    d.content,
    d.text_content,
    d.priority,
    (1 - (d.embedding <=> p_query_embedding))::FLOAT as similarity
  FROM emma_documents d
  WHERE d.store_id = p_store_id
    AND d.embedding IS NOT NULL
    AND (p_categories IS NULL OR d.category = ANY(p_categories))
    AND (p_doc_types IS NULL OR d.doc_type = ANY(p_doc_types))
    AND (1 - (d.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY
    d.priority DESC,
    d.embedding <=> p_query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- RPC: Upsert a document with embedding
CREATE OR REPLACE FUNCTION upsert_emma_document(
  p_store_id UUID,
  p_doc_type TEXT,
  p_doc_id TEXT,
  p_category TEXT,
  p_content JSONB,
  p_text_content TEXT,
  p_embedding vector(1536),
  p_priority INT DEFAULT 0
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO emma_documents (
    store_id, doc_type, doc_id, category, content, text_content, embedding, priority, updated_at
  ) VALUES (
    p_store_id, p_doc_type, p_doc_id, p_category, p_content, p_text_content, p_embedding, p_priority, now()
  )
  ON CONFLICT (store_id, doc_type, doc_id)
  DO UPDATE SET
    category = EXCLUDED.category,
    content = EXCLUDED.content,
    text_content = EXCLUDED.text_content,
    embedding = EXCLUDED.embedding,
    priority = EXCLUDED.priority,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- RPC: Delete old documents (cleanup)
CREATE OR REPLACE FUNCTION cleanup_emma_documents(
  p_store_id UUID,
  p_older_than INTERVAL DEFAULT '7 days'
)
RETURNS INT AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM emma_documents
  WHERE store_id = p_store_id
    AND updated_at < now() - p_older_than;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- RPC: Get document stats for a store
CREATE OR REPLACE FUNCTION get_emma_document_stats(p_store_id UUID)
RETURNS TABLE (
  doc_type TEXT,
  category TEXT,
  count BIGINT,
  avg_priority FLOAT,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.doc_type,
    d.category,
    COUNT(*)::BIGINT,
    AVG(d.priority)::FLOAT,
    MAX(d.updated_at)
  FROM emma_documents d
  WHERE d.store_id = p_store_id
  GROUP BY d.doc_type, d.category
  ORDER BY d.doc_type, d.category;
END;
$$ LANGUAGE plpgsql STABLE;

-- Enable RLS
ALTER TABLE emma_documents ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only access their own store's documents
-- (For now, allow all authenticated users - adjust based on your auth model)
CREATE POLICY emma_documents_select ON emma_documents
  FOR SELECT USING (true);

CREATE POLICY emma_documents_insert ON emma_documents
  FOR INSERT WITH CHECK (true);

CREATE POLICY emma_documents_update ON emma_documents
  FOR UPDATE USING (true);

CREATE POLICY emma_documents_delete ON emma_documents
  FOR DELETE USING (true);

-- Comments
COMMENT ON TABLE emma_documents IS 'RAG documents for Emma AI assistant - stores metrics, insights, products with vector embeddings';
COMMENT ON COLUMN emma_documents.doc_type IS 'Type: metric, insight, product, trend, goal, alert';
COMMENT ON COLUMN emma_documents.category IS 'Category: sales, customers, inventory, seo, traffic, goals, general';
COMMENT ON COLUMN emma_documents.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN emma_documents.priority IS 'Higher priority documents shown first in similarity ties';
