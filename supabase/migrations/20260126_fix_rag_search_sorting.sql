-- Fix RAG search sorting - prioritize similarity over priority
--
-- Previous version sorted by priority DESC first, which caused
-- high-priority but irrelevant documents to appear before
-- lower-priority but highly relevant ones.
--
-- New version: Sort by similarity first, use priority only as tie-breaker

-- Drop and recreate the function
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
    -- Primary: Sort by cosine distance (lower = more similar)
    d.embedding <=> p_query_embedding,
    -- Secondary: Higher priority wins in ties
    d.priority DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION search_emma_documents IS 'Search Emma documents using vector similarity. Returns most similar documents first.';
