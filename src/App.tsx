import { Routes, Route, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import Layout from "./components/Layout";
import AccountLayout from "./components/AccountLayout";
import AuthGuard from "./components/AuthGuard";
import OnboardingGuard from "./components/OnboardingGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import Landing from "./pages/Landing";

import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import EventTypes from "./pages/EventTypes";
import Bookings from "./pages/Bookings";
import EventTypeForm from "./pages/EventTypeForm";
import Forms from "./pages/Forms";
import FormBuilder from "./pages/FormBuilder";
import FormResponses from "./pages/FormResponses";
import Contacts from "./pages/Contacts";
import ContactDetail from "./pages/ContactDetail";
import Workflows from "./pages/Workflows";
import WorkflowBuilder from "./pages/WorkflowBuilder";
import Settings from "./pages/Settings";
import ApiKeys from "./pages/ApiKeys";
import Profile from "./pages/Profile";
import Billing from "./pages/Billing";
import AuthCallback from "./pages/AuthCallback";
import CalendarCallback from "./pages/CalendarCallback";
import Docs from "./pages/Docs";
import PublicBooking from "./pages/PublicBooking";
import PublicForm from "./pages/PublicForm";

// ─── Redirect /app to first project's dashboard ──────────────────────────────

function DashboardRedirect() {
  const { data: projects, isLoading } = useQuery<{ id: string }[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.projects ?? data;
    },
  });

  if (isLoading) return null;

  if (!projects || projects.length === 0) {
    return <Navigate to="/app/onboarding" replace />;
  }

  return <Navigate to={`/app/projects/${projects[0].id}`} replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/docs" element={<Docs />} />

      <Route
        path="/api/auth/callback/:provider"
        element={<AuthCallback />}
      />
      <Route
        path="/api/integrations/gcal/callback"
        element={<CalendarCallback />}
      />

      {/* Onboarding -- full screen, no sidebar */}
      <Route
        path="/app/onboarding"
        element={
          <ErrorBoundary>
            <AuthGuard>
              <Onboarding />
            </AuthGuard>
          </ErrorBoundary>
        }
      />

      {/* Account pages -- separate layout */}
      <Route
        path="/app/account"
        element={
          <ErrorBoundary>
            <AuthGuard>
              <AccountLayout />
            </AuthGuard>
          </ErrorBoundary>
        }
      >
        <Route index element={<Profile />} />
        <Route path="billing" element={<Billing />} />
      </Route>

      {/* /app -- main dashboard layout */}
      <Route
        path="/app"
        element={
          <ErrorBoundary>
            <AuthGuard>
              <OnboardingGuard>
                <Layout />
              </OnboardingGuard>
            </AuthGuard>
          </ErrorBoundary>
        }
      >
        <Route index element={<DashboardRedirect />} />
        <Route path="new-project" element={<Onboarding mode="new-project" />} />

        {/* Project-scoped routes */}
        <Route path="projects/:projectId" element={<Dashboard />} />
        <Route path="projects/:projectId/event-types" element={<EventTypes />} />
        <Route path="projects/:projectId/event-types/new" element={<EventTypeForm />} />
        <Route path="projects/:projectId/event-types/:eventTypeId" element={<EventTypeForm />} />
        <Route path="projects/:projectId/bookings" element={<Bookings />} />
        <Route path="projects/:projectId/forms" element={<Forms />} />
        <Route path="projects/:projectId/forms/new" element={<FormBuilder />} />
        <Route path="projects/:projectId/forms/:formId" element={<FormBuilder />} />
        <Route path="projects/:projectId/forms/:formId/responses" element={<FormResponses />} />
        <Route path="projects/:projectId/contacts" element={<Contacts />} />
        <Route path="projects/:projectId/contacts/:contactId" element={<ContactDetail />} />
        <Route path="projects/:projectId/workflows" element={<Workflows />} />
        <Route path="projects/:projectId/workflows/:workflowId" element={<WorkflowBuilder />} />
        <Route path="projects/:projectId/settings" element={<Settings />} />
        <Route path="projects/:projectId/api-keys" element={<ApiKeys />} />
      </Route>

      {/* Public form page */}
      <Route path="/f/:formSlug" element={<PublicForm />} />

      {/* Public booking page — must be last (catch-all 2-segment pattern) */}
      <Route path="/:projectSlug/:eventSlug" element={<PublicBooking />} />
    </Routes>
  );
}

export default App;
