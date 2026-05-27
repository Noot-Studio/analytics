# Pricing & Economics

## Pricing Tiers

| Tier           | Price     | Limits                                                            |
| -------------- | --------- | ----------------------------------------------------------------- |
| **Hobby**      | Free      | 1 project, 10K events/month, 7-day data retention                 |
| **Indie**      | $29/month | 3 projects, 1M events/month, 90-day retention, email support      |
| **Studio**     | $99/month | 10 projects, 10M events/month, 1-year retention, priority support |
| **Enterprise** | Custom    | Unlimited, custom retention, SLA, dedicated support               |

## Infrastructure Costs

| Item                                 | Monthly Cost |
| ------------------------------------ | ------------ |
| OVH VPS (8 vCores, 24GB RAM)         | ~€25 (~$27)  |
| Domain + SSL (Cloudflare)            | ~$10–$20     |
| Polar.sh (payments)                  | ~$25         |
| Monitoring (Grafana Cloud free tier) | $0           |
| Backup storage (S3/Backblaze)        | ~$10         |
| **Total**                            | **~$72/month** |

## Notes

- All services (Postgres, ClickHouse, Redis, Kafka/Redpanda) self-hosted on the VPS via Docker/Dokploy
- Grafana Cloud free tier covers 3 users, 10K metrics — sufficient for early stage
- Backup strategy: daily PostgreSQL + ClickHouse dumps to S3/Backblaze B2
- Scaling trigger: when VPS CPU/memory sustained >70%, evaluate managed ClickHouse/Kafka or second VPS

## Revenue Targets

- Beta phase: $0 MRR
- Early paid traction: $500 MRR
- Product-market fit signal: $2,000 MRR
- Sustainable scale: $10,000 MRR
