import fastq, { queueAsPromised } from 'fastq';

/**
 * Configuration for backpressure monitoring thresholds
 */
export interface BackpressureConfig {
    /** Queue size at which to log warnings (default: 100) */
    warningThreshold?: number;
    /** Queue size at which to log errors (default: 500) */
    errorThreshold?: number;
    /** Queue size at which to drop data (default: 1000) */
    criticalThreshold?: number;
    /** Name of the queue for logging purposes */
    name?: string;
    /** Concurrency level for the queue (default: 1) */
    concurrency?: number;
}

/**
 * Wrapper around fastq with built-in backpressure monitoring and data dropping.
 *
 * Provides three levels of backpressure handling:
 * - WARNING: Log when queue is growing
 * - ERROR: Log error as queue approaches critical levels
 * - CRITICAL: Drop data to prevent memory exhaustion
 *
 * @example
 * ```typescript
 * const queue = new BackpressureQueue<Buffer>(
 *     async (data) => processData(data),
 *     { name: 'DataQueue', criticalThreshold: 500 }
 * );
 *
 * // Will automatically drop data if queue exceeds critical threshold
 * queue.push(someData);
 * ```
 */
export class BackpressureQueue<T> {
    private readonly queue: queueAsPromised<T>;
    private readonly config: Required<BackpressureConfig>;
    private lastWarningTime = 0;
    private readonly WARNING_THROTTLE_MS = 5000; // Throttle warnings to every 5 seconds

    constructor(worker: (task: T) => Promise<void>, config: BackpressureConfig = {}) {
        this.config = {
            warningThreshold: config.warningThreshold ?? 100,
            errorThreshold: config.errorThreshold ?? 500,
            criticalThreshold: config.criticalThreshold ?? 1000,
            name: config.name ?? 'Queue',
            concurrency: config.concurrency ?? 1,
        };

        this.queue = fastq.promise(worker, this.config.concurrency ?? 1);
    }

    /**
     * Push an item to the queue.
     * Automatically monitors backpressure and may drop the item if queue is critically full.
     *
     * @returns true if item was queued, false if it was dropped due to backpressure
     */
    async push(item: T): Promise<boolean> {
        const queueLength = this.queue.length();
        const shouldQueue = this.checkBackpressure(queueLength);

        if (shouldQueue) {
            await this.queue.push(item);
            return true;
        }

        // Data dropped due to critical backpressure
        return false;
    }

    /**
     * Push an item and wait for it to be processed.
     * Throws error if queue is at critical capacity.
     *
     * @throws Error if queue is critically full
     */
    async pushAsync(item: T): Promise<void> {
        const queueLength = this.queue.length();
        const shouldQueue = this.checkBackpressure(queueLength);

        if (!shouldQueue) {
            throw new Error(
                `[Backpressure] ${this.config.name} queue critically full. Data cannot be queued.`,
            );
        }

        await this.queue.push(item);
    }

    /**
     * Get current queue length
     */
    length(): number {
        return this.queue.length();
    }

    /**
     * Get queue idle status
     */
    idle(): boolean {
        return this.queue.idle();
    }

    /**
     * Drain the queue - wait for all items to be processed
     */
    async drain(): Promise<void> {
        return this.queue.drained();
    }

    /**
     * Kill the queue - reject all pending items
     */
    kill(): void {
        this.queue.kill();
    }

    /**
     * Pause the queue
     */
    pause(): void {
        this.queue.pause();
    }

    /**
     * Resume the queue
     */
    resume(): void {
        this.queue.resume();
    }

    /**
     * Check for backpressure and handle accordingly.
     *
     * @returns true if data should be queued, false if it should be dropped
     */
    private checkBackpressure(queueLength: number): boolean {
        const { name, warningThreshold, errorThreshold, criticalThreshold } =
            this.config;

        if (queueLength >= criticalThreshold) {
            // CRITICAL: Drop data to prevent memory exhaustion
            console.error(
                `[Backpressure CRITICAL] ${name} queue at ${queueLength} items. ` +
                    `Dropping data to prevent memory exhaustion! ` +
                    `Reduce data rate or fix processing bottleneck.`,
            );
            return false; // Drop this data
        }

        if (queueLength >= errorThreshold) {
            // ERROR: Approaching critical levels
            console.error(
                `[Backpressure ERROR] ${name} queue critically high: ${queueLength} items. ` +
                    `Data may be dropped soon. Processing is severely behind. ` +
                    `Action required: reduce data rate or optimize processing.`,
            );
            return true; // Still queue but warn
        }

        if (queueLength >= warningThreshold) {
            // WARNING: Processing falling behind (throttled to avoid log spam)
            const now = Date.now();
            if (now - this.lastWarningTime > this.WARNING_THROTTLE_MS) {
                console.warn(
                    `[Backpressure WARNING] ${name} queue growing: ${queueLength} items. ` +
                        `Processing may be falling behind.`,
                );
                this.lastWarningTime = now;
            }
            return true;
        }

        return true; // Normal operation
    }
}
