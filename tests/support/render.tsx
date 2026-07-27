import type { ReactElement } from "react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  render,
  type RenderResult,
} from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";

export interface RenderRouteOptions {
  route: string;
  routePattern: string;
}

export function renderRoute(
  element: ReactElement,
  options: RenderRouteOptions,
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
  const rendered = render(
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[options.route]}>
          <Routes>
            <Route path={options.routePattern} element={element} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </HelmetProvider>,
  );

  return Object.assign(rendered, { queryClient });
}
