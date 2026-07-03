import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import QrLogin from "./pages/QrLogin";
import SonglistInput from "./pages/SonglistInput";
import ClassifyWorkbench from "./pages/ClassifyWorkbench";
import { isLoggedIn } from "./api";

function Private({ children }: { children: React.ReactElement }) {
  return isLoggedIn() ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/qr" element={<QrLogin />} />
        <Route path="/songlist" element={<Private><SonglistInput /></Private>} />
        <Route path="/classify/:threadId" element={<Private><ClassifyWorkbench /></Private>} />
        <Route path="*" element={<Navigate to="/songlist" />} />
      </Routes>
    </BrowserRouter>
  );
}
