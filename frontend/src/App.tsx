import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import Shell from './components/Shell';
import { TourProvider } from './components/Tour';
import { ThemeProvider } from './components/Theme';
import { AuthProvider, useAuth } from './lib/auth';
import { Spinner } from './components/ui/Feedback';
import LoginPage from './pages/LoginPage';
import UploadPage from './pages/UploadPage';
import CreateGclPage from './pages/CreateGclPage';
import PackagesPage from './pages/PackagesPage';
import PackageDetailPage from './pages/PackageDetailPage';
import UplPage from './pages/UplPage';
import ProjectsPage from './pages/ProjectsPage';
import MopPage from './pages/MopPage';
import UsersPage from './pages/UsersPage';
import AccountPage from './pages/AccountPage';

/** Everything except /login sits behind this. */
function Protected({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
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
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
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
                  <Route path="/" element={<Navigate to="/create-gcl" replace />} />
                  <Route path="/create-gcl" element={<CreateGclPage />} />
                  <Route path="/upload" element={<UploadPage />} />
                  <Route path="/packages" element={<PackagesPage />} />
                  <Route path="/packages/:id" element={<PackageDetailPage />} />
                  <Route path="/upl" element={<UplPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/mop/:slug" element={<MopPage />} />
                  <Route path="/mop" element={<MopPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route
                    path="/users"
                    element={
                      <Protected adminOnly>
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
