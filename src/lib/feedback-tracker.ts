// Feedback tracking — thumbs up/down on AI responses

const FEEDBACK_KEY = 'localdev-feedback';

export interface Feedback {
  id: string;
  messageId: string;
  conversationId?: string;
  rating: 'up' | 'down';
  agentType?: string;
  timestamp: number;
}

export interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  successRate: number;
  byAgent: Record<string, { up: number; down: number }>;
}

function loadFeedback(): Feedback[] {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFeedback(items: Feedback[]): void {
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(items.slice(0, 500)));
}

export function addFeedback(messageId: string, rating: 'up' | 'down', agentType?: string, conversationId?: string): Feedback {
  const items = loadFeedback();
  // Remove existing feedback for this message
  const filtered = items.filter(f => f.messageId !== messageId);
  const feedback: Feedback = {
    id: crypto.randomUUID(),
    messageId,
    conversationId,
    rating,
    agentType,
    timestamp: Date.now(),
  };
  filtered.unshift(feedback);
  saveFeedback(filtered);
  return feedback;
}

export function getFeedback(messageId: string): Feedback | null {
  return loadFeedback().find(f => f.messageId === messageId) || null;
}

export function getFeedbackStats(): FeedbackStats {
  const items = loadFeedback();
  const positive = items.filter(f => f.rating === 'up').length;
  const negative = items.filter(f => f.rating === 'down').length;
  const total = items.length;

  const byAgent: Record<string, { up: number; down: number }> = {};
  for (const item of items) {
    const agent = item.agentType || 'general';
    if (!byAgent[agent]) byAgent[agent] = { up: 0, down: 0 };
    byAgent[agent][item.rating]++;
  }

  return {
    total,
    positive,
    negative,
    successRate: total > 0 ? positive / total : 0,
    byAgent,
  };
}

export function clearFeedback(): void {
  localStorage.removeItem(FEEDBACK_KEY);
}
