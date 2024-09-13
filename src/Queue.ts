export default class Queue<T> {
  #entries: T[] = [];
  #running: boolean = false;
  #handler: ((entry: T) => void) | undefined;

  constructor(handler?: (entry: T) => void) {
    this.#handler = handler;
  }

  get length() {
    return this.#entries.length;
  }

  enqueue(entry: T) {
    this.#entries.push(entry)

    if (this.#running === false) {
      this.next();
    }
  };

  dequeue() {
    return this.#entries.splice(0, 1)[0];
  }

  peek() {
    return this.#entries.slice(0, 1)[0];
  }

  next() {
    const entry = this.dequeue()

    if (!entry || !this.#handler) {
      this.#running = false;
      return;
    }

    this.#handler(entry);

    if (this.length > 0) {
      this.next();
    }
  }
}
