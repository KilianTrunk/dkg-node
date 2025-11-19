/**
 * Lightweight service container for dependency injection
 * Follows the existing plugin pattern without external dependencies
 */
export class ServiceContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, () => any>();

  /**
   * Register a service instance
   */
  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  /**
   * Register a service factory (lazy initialization)
   */
  registerFactory<T>(name: string, factory: () => T): void {
    this.factories.set(name, factory as () => any);
  }

  /**
   * Get a service by name
   */
  get<T>(name: string): T {
    // Check if already instantiated
    if (this.services.has(name)) {
      return this.services.get(name) as T;
    }

    // Check if factory exists
    if (this.factories.has(name)) {
      const factory = this.factories.get(name)!;
      const service = factory();
      this.services.set(name, service);
      return service as T;
    }

    throw new Error(`Service "${name}" not found in container`);
  }

  /**
   * Check if a service exists
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return [...this.services.keys(), ...this.factories.keys()];
  }

  /**
   * Clear all services (useful for testing)
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
  }
}
