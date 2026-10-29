import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CostMode,
  Filters,
  Priority,
  Ranking,
  Requirements,
  Workload,
} from "../shared/types";
import { api } from "./format";

type Props = {
  filters: Filters;
  workload: Workload;
  priority: Priority;
  costMode: CostMode;
  requirements: Requirements | null;
  dataFetchedAt?: string;
  advisorBusy: boolean;
  setError: (error: string) => void;
};

export function useRanking({
  filters,
  workload,
  priority,
  costMode,
  requirements,
  dataFetchedAt,
  advisorBusy,
  setError,
}: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [rankingBusy, setRankingBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const rankAbort = useRef<AbortController | null>(null);
  const rankingRef = useRef(ranking);
  const rankRef = useRef<() => Promise<void>>(() => Promise.resolve());
  rankingRef.current = ranking;

  const acceptRanking = useCallback((next: Ranking) => {
    setRanking(next);
    setSelected(
      next.recommendations.map((recommendation) => recommendation.modelId),
    );
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setNotice("");
    setSelected((ids) => {
      if (ids.includes(id))
        return ids.filter((selectedId) => selectedId !== id);
      if (ids.length >= 3) {
        setNotice("You can compare up to 3 models. Remove one to add another.");
        return ids;
      }
      return [...ids, id];
    });
  }, []);

  const clearComparison = useCallback(() => {
    setSelected([]);
    setRanking(null);
  }, []);

  const resetComparison = useCallback(() => {
    clearComparison();
    setNotice("");
  }, [clearComparison]);

  const rank = useCallback(async () => {
    rankAbort.current?.abort();
    const controller = new AbortController();
    rankAbort.current = controller;
    setRankingBusy(true);
    setError("");
    try {
      const result = await api<Ranking>(
        "/api/rank",
        {
          filters,
          workload,
          priority,
          costMode,
          ...(requirements ? { requirements } : {}),
        },
        controller.signal,
      );
      acceptRanking(result);
    } catch (cause) {
      if ((cause as Error).name !== "AbortError")
        setError((cause as Error).message);
    } finally {
      if (rankAbort.current === controller) setRankingBusy(false);
    }
  }, [
    filters,
    workload,
    priority,
    costMode,
    requirements,
    setError,
    acceptRanking,
  ]);

  rankRef.current = rank;
  const filtersKey = JSON.stringify(filters);
  const workloadKey = JSON.stringify(workload);
  // Key this debounce to ranking inputs, so accepting a ranking does not
  // schedule a duplicate request. Refs keep the scheduled call current.
  useEffect(() => {
    if (!rankingRef.current || advisorBusy) return;
    const timer = setTimeout(() => void rankRef.current(), 350);
    return () => clearTimeout(timer);
  }, [
    filtersKey,
    workloadKey,
    priority,
    costMode,
    requirements,
    dataFetchedAt,
    advisorBusy,
  ]);

  useEffect(() => () => rankAbort.current?.abort(), []);

  return {
    selected,
    ranking,
    rankingBusy,
    notice,
    acceptRanking,
    toggleSelect,
    clearComparison,
    resetComparison,
    rank,
  };
}
