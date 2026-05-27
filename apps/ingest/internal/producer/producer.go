package producer

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/twmb/franz-go/pkg/kgo"
)

type Producer struct {
	client *kgo.Client
	topic  string
}

func New(brokers []string, topic string) (*Producer, error) {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(brokers...),
		kgo.DefaultProduceTopic(topic),
		kgo.ProducerLinger(0),
		kgo.RequiredAcks(kgo.AllISRAcks()),
	)
	if err != nil {
		return nil, fmt.Errorf("create kafka client: %w", err)
	}
	return &Producer{client: client, topic: topic}, nil
}

func (p *Producer) Close() {
	p.client.Close()
}

// Event matches the ClickHouse Kafka engine schema (JSONEachRow).
type Event struct {
	ProjectID  string `json:"project_id"`
	EventType  string `json:"event_type"`
	Timestamp  string `json:"timestamp"`
	SessionID  string `json:"session_id"`
	PlayerID   string `json:"player_id"`
	Properties string `json:"properties"`
}

func (p *Producer) Publish(ctx context.Context, events []Event) error {
	records := make([]*kgo.Record, 0, len(events))
	for _, ev := range events {
		payload, err := json.Marshal(ev)
		if err != nil {
			return fmt.Errorf("marshal event: %w", err)
		}
		records = append(records, &kgo.Record{
			Key:   []byte(ev.ProjectID),
			Value: payload,
		})
	}
	results := p.client.ProduceSync(ctx, records...)
	return results.FirstErr()
}
