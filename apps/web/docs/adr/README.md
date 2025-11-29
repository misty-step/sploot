# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records for Sploot, a Vercel-first meme library with text→image semantic search. ADRs document important architectural decisions that will have long-term impact on the system.

## ADR Index

| ADR | Title | Status | Decision Summary |
|-----|-------|--------|------------------|
| [001](./001-embedding-service-architecture.md) | Embedding Service Architecture | Proposed | Use Replicate API with SigLIP-Large-384 for both text and image embeddings |
| [002](./002-vector-storage-strategy.md) | Vector Storage Strategy | Proposed | Use Vercel Postgres with pgvector HNSW indexes for similarity search |
| [003](./003-upload-processing-pipeline.md) | Upload Processing Pipeline | Proposed | Hybrid sync-async pipeline with optimistic UI updates |
| [004](./004-caching-architecture.md) | Caching Architecture | Proposed | Multi-layer caching: client, edge, Redis, and database levels |
| [005](./005-pwa-implementation-strategy.md) | PWA Implementation Strategy | Proposed | Network-first PWA with intelligent caching and background sync |

## Decision Process

### ADR Lifecycle
1. **Proposed** - Initial decision documented, under review
2. **Accepted** - Decision approved and implementation begun
3. **Superseded** - Replaced by newer ADR, kept for historical reference
4. **Deprecated** - No longer recommended, migration path documented

### Decision Criteria

All architectural decisions are evaluated against Sploot's core requirements:

**Performance Targets:**
- Upload processing: <2.5s p95
- Search latency: <500ms p95
- PWA startup: <1.5s to interactive

**Scale Requirements:**
- Support 100K+ images per user
- Single-user private library initially
- Cost-effective for personal use (<$50/month operational costs)

**Technology Constraints:**
- Vercel-first architecture (serverless)
- Next.js App Router compatibility
- External embedding service (no self-hosted GPU)
- PostgreSQL + pgvector for vector storage

## Key Architectural Principles

### 1. Vercel-First Design
All decisions prioritize Vercel platform capabilities and constraints:
- Serverless function limitations (timeout, memory, cold starts)
- Edge network optimization
- Integrated services (Blob, Postgres, KV)

### 2. Cost Optimization
Personal-use application requires aggressive cost management:
- Minimize external API calls through caching
- Leverage included Vercel service quotas
- Optimize for typical usage patterns (moderate upload/search frequency)

### 3. Progressive Enhancement
Build core functionality first, enhance with advanced features:
- Basic upload/search before advanced PWA features
- Simple caching before multi-layer optimization
- Single embedding model before multi-model support

### 4. Operational Simplicity
Minimize operational overhead for single-developer maintenance:
- Managed services over self-hosted infrastructure
- Automatic scaling over manual capacity planning
- Built-in monitoring over custom observability systems

## Cross-Cutting Concerns

### Security
- All data private to authenticated user (Clerk-based auth)
- No public sharing or multi-tenant features in v1
- Input validation and sanitization for all user content
- Secure API key management via environment variables

### Monitoring
- Performance metrics for all SLO targets
- Error tracking for all external service integrations
- Cost monitoring for all paid services
- User experience metrics (search relevance, upload success rates)

### Scalability
- Horizontal scaling within Vercel serverless limits
- Database scaling via read replicas if needed
- Migration paths to dedicated vector databases at higher scale
- Caching strategies that grow with usage

### Reliability
- Retry mechanisms for all external API calls
- Graceful degradation for offline/slow network conditions
- Data consistency through atomic database operations
- Background job processing for non-critical operations

## Implementation Priorities

### Phase 1: Core Architecture (M0-M2)
- [ADR-001](./001-embedding-service-architecture.md): Embedding service integration
- [ADR-002](./002-vector-storage-strategy.md): Basic pgvector setup
- [ADR-003](./003-upload-processing-pipeline.md): Upload flow implementation

### Phase 2: Performance Optimization (M3)
- [ADR-004](./004-caching-architecture.md): Multi-layer caching implementation
- [ADR-005](./005-pwa-implementation-strategy.md): PWA shell and service worker

### Phase 3: Advanced Features (M4+)
- Background sync and offline functionality
- Advanced caching strategies and cache warming
- Performance monitoring and optimization
- Migration planning for future scale

## Review and Updates

### Regular Review Schedule
- **Monthly:** Review performance metrics against ADR success criteria
- **Quarterly:** Evaluate new technology options and potential architecture improvements
- **Annually:** Comprehensive architecture review and ADR lifecycle management

### Update Process
1. Identify need for architectural change
2. Create new ADR or update existing ADR
3. Review against core requirements and constraints
4. Document implementation plan and migration strategy
5. Update ADR status after implementation and validation

### Decision Reversal
If an ADR decision proves problematic:
1. Document the issues and lessons learned
2. Create new ADR with alternative approach
3. Mark original ADR as "Superseded"
4. Implement migration plan to new architecture

## References

- [Sploot PRD](../../TASK.md) - Product requirements and success criteria
- [Sploot Aesthetics](../../AESTHETIC.md) - Design system and user experience guidelines
- [Architecture Decision Records Template](https://github.com/joelparkerhenderson/architecture-decision-record)
- [Vercel Documentation](https://vercel.com/docs) - Platform capabilities and constraints