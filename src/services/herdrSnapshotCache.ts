import AsyncStorage from '@react-native-async-storage/async-storage';

import { settledPromise } from '../lib/promises';
import type { HerdrSnapshot } from '../types';
import { reportBackgroundFailure } from './backgroundOperations';

const KEY_PREFIX = 'herdr.host.snapshot.v1.';
const WRITE_DELAY_MS = 1500;

export interface CachedHerdrSnapshot {
  snapshot: HerdrSnapshot;
  updatedAt: number;
}

/** Keep one pending metadata snapshot per host; transcript and terminal data have separate caches. */
export class HerdrSnapshotCache {
  private pending = new Map<string, HerdrSnapshot>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private writes = new Map<string, Promise<void>>();

  schedule(hostId: string, snapshot: HerdrSnapshot): void {
    if (!snapshot.server.running) return;
    // Herdr panes and layouts are metadata only. Terminal output is stored by
    // the terminal renderer, so this remains a small snapshot.
    this.pending.set(hostId, snapshot);
    if (this.timers.has(hostId)) return;
    this.timers.set(hostId, setTimeout(() => {
      this.timers.delete(hostId);
      const latest = this.pending.get(hostId);
      this.pending.delete(hostId);
      if (!latest) return;
      const cached: CachedHerdrSnapshot = {
        updatedAt: Date.now(),
        snapshot: latest,
      };
      const previous = this.writes.get(hostId) ?? Promise.resolve();
      const write = settledPromise(previous).then(() =>
        AsyncStorage.setItem(`${KEY_PREFIX}${hostId}`, JSON.stringify(cached)),
      );
      this.writes.set(hostId, write);
      reportBackgroundFailure(write, 'herdr-snapshot-cache-write');
    }, WRITE_DELAY_MS));
  }

  async load(hostId: string): Promise<CachedHerdrSnapshot | null> {
    await settledPromise(this.writes.get(hostId) ?? Promise.resolve());
    const raw = await AsyncStorage.getItem(`${KEY_PREFIX}${hostId}`);
    if (!raw) return null;
    try {
      const cached = JSON.parse(raw) as CachedHerdrSnapshot;
      if (!cached?.snapshot || !Array.isArray(cached.snapshot.agents)
        || !Array.isArray(cached.snapshot.workspaces)
        || !Array.isArray(cached.snapshot.tabs)) return null;
      return cached;
    } catch {
      return null;
    }
  }

  async delete(hostId: string): Promise<void> {
    const timer = this.timers.get(hostId);
    if (timer) clearTimeout(timer);
    this.timers.delete(hostId);
    this.pending.delete(hostId);
    await settledPromise(this.writes.get(hostId) ?? Promise.resolve());
    await AsyncStorage.removeItem(`${KEY_PREFIX}${hostId}`);
  }
}

export const herdrSnapshotCache = new HerdrSnapshotCache();
