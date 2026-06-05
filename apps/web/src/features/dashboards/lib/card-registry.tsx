import type {
  CardSizeValue,
  CustomCardConfig,
  DashboardCardType,
} from "@sbox-analytics/api/dashboard-cards";
import { CUSTOM_CARD_TYPE } from "@sbox-analytics/api/dashboard-cards";
import type { ComponentType } from "react";

import {
  EventsByTypeCard,
  EventsPerDayCard,
  MetricEventsCard,
  MetricPlayersCard,
  MetricSessionsCard,
} from "../components/molecules/builtin-cards";
import { CustomStatCard } from "../components/molecules/custom-stat-card";

export interface CardRendererProps {
  config: unknown;
  from: string;
  /** Set for org dashboards; scopes org-wide cards to this organization. */
  organizationId?: string;
  /** Set for project dashboards; org cards fall back to their config pin. */
  projectId?: string;
  to: string;
}

export interface CardDefinition {
  defaultSize: CardSizeValue;
  description: string;
  Renderer: ComponentType<CardRendererProps>;
  title: string;
}

export const CARD_REGISTRY: Record<DashboardCardType, CardDefinition> = {
  "chart.events-per-day": {
    Renderer: EventsPerDayCard,
    defaultSize: "Full",
    description: "Area chart of total events per day.",
    title: "Events per day",
  },
  "custom.stat": {
    Renderer: CustomStatCard,
    defaultSize: "Third",
    description: "A statistic you define from your own events.",
    title: "Custom statistic",
  },
  "list.events-by-type": {
    Renderer: EventsByTypeCard,
    defaultSize: "Full",
    description: "Event totals broken down by type.",
    title: "Events by type",
  },
  "metric.events": {
    Renderer: MetricEventsCard,
    defaultSize: "Third",
    description: "Total events with period-over-period trend.",
    title: "Total Events",
  },
  "metric.players": {
    Renderer: MetricPlayersCard,
    defaultSize: "Third",
    description: "Unique players summed per day, with trend.",
    title: "Unique Players",
  },
  "metric.sessions": {
    Renderer: MetricSessionsCard,
    defaultSize: "Third",
    description: "Sessions summed per day, with trend.",
    title: "Sessions",
  },
};

export const getCardDefinition = (
  cardType: string
): CardDefinition | undefined =>
  Object.hasOwn(CARD_REGISTRY, cardType)
    ? CARD_REGISTRY[cardType as DashboardCardType]
    : undefined;

export { CUSTOM_CARD_TYPE };

/** Timeseries custom cards fill a row; single-number ones take a third. */
export const customCardSize = (config: CustomCardConfig): CardSizeValue =>
  config.display === "timeseries" ? "Full" : "Third";
