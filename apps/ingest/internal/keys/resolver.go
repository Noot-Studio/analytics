package keys

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

var ErrInvalidKey = errors.New("invalid api key")

// Resolver maps a publishable API key to a project id, caching results in Redis.
type Resolver struct {
	pg    *pgxpool.Pool
	cache *redis.Client
	ttl   time.Duration
}

func NewResolver(pg *pgxpool.Pool, cache *redis.Client) *Resolver {
	return &Resolver{pg: pg, cache: cache, ttl: 5 * time.Minute}
}

func (r *Resolver) Resolve(ctx context.Context, publishableKey string) (string, error) {
	if publishableKey == "" {
		return "", ErrInvalidKey
	}
	cacheKey := "ingest:apikey:" + publishableKey

	if projectID, err := r.cache.Get(ctx, cacheKey).Result(); err == nil {
		if projectID == "-" {
			return "", ErrInvalidKey
		}
		return projectID, nil
	}

	var projectID string
	err := r.pg.QueryRow(ctx,
		`SELECT "projectId" FROM api_key WHERE "publishableKey" = $1 AND "revokedAt" IS NULL`,
		publishableKey,
	).Scan(&projectID)
	if err != nil {
		// Negative-cache invalid keys briefly to absorb scraper traffic.
		_ = r.cache.Set(ctx, cacheKey, "-", 30*time.Second).Err()
		return "", ErrInvalidKey
	}

	_ = r.cache.Set(ctx, cacheKey, projectID, r.ttl).Err()
	return projectID, nil
}
