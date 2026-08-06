export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;

  constructor(createFn: () => T, resetFn: (obj: T) => void, initialSize = 20) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  acquire(): T {
    return this.pool.pop() ?? this.createFn();
  }

  release(obj: T): void {
    this.resetFn(obj);
    this.pool.push(obj);
  }
}
