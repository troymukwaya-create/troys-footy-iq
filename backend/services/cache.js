class CacheService {
  constructor() {
    this.store = new Map();
    this.apfRequestsToday = 0;
    this.apfResetDate = new Date().toISOString().split('T')[0];
  }

  set(key, value, ttlSeconds = 60) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  delete(key) {
    this.store.delete(key);
  }

  incrementApfRequest() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.apfResetDate) {
      this.apfRequestsToday = 0;
      this.apfResetDate = today;
    }
    this.apfRequestsToday++;
  }

  async getOrSet(key, fetchFn, ttlSeconds = 60) {
    const cached = this.get(key);
    if (cached !== null) return cached;
    
    const value = await fetchFn();
    if (value !== null && value !== undefined) {
      this.set(key, value, ttlSeconds);
    }
    return value;
  }
}

export default new CacheService();
