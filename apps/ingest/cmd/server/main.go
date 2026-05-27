package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/redis/go-redis/v9"

	"github.com/sbox-analytics/ingest/internal/config"
	"github.com/sbox-analytics/ingest/internal/handler"
	"github.com/sbox-analytics/ingest/internal/keys"
	"github.com/sbox-analytics/ingest/internal/producer"
)

func main() {
	_ = godotenv.Load()
	cfg, err := config.FromEnv()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()

	pg, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("postgres: %v", err)
	}
	defer pg.Close()

	redisOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("redis url: %v", err)
	}
	cache := redis.NewClient(redisOpts)
	defer cache.Close()

	prod, err := producer.New(cfg.KafkaBrokers, cfg.KafkaTopic)
	if err != nil {
		log.Fatalf("kafka: %v", err)
	}
	defer prod.Close()

	resolver := keys.NewResolver(pg, cache)
	events := &handler.EventsHandler{Keys: resolver, Producer: prod}

	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Recover())
	e.Use(middleware.RequestID())
	e.Use(middleware.BodyLimit("2M"))
	e.Use(middleware.RateLimiter(middleware.NewRateLimiterMemoryStore(200)))

	e.GET("/healthz", func(c echo.Context) error { return c.String(200, "ok") })
	e.POST("/v1/events", events.Handle)

	go func() {
		if err := e.Start(cfg.Addr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
