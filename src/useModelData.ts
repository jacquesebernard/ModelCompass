import { useCallback, useEffect, useState } from "react";
import type { Connection, DataResponse } from "../shared/types";
import { api } from "./format";

export function useModelData() {
  const [data, setData] = useState<DataResponse | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const [nextData, nextConnection] = await Promise.all([
        api<DataResponse>(
          force ? "/api/refresh" : "/api/models",
          force ? {} : undefined,
        ),
        api<Connection>("/api/connection"),
      ]);
      setData(nextData);
      setConnection(nextConnection);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return { data, connection, loading, error, setError, load };
}
