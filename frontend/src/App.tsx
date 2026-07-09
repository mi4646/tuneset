import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import QrLogin from "./pages/QrLogin";
import SonglistInput from "./pages/SonglistInput";
import ClassifyWorkbench from "./pages/ClassifyWorkbench";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import ProfileShared from "./pages/ProfileShared";
import { AuthProvider } from "./components/AuthProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/qr" element={<QrLogin />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/songlist" element={<SonglistInput />} />
                <Route path="/classify/:threadId" element={<ClassifyWorkbench />} />
                <Route path="/profile" element={<Profile />} />
                <Route
                  path="/settings"
                  element={
                    <AdminRoute>
                      <Settings />
                    </AdminRoute>
                  }
                />
              </Route>
            </Route>
            <Route path="/profile/shared/:token" element={<ProfileShared />} />
            <Route path="*" element={<Navigate to="/songlist" replace />} />
          </Routes>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
