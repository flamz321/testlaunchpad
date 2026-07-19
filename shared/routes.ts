import { z } from 'zod';
import { insertLaunchSchema, launches, users } from './schema';

export const errorSchemas = {
  validation: z.object({ message: z.string(), field: z.string().optional() }),
  notFound: z.object({ message: z.string() }),
  internal: z.object({ message: z.string() }),
};

export const api = {
  launches: {
    list: {
      method: 'GET' as const,
      path: '/api/launches' as const,
      responses: {
        200: z.array(z.custom<typeof launches.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/launches/:id' as const,
      responses: {
        200: z.custom<typeof launches.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  stats: {
    get: {
      method: 'GET' as const,
      path: '/api/stats' as const,
      responses: {
        200: z.object({
          totalUsers: z.number(),
          totalLaunches: z.number(),
        }),
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type LaunchResponse = z.infer<typeof api.launches.get.responses[200]>;
export type LaunchesListResponse = z.infer<typeof api.launches.list.responses[200]>;
