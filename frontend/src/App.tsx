import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import QrLogin from "./pages/QrLogin";
import SonglistInput from "./pages/SonglistInput";
import ClassifyWorkbench from "./pages/ClassifyWorkbench";
import { AuthProvider } from "./components/AuthProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";

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
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/songlist" replace />} />
          </Routes>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
