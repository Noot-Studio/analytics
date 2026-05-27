package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/sbox-analytics/ingest/internal/keys"
	"github.com/sbox-analytics/ingest/internal/producer"
)

const (
	maxBatchSize       = 500
	apiKeyHeader       = "X-Api-Key"
	maxPropertiesBytes = 16 * 1024
)

type incomingEvent struct {
	Type       string          `json:"type"`
	Timestamp  time.Time       `json:"timestamp"`
	SessionID  string          `json:"session_id"`
	PlayerID   string          `json:"player_id"`
	Properties json.RawMessage `json:"properties"`
}

type incomingBatch struct {
	Events []incomingEvent `json:"events"`
}

type EventsHandler struct {
	Keys     *keys.Resolver
	Producer *producer.Producer
}

func (h *EventsHandler) Handle(c echo.Context) error {
	apiKey := c.Request().Header.Get(apiKeyHeader)
	projectID, err := h.Keys.Resolve(c.Request().Context(), apiKey)
	if err != nil {
		if errors.Is(err, keys.ErrInvalidKey) {
			return echo.NewHTTPError(http.StatusUnauthorized, "invalid api key")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "key lookup failed")
	}

	var batch incomingBatch
	if err := c.Bind(&batch); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(batch.Events) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "events array required")
	}
	if len(batch.Events) > maxBatchSize {
		return echo.NewHTTPError(http.StatusRequestEntityTooLarge, "batch too large")
	}

	records := make([]producer.Event, 0, len(batch.Events))
	for _, ev := range batch.Events {
		if ev.Type == "" || ev.SessionID == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "type and session_id are required")
		}
		if ev.Timestamp.IsZero() {
			ev.Timestamp = time.Now().UTC()
		}
		props := string(ev.Properties)
		if props == "" || props == "null" {
			props = "{}"
		}
		if len(props) > maxPropertiesBytes {
			return echo.NewHTTPError(http.StatusBadRequest, "properties too large")
		}
		records = append(records, producer.Event{
			ProjectID:  projectID,
			EventType:  ev.Type,
			Timestamp:  ev.Timestamp.UTC().Format("2006-01-02 15:04:05.000"),
			SessionID:  ev.SessionID,
			PlayerID:   ev.PlayerID,
			Properties: props,
		})
	}

	if err := h.Producer.Publish(c.Request().Context(), records); err != nil {
		return echo.NewHTTPError(http.StatusBadGateway, "publish failed")
	}

	return c.JSON(http.StatusAccepted, echo.Map{"accepted": len(records)})
}
