/**
 * Simple in-memory cache for workflow results
 */
export class WorkflowCache {
  private cache = new Map<string, { result: any; timestamp: number; ttl: number }>();

  set(key: string, value: any, ttl: number = 3600000): void {
    this.cache.set(key, { result: value, timestamp: Date.now(), ttl });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
