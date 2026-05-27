package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	Addr         string
	DatabaseURL  string
	RedisURL     string
	KafkaBrokers []string
	KafkaTopic   string
}

func FromEnv() (Config, error) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	brokers := os.Getenv("KAFKA_BROKERS")
	if brokers == "" {
		brokers = "localhost:19092"
	}

	return Config{
		Addr:         valueOr("INGEST_ADDR", ":8080"),
		DatabaseURL:  databaseURL,
		RedisURL:     valueOr("REDIS_URL", "redis://localhost:6379"),
		KafkaBrokers: strings.Split(brokers, ","),
		KafkaTopic:   valueOr("KAFKA_EVENTS_TOPIC", "events"),
	}, nil
}

func valueOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
