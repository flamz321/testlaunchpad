import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useLaunches() {
  return useQuery({
    queryKey: [api.launches.list.path],
    queryFn: async () => {
      const res = await fetch(api.launches.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch launches");
      const data = await res.json();
      return api.launches.list.responses[200].parse(data);
    },
    staleTime: 90_000,
    refetchInterval: 2 * 60 * 1000,
  });
}

export function useLaunch(id: number) {
  return useQuery({
    queryKey: [api.launches.get.path, id],
    queryFn: async () => {
      const res = await fetch(api.launches.get.path.replace(":id", id.toString()), {
        credentials: "include",
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch launch details");
      const data = await res.json();
      return api.launches.get.responses[200].parse(data);
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}
