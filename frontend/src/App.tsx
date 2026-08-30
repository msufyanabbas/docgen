import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import Shell from './components/Shell';
import { TourProvider } from './components/Tour';
import { ThemeProvider } from './components/Theme';
import { AuthProvider, useAuth } from './lib/auth';
import type { Action, Resource } from './lib/permissions';
import { Spinner } from './components/ui/Feedback';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import GclListPage from './pages/GclListPage';
import CreateGclPage from './pages/CreateGclPage';
import UploadPage from './pages/UploadPage';
import PackageDetailPage from './pages/PackageDetailPage';
import UplPage from './pages/UplPage';
import ProjectsPage from './pages/ProjectsPage';
import CategoriesPage from './pages/CategoriesPage';
import MopListPage from './pages/MopListPage';
import MopNewPage from './pages/MopNewPage';
import UsersPage from './pages/UsersPage';
import AccountPage from './pages/AccountPage';

/** Everything except /login sits behind this. */
function Protected({
  children,
  resource,
  action = 'view',
}: {
  children: ReactNode;
  resource?: Resource;
  action?: Action;
}) {
  const { user, loading, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Checking your session…" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // Landing somewhere they can't see sends them home rather than showing an
  // empty screen — the API would refuse the request anyway.
  if (resource && !can(resource, action)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/*"
        element={
          <Protected>
            <TourProvider>
              <Shell>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />

                  <Route path="/gcl" element={<Protected resource="gcl"><GclListPage /></Protected>} />
                  <Route path="/gcl/create" element={<Protected resource="gcl" action="create"><CreateGclPage /></Protected>} />
                  {/* Old links keep working. */}
                  <Route path="/create-gcl" element={<Navigate to="/gcl" replace />} />
                  <Route path="/upload" element={<Navigate to="/gcl" replace />} />
                  <Route path="/gcl/upload" element={<Protected resource="gcl" action="create"><UploadPage /></Protected>} />
                  <Route path="/packages" element={<Navigate to="/gcl" replace />} />

                  <Route path="/mop" element={<Protected resource="mop"><MopListPage /></Protected>} />
                  <Route path="/mop/new" element={<Protected resource="mop" action="create"><MopNewPage /></Protected>} />

                  <Route path="/packages/:id" element={<PackageDetailPage />} />
                  <Route
                    path="/upl"
                    element={
                      <Protected resource="priceList">
                        <UplPage />
                      </Protected>
                    }
                  />

                  <Route path="/projects" element={<Protected resource="projects"><ProjectsPage /></Protected>} />
                  <Route path="/categories/projects" element={<Protected resource="projectCategories"><CategoriesPage tab="projects" /></Protected>} />
                  <Route path="/categories/mops" element={<Protected resource="mopCategories"><CategoriesPage tab="mops" /></Protected>} />

                  <Route path="/account" element={<AccountPage />} />
                  <Route
                    path="/users"
                    element={
                      <Protected resource="users">
                        <UsersPage />
                      </Protected>
                    }
                  />
                  <Route path="*" element={<div className="text-fg-subtle">Page not found.</div>} />
                </Routes>
              </Shell>
            </TourProvider>
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
