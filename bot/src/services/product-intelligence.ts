import { eq, desc } from 'drizzle-orm';
import { db } from '../db/connection';
import { productSignals } from '../db/schema';

export interface RoadmapItem {
  description: string;
  type: string;
  category: string | null;
  count: number;
  severityScore: number;
  businesses: string[];
  quotes: string[];
}

export interface ChurnCategory {
  category: string;
  count: number;
  descriptions: string[];
  businesses: string[];
}

export interface SignalBreakdown {
  [type: string]: number;
}

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export async function getProductRoadmap(limit = 10): Promise<RoadmapItem[]> {
  const signals = db
    .select()
    .from(productSignals)
    .orderBy(desc(productSignals.createdAt))
    .all();

  // Group by description (normalized)
  const grouped: Record<string, {
    type: string;
    category: string | null;
    count: number;
    severityScore: number;
    businesses: Set<string>;
    quotes: string[];
  }> = {};

  for (const signal of signals) {
    const key = signal.description.trim().toLowerCase();
    if (!grouped[key]) {
      grouped[key] = {
        type: signal.type,
        category: signal.category ?? null,
        count: 0,
        severityScore: 0,
        businesses: new Set(),
        quotes: [],
      };
    }
    grouped[key].count += 1;
    grouped[key].severityScore += SEVERITY_WEIGHTS[signal.severity ?? 'low'] ?? 1;
    if (signal.businessName) {
      grouped[key].businesses.add(signal.businessName);
    }
    if (signal.verbatimQuote && grouped[key].quotes.length < 3) {
      grouped[key].quotes.push(signal.verbatimQuote);
    }
  }

  // Sort by severityScore * count descending
  const sorted = Object.entries(grouped)
    .map(([description, data]) => ({
      description,
      type: data.type,
      category: data.category,
      count: data.count,
      severityScore: data.severityScore * data.count,
      businesses: Array.from(data.businesses),
      quotes: data.quotes,
    }))
    .sort((a, b) => b.severityScore - a.severityScore)
    .slice(0, limit);

  return sorted;
}

export async function getChurnIntelligence(): Promise<ChurnCategory[]> {
  const signals = db
    .select()
    .from(productSignals)
    .where(eq(productSignals.type, 'churn_reason'))
    .orderBy(desc(productSignals.createdAt))
    .all();

  // Group by category
  const grouped: Record<string, {
    count: number;
    descriptions: string[];
    businesses: Set<string>;
  }> = {};

  for (const signal of signals) {
    const cat = signal.category ?? 'uncategorized';
    if (!grouped[cat]) {
      grouped[cat] = { count: 0, descriptions: [], businesses: new Set() };
    }
    grouped[cat].count += 1;
    if (!grouped[cat].descriptions.includes(signal.description)) {
      grouped[cat].descriptions.push(signal.description);
    }
    if (signal.businessName) {
      grouped[cat].businesses.add(signal.businessName);
    }
  }

  return Object.entries(grouped)
    .map(([category, data]) => ({
      category,
      count: data.count,
      descriptions: data.descriptions,
      businesses: Array.from(data.businesses),
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getSignalBreakdown(): Promise<SignalBreakdown> {
  const signals = db
    .select()
    .from(productSignals)
    .all();

  const breakdown: SignalBreakdown = {};
  for (const signal of signals) {
    breakdown[signal.type] = (breakdown[signal.type] ?? 0) + 1;
  }
  return breakdown;
}
