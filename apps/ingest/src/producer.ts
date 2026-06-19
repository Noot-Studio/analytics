import { Kafka, CompressionTypes, logLevel } from "kafkajs";
import type { Producer } from "kafkajs";

// Rows from any topic — events, spatial cells, trajectory points — all carry a
// project_id, used as the partition key so a project's rows stay ordered.
interface KeyedRow {
  project_id: string;
}

export interface EventProducer {
  publish(topic: string, rows: KeyedRow[]): Promise<void>;
  disconnect(): Promise<void>;
}

export const createProducer = async (opts: {
  brokers: string[];
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
    async publish(topic: string, rows: KeyedRow[]): Promise<void> {
      if (rows.length === 0) {
        return;
      }
      await producer.send({
        acks: -1,
        compression: CompressionTypes.None,
        messages: rows.map((row) => ({
          key: row.project_id,
          value: JSON.stringify(row),
        })),
        topic,
      });
    },
  };
};
