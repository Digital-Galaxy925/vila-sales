import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";

const AppLayout = () => {
  return (
    <div className="min-h-screen" style={{ background: "#0b1120" }}>
      <AppSidebar />
      <main className="ml-64" style={{ background: "#0b1120" }}>
        <Outlet />
      </main>
    </div>
  );
};

export default AppLayout;
