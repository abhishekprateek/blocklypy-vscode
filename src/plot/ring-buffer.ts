/**
 * Ring buffer with O(1) push operations and automatic oldest-data eviction.
 * Optimized for high-frequency writes with infrequent reads.
 */
export class RingBuffer<T> {
    private buffer: T[];
    private head = 0; // Index of oldest element
    private size = 0; // Current number of elements

    constructor(private capacity: number) {
        this.buffer = new Array<T>(capacity);
    }

    /**
     * Push an item to the buffer. O(1) operation.
     * Automatically evicts oldest item when at capacity.
     */
    push(item: T): void {
        const index = (this.head + this.size) % this.capacity;
        this.buffer[index] = item;

        if (this.size < this.capacity) {
            this.size++;
        } else {
            // At capacity: overwrite oldest by moving head forward
            this.head = (this.head + 1) % this.capacity;
        }
    }

    /**
     * Convert buffer to array in chronological order. O(n) operation.
     * Should only be called infrequently (e.g., for export or initial view load).
     */
    toArray(): T[] {
        // If buffer hasn't wrapped around, just slice from head
        if (this.size < this.capacity) {
            return this.buffer.slice(0, this.size);
        }
        // If wrapped, concatenate two slices: [head...end] + [0...head]
        return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
    }

    /**
     * Get element at logical index (0 = oldest, size-1 = newest).
     */
    get(index: number): T | undefined {
        if (index < 0 || index >= this.size) {
            return undefined;
        }
        return this.buffer[(this.head + index) % this.capacity];
    }

    /**
     * Clear all elements from the buffer.
     */
    clear(): void {
        this.head = 0;
        this.size = 0;
    }

    /**
     * Current number of elements in the buffer.
     */
    get length(): number {
        return this.size;
    }

    /**
     * Apply a transformation function to each row.
     * Used for resizing when columns are added.
     */
    map<U>(fn: (item: T, index: number) => U): RingBuffer<U> {
        const newBuffer = new RingBuffer<U>(this.capacity);
        for (let i = 0; i < this.size; i++) {
            const item = this.buffer[(this.head + i) % this.capacity];
            newBuffer.push(fn(item, i));
        }
        return newBuffer;
    }
}
