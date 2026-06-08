import { Kafka, CompressionTypes, logLevel } from "kafkajs";
import type { Producer } from "kafkajs";

import type { ClickHouseEvent } from "./schema";

export interface EventProducer {
  publish(events: ClickHouseEvent[]): Promise<void>;
  disconnect(): Promise<void>;
}

export const createProducer = async (opts: {
  brokers: string[];
  topic: string;
}): Promise<EventProducer> => {
  const kafka = new Kafka({
    brokers: opts.brokers,
    clientId: "sbox-ingest",
    logLevel: logLevel.ERROR,
  });

  const producer: Producer = kafka.producer({
    allowAutoTopicCreation: false,
    idempotent: false,
  });

  await producer.connect();

  return {
    async disconnect(): Promise<void> {
      await producer.disconnect();
    },
    async publish(events: ClickHouseEvent[]): Promise<void> {
      await producer.send({
        acks: -1,
        compression: CompressionTypes.None,
        messages: events.map((ev) => ({
          key: ev.project_id,
          value: JSON.stringify(ev),
        })),
        topic: opts.topic,
      });
    },
  };
};
